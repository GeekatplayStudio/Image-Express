'use client';

/**
 * Embroidery export pipeline: canvas image → reduced color palette →
 * scanline (tatami) fill stitches per color → Tajima .DST file.
 *
 * DST is the closest thing to a universal machine format — nearly every
 * commercial and hobby machine reads it. It stores stitch movements in
 * 0.1mm units with color-change stops (thread colors themselves are chosen
 * on the machine, which is standard for DST).
 */

export type EmbroideryOptions = {
    /** Number of thread colors to reduce the design to (2–12). */
    colorCount: number;
    /** Physical output width in millimetres; height follows the aspect ratio. */
    widthMm: number;
    /** Spacing between fill rows in millimetres (lower = denser). */
    rowSpacingMm: number;
    /** Maximum stitch length in millimetres. */
    stitchLengthMm: number;
    /** Drop transparent pixels AND the palette color that dominates the border. */
    omitBackground: boolean;
};

export type EmbroideryPaletteEntry = {
    r: number;
    g: number;
    b: number;
    stitches: number;
    isBackground: boolean;
};

/** One thread block's path, in preview-canvas pixel coordinates. */
export type EmbroideryThreadPath = {
    color: { r: number; g: number; b: number };
    points: Array<{ x: number; y: number; jump: boolean }>;
};

export type EmbroideryPlan = {
    palette: EmbroideryPaletteEntry[];
    totalStitches: number;
    colorChanges: number;
    /** Thread jumps in the file — high counts mean lots of machine trims. */
    jumpCount: number;
    /** Exact geometry being encoded, for drawing and stitch-by-stitch replay. */
    threads: EmbroideryThreadPath[];
    previewWidth: number;
    previewHeight: number;
    threadWidth: number;
    widthMm: number;
    heightMm: number;
    dstBytes: Uint8Array;
};

const DST_MAX_DELTA = 121;

type Stitch = { x: number; y: number; jump: boolean; colorChange: boolean };
type StitchPoint = { x: number; y: number; jump: boolean };

/** Median-cut color quantization over RGB pixels. */
function medianCutPalette(pixels: Uint8ClampedArray, opaque: number[], colorCount: number): number[][] {
    type Bucket = number[]; // pixel indices
    let buckets: Bucket[] = [opaque];

    while (buckets.length < colorCount) {
        // Split the bucket with the widest channel range.
        let widestBucket = -1;
        let widestChannel = 0;
        let widestRange = -1;
        buckets.forEach((bucket, index) => {
            if (bucket.length < 2) return;
            for (let channel = 0; channel < 3; channel++) {
                let min = 255, max = 0;
                for (const px of bucket) {
                    const v = pixels[px * 4 + channel];
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
                if (max - min > widestRange) {
                    widestRange = max - min;
                    widestBucket = index;
                    widestChannel = channel;
                }
            }
        });
        if (widestBucket < 0 || widestRange <= 0) break;

        const bucket = buckets[widestBucket];
        bucket.sort((a, b) => pixels[a * 4 + widestChannel] - pixels[b * 4 + widestChannel]);
        const half = Math.floor(bucket.length / 2);
        buckets.splice(widestBucket, 1, bucket.slice(0, half), bucket.slice(half));
    }

    return buckets
        .filter((bucket) => bucket.length > 0)
        .map((bucket) => {
            let r = 0, g = 0, b = 0;
            for (const px of bucket) {
                r += pixels[px * 4];
                g += pixels[px * 4 + 1];
                b += pixels[px * 4 + 2];
            }
            return [Math.round(r / bucket.length), Math.round(g / bucket.length), Math.round(b / bucket.length)];
        });
}

function nearestPaletteIndex(palette: number[][], r: number, g: number, b: number): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
        const dr = palette[i][0] - r;
        const dg = palette[i][1] - g;
        const db = palette[i][2] - b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    }
    return best;
}

/** Encodes one DST 3-byte stitch record. dx/dy must be within ±121. */
function encodeDstRecord(dx: number, dy: number, jump: boolean, colorChange: boolean): [number, number, number] {
    let b0 = 0, b1 = 0, b2 = 0;
    let x = dx;
    let y = dy;
    if (x > 40) { b2 |= 0x04; x -= 81; }
    if (x < -40) { b2 |= 0x08; x += 81; }
    if (y > 40) { b2 |= 0x20; y -= 81; }
    if (y < -40) { b2 |= 0x10; y += 81; }
    if (x > 13) { b1 |= 0x04; x -= 27; }
    if (x < -13) { b1 |= 0x08; x += 27; }
    if (y > 13) { b1 |= 0x20; y -= 27; }
    if (y < -13) { b1 |= 0x10; y += 27; }
    if (x > 4) { b0 |= 0x04; x -= 9; }
    if (x < -4) { b0 |= 0x08; x += 9; }
    if (y > 4) { b0 |= 0x20; y -= 9; }
    if (y < -4) { b0 |= 0x10; y += 9; }
    if (x > 1) { b1 |= 0x01; x -= 3; }
    if (x < -1) { b1 |= 0x02; x += 3; }
    if (y > 1) { b1 |= 0x80; y -= 3; }
    if (y < -1) { b1 |= 0x40; y += 3; }
    if (x === 1) { b0 |= 0x01; x -= 1; }
    if (x === -1) { b0 |= 0x02; x += 1; }
    if (y === 1) { b0 |= 0x80; y -= 1; }
    if (y === -1) { b0 |= 0x40; y += 1; }

    b2 |= 0x03; // always-set bits in the DST record
    if (jump) b2 |= 0x80;
    if (colorChange) b2 |= 0xC0;
    return [b0, b1, b2];
}

/** Builds the full DST byte stream (512-byte header + records + end record). */
function encodeDst(stitches: Stitch[], designName: string): Uint8Array {
    // Convert absolute positions to per-record deltas, splitting long moves.
    const records: Array<[number, number, number]> = [];
    let px = 0, py = 0;
    let minX = 0, maxX = 0, minY = 0, maxY = 0;

    for (const stitch of stitches) {
        if (stitch.colorChange) {
            records.push(encodeDstRecord(0, 0, false, true));
            continue;
        }
        let dx = stitch.x - px;
        let dy = stitch.y - py;
        while (Math.abs(dx) > DST_MAX_DELTA || Math.abs(dy) > DST_MAX_DELTA) {
            const stepX = Math.max(-DST_MAX_DELTA, Math.min(DST_MAX_DELTA, dx));
            const stepY = Math.max(-DST_MAX_DELTA, Math.min(DST_MAX_DELTA, dy));
            records.push(encodeDstRecord(stepX, stepY, true, false));
            dx -= stepX;
            dy -= stepY;
        }
        records.push(encodeDstRecord(dx, dy, stitch.jump, false));
        px = stitch.x;
        py = stitch.y;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
    }

    const stitchCount = records.length;
    const colorChanges = stitches.filter((s) => s.colorChange).length;

    const header = new Uint8Array(512).fill(0x20);
    const headerText = [
        `LA:${designName.slice(0, 16).padEnd(16, ' ')}\r`,
        `ST:${String(stitchCount).padStart(7, ' ')}\r`,
        `CO:${String(colorChanges).padStart(3, ' ')}\r`,
        `+X:${String(Math.abs(maxX)).padStart(5, ' ')}\r`,
        `-X:${String(Math.abs(minX)).padStart(5, ' ')}\r`,
        `+Y:${String(Math.abs(maxY)).padStart(5, ' ')}\r`,
        `-Y:${String(Math.abs(minY)).padStart(5, ' ')}\r`,
        `AX:+${String(0).padStart(5, ' ')}\r`,
        `AY:+${String(0).padStart(5, ' ')}\r`,
        `MX:+${String(0).padStart(5, ' ')}\r`,
        `MY:+${String(0).padStart(5, ' ')}\r`,
        `PD:******\r`,
    ].join('');
    for (let i = 0; i < headerText.length; i++) {
        header[i] = headerText.charCodeAt(i);
    }
    header[headerText.length] = 0x1A; // EOF marker after the text block

    const out = new Uint8Array(512 + records.length * 3 + 3);
    out.set(header, 0);
    records.forEach((record, index) => {
        out.set(record, 512 + index * 3);
    });
    // End-of-design record.
    out.set([0x00, 0x00, 0xF3], 512 + records.length * 3);
    return out;
}

/**
 * Decodes a DST byte stream back into absolute stitch positions.
 * Used to verify that what we encode is what a machine will read.
 */
export function decodeDst(bytes: Uint8Array): {
    stitches: Array<{ x: number; y: number; jump: boolean; colorChange: boolean }>;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
} {
    const stitches: Array<{ x: number; y: number; jump: boolean; colorChange: boolean }> = [];
    let x = 0;
    let y = 0;
    let minX = 0, maxX = 0, minY = 0, maxY = 0;

    for (let offset = 512; offset + 2 < bytes.length; offset += 3) {
        const b0 = bytes[offset];
        const b1 = bytes[offset + 1];
        const b2 = bytes[offset + 2];
        if (b2 === 0xF3) break; // end of design

        let dx = 0;
        let dy = 0;
        if (b0 & 0x01) dx += 1;
        if (b0 & 0x02) dx -= 1;
        if (b0 & 0x04) dx += 9;
        if (b0 & 0x08) dx -= 9;
        if (b0 & 0x80) dy += 1;
        if (b0 & 0x40) dy -= 1;
        if (b0 & 0x20) dy += 9;
        if (b0 & 0x10) dy -= 9;
        if (b1 & 0x01) dx += 3;
        if (b1 & 0x02) dx -= 3;
        if (b1 & 0x04) dx += 27;
        if (b1 & 0x08) dx -= 27;
        if (b1 & 0x80) dy += 3;
        if (b1 & 0x40) dy -= 3;
        if (b1 & 0x20) dy += 27;
        if (b1 & 0x10) dy -= 27;
        if (b2 & 0x04) dx += 81;
        if (b2 & 0x08) dx -= 81;
        if (b2 & 0x20) dy += 81;
        if (b2 & 0x10) dy -= 81;

        const colorChange = (b2 & 0xC0) === 0xC0;
        const jump = !colorChange && (b2 & 0x80) !== 0;

        x += dx;
        y += dy;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        stitches.push({ x, y, jump, colorChange });
    }

    return { stitches, bounds: { minX, maxX, minY, maxY } };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not load design image.'));
        image.src = dataUrl;
    });
}

export async function buildEmbroideryFromDataUrl(dataUrl: string, options: EmbroideryOptions, designName = 'design'): Promise<EmbroideryPlan> {
    const colorCount = Math.max(2, Math.min(12, Math.round(options.colorCount)));
    const widthMm = Math.max(20, Math.min(400, options.widthMm));
    const rowSpacingMm = Math.max(0.2, Math.min(2, options.rowSpacingMm));
    const stitchLengthMm = Math.max(1, Math.min(7, options.stitchLengthMm));

    const image = await loadImage(dataUrl);
    const aspect = image.height / image.width;
    const heightMm = widthMm * aspect;

    // Resample so one pixel row = one fill row: pixel size == row spacing.
    const gridWidth = Math.max(8, Math.round(widthMm / rowSpacingMm));
    const gridHeight = Math.max(8, Math.round(heightMm / rowSpacingMm));

    const work = document.createElement('canvas');
    work.width = gridWidth;
    work.height = gridHeight;
    const ctx = work.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No 2D context available.');
    ctx.drawImage(image, 0, 0, gridWidth, gridHeight);
    const pixels = ctx.getImageData(0, 0, gridWidth, gridHeight).data;

    // Collect opaque pixels for quantization.
    const opaque: number[] = [];
    for (let i = 0; i < gridWidth * gridHeight; i++) {
        if (pixels[i * 4 + 3] >= 128) opaque.push(i);
    }
    if (opaque.length === 0) throw new Error('The design is fully transparent.');

    const palette = medianCutPalette(pixels, opaque, colorCount);

    // Map every pixel to a palette index (-1 = transparent / skipped).
    const indexMap = new Int16Array(gridWidth * gridHeight).fill(-1);
    for (const i of opaque) {
        indexMap[i] = nearestPaletteIndex(palette, pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
    }

    // Background = the palette color that dominates the image border.
    let backgroundIndex = -1;
    if (options.omitBackground) {
        const borderCounts = new Array<number>(palette.length).fill(0);
        let borderOpaque = 0;
        for (let x = 0; x < gridWidth; x++) {
            for (const y of [0, gridHeight - 1]) {
                const idx = indexMap[y * gridWidth + x];
                if (idx >= 0) { borderCounts[idx] += 1; borderOpaque += 1; }
            }
        }
        for (let y = 0; y < gridHeight; y++) {
            for (const x of [0, gridWidth - 1]) {
                const idx = indexMap[y * gridWidth + x];
                if (idx >= 0) { borderCounts[idx] += 1; borderOpaque += 1; }
            }
        }
        const maxCount = Math.max(...borderCounts);
        // Only treat as background when the color clearly dominates the border.
        if (borderOpaque > 0 && maxCount / borderOpaque >= 0.5) {
            backgroundIndex = borderCounts.indexOf(maxCount);
        }
    }

    // Anti-aliasing splits a flat background into several near-identical
    // buckets. Skipping only the exact border bucket leaves the rest of the
    // page stitched as if it were artwork, so fold in every perceptually
    // equivalent color too.
    const backgroundIndices = new Set<number>();
    if (backgroundIndex >= 0) {
        const [br, bg, bb] = palette[backgroundIndex];
        palette.forEach(([r, g, b], index) => {
            const distance = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
            if (distance <= 48) backgroundIndices.add(index);
        });
    }
    const isBackgroundColor = (index: number) => backgroundIndices.has(index);

    // Stitch generation: serpentine scanline fill per color, in 0.1mm units,
    // centered on the origin (DST convention).
    const unitsPerCell = rowSpacingMm * 10;
    const centerX = (gridWidth * unitsPerCell) / 2;
    const centerY = (gridHeight * unitsPerCell) / 2;
    const toUnits = (cellX: number, cellY: number): { x: number; y: number } => ({
        x: Math.round(cellX * unitsPerCell - centerX),
        // Flip Y: image rows grow downward, embroidery Y grows upward.
        y: Math.round(centerY - cellY * unitsPerCell),
    });

    // Palette order: most-used first (excluding background).
    const usage = new Array<number>(palette.length).fill(0);
    for (let i = 0; i < indexMap.length; i++) {
        if (indexMap[i] >= 0) usage[indexMap[i]] += 1;
    }
    const colorOrder = palette
        .map((_, index) => index)
        .filter((index) => !isBackgroundColor(index) && usage[index] > 0)
        .sort((a, b) => usage[b] - usage[a]);

    const maxStitchUnits = Math.min(DST_MAX_DELTA, Math.max(10, Math.round(stitchLengthMm * 10)));
    // Travel shorter than this is sewn as running stitches. Only genuinely
    // separated islands become jumps: a fill that jumps between every row makes
    // machines trim constantly, and reader software renders those jumps as
    // travel lines rather than thread — which is why small shapes (text) came
    // back looking like scattered fragments instead of solid letters.
    const jumpThresholdUnits = Math.max(50, maxStitchUnits * 2);
    const TIE_UNITS = 8;

    const blocks: Array<{ colorIndex: number; path: StitchPoint[] }> = [];
    const perColorStitches = new Array<number>(palette.length).fill(0);

    for (const colorIndex of colorOrder) {
        const path: StitchPoint[] = [];
        let cursor: { x: number; y: number } | null = null;

        /** Sews a straight line to the target, split to respect max stitch length. */
        const lineTo = (target: { x: number; y: number }) => {
            if (!cursor) {
                path.push({ x: target.x, y: target.y, jump: false });
                cursor = { x: target.x, y: target.y };
                return;
            }
            const dx = target.x - cursor.x;
            const dy = target.y - cursor.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 1) return;
            const steps = Math.max(1, Math.ceil(distance / maxStitchUnits));
            for (let step = 1; step <= steps; step++) {
                path.push({
                    x: Math.round(cursor.x + (dx * step) / steps),
                    y: Math.round(cursor.y + (dy * step) / steps),
                    jump: false,
                });
            }
            cursor = { x: target.x, y: target.y };
        };

        /** Moves to the target, jumping only when the gap is genuinely large. */
        const travelTo = (target: { x: number; y: number }) => {
            if (!cursor) {
                path.push({ x: target.x, y: target.y, jump: true });
                cursor = { x: target.x, y: target.y };
                return;
            }
            const distance = Math.hypot(target.x - cursor.x, target.y - cursor.y);
            if (distance < 1) return;
            if (distance > jumpThresholdUnits) {
                path.push({ x: target.x, y: target.y, jump: true });
                cursor = { x: target.x, y: target.y };
                return;
            }
            lineTo(target);
        };

        /** Short back-and-forth so the thread is locked at block start/end. */
        const tieAt = (point: { x: number; y: number }) => {
            const anchor = { x: point.x + TIE_UNITS, y: point.y };
            lineTo(anchor);
            lineTo(point);
            lineTo(anchor);
            lineTo(point);
        };

        let firstPoint: { x: number; y: number } | null = null;
        let lastPoint: { x: number; y: number } | null = null;

        for (let row = 0; row < gridHeight; row++) {
            const leftToRight = row % 2 === 0;
            // Find runs of this color along the row.
            const runs: Array<[number, number]> = [];
            let runStart = -1;
            for (let x = 0; x < gridWidth; x++) {
                const match = indexMap[row * gridWidth + x] === colorIndex;
                if (match && runStart < 0) runStart = x;
                if (!match && runStart >= 0) { runs.push([runStart, x - 1]); runStart = -1; }
            }
            if (runStart >= 0) runs.push([runStart, gridWidth - 1]);
            if (runs.length === 0) continue;
            if (!leftToRight) runs.reverse();

            for (const [start, end] of runs) {
                // Runs cover whole cells, so the sewn span spans the full run
                // in whichever direction this row is travelling.
                const entryCell = leftToRight ? start : end + 1;
                const exitCell = leftToRight ? end + 1 : start;
                const entry = toUnits(entryCell, row + 0.5);
                const exit = toUnits(exitCell, row + 0.5);

                if (!firstPoint) {
                    firstPoint = entry;
                    path.push({ x: entry.x, y: entry.y, jump: true });
                    cursor = { x: entry.x, y: entry.y };
                    tieAt(entry);
                } else {
                    travelTo(entry);
                }
                lineTo(exit);
                lastPoint = exit;
            }
        }

        if (!firstPoint || !lastPoint) continue;
        tieAt(lastPoint);

        perColorStitches[colorIndex] = path.filter((point) => !point.jump).length;
        blocks.push({ colorIndex, path });
    }

    if (blocks.length === 0) {
        throw new Error('Nothing to stitch — every color was treated as background.');
    }

    const stitches: Stitch[] = [];
    blocks.forEach((block, index) => {
        if (index > 0) {
            stitches.push({ x: 0, y: 0, jump: false, colorChange: true });
        }
        block.path.forEach((point) => {
            stitches.push({ x: point.x, y: point.y, jump: point.jump, colorChange: false });
        });
    });

    const dstBytes = encodeDst(stitches, designName);

    // Thread paths are handed out in preview-pixel space so the UI can draw the
    // SAME geometry that gets encoded — including replaying it stitch by stitch.
    const previewScale = Math.max(2, Math.min(8, Math.round(1400 / gridWidth)));
    const toPx = (point: { x: number; y: number }) => ({
        x: ((point.x + centerX) / unitsPerCell) * previewScale,
        y: ((centerY - point.y) / unitsPerCell) * previewScale,
    });

    let jumpCount = 0;
    const threads: EmbroideryThreadPath[] = blocks.map((block) => {
        const [r, g, b] = palette[block.colorIndex];
        return {
            color: { r, g, b },
            points: block.path.map((point) => {
                if (point.jump) jumpCount += 1;
                const px = toPx(point);
                return { x: px.x, y: px.y, jump: point.jump };
            }),
        };
    });

    return {
        palette: palette.map(([r, g, b], index) => ({
            r, g, b,
            stitches: perColorStitches[index],
            isBackground: isBackgroundColor(index),
        })).filter((entry) => entry.stitches > 0 || entry.isBackground),
        totalStitches: stitches.filter((s) => !s.colorChange).length,
        colorChanges: blocks.length - 1,
        jumpCount,
        widthMm,
        heightMm,
        threads,
        previewWidth: gridWidth * previewScale,
        previewHeight: gridHeight * previewScale,
        // One thread lies about one fill row wide.
        threadWidth: Math.max(1, previewScale),
        dstBytes,
    };
}

export function downloadDst(plan: EmbroideryPlan, filename: string) {
    const blob = new Blob([plan.dstBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.dst') ? filename : `${filename}.dst`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
