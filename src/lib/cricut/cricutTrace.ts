'use client';

import type {
    CricutContour,
    CricutPoint,
    CricutTraceOptions,
    CricutTraceResult,
    TracedComponent,
} from './cricutTypes';

type Bitmap = { mask: Uint8Array; width: number; height: number; dataUrl: string };
type PixelComponent = { label: number; pixels: number[] };
type Edge = { from: CricutPoint; to: CricutPoint };

const pointKey = (point: CricutPoint) => `${point.x},${point.y}`;
const cross = (a: CricutPoint, b: CricutPoint, p: CricutPoint) => (
    Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y))
);

function pointLineDistance(point: CricutPoint, start: CricutPoint, end: CricutPoint): number {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    return length === 0 ? Math.hypot(point.x - start.x, point.y - start.y) : cross(start, end, point) / length;
}

function simplifyOpen(points: CricutPoint[], tolerance: number): CricutPoint[] {
    if (points.length <= 2) return points;
    let maxDistance = 0;
    let splitIndex = 0;
    for (let index = 1; index < points.length - 1; index += 1) {
        const distance = pointLineDistance(points[index], points[0], points[points.length - 1]);
        if (distance > maxDistance) {
            maxDistance = distance;
            splitIndex = index;
        }
    }
    if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
    return [
        ...simplifyOpen(points.slice(0, splitIndex + 1), tolerance).slice(0, -1),
        ...simplifyOpen(points.slice(splitIndex), tolerance),
    ];
}

function removeClosedCollinearPoints(points: CricutPoint[], tolerance: number): CricutPoint[] {
    const cleaned = points.slice();
    let changed = true;
    while (changed && cleaned.length > 3) {
        changed = false;
        for (let index = 0; index < cleaned.length; index += 1) {
            const previous = cleaned[(index - 1 + cleaned.length) % cleaned.length];
            const current = cleaned[index];
            const next = cleaned[(index + 1) % cleaned.length];
            if (pointLineDistance(current, previous, next) <= Math.max(1e-9, tolerance)) {
                cleaned.splice(index, 1);
                changed = true;
                break;
            }
        }
    }
    return cleaned;
}

/** Ramer-Douglas-Peucker simplification that preserves the seam of a closed path. */
export function simplifyClosedPath(points: CricutPoint[], tolerance: number): CricutPoint[] {
    const unique = points.length > 1 && pointKey(points[0]) === pointKey(points[points.length - 1])
        ? points.slice(0, -1)
        : points.slice();
    if (unique.length <= 3) return unique;
    if (tolerance <= 0) return removeClosedCollinearPoints(unique, 0);

    let farthest = 1;
    let farthestDistance = 0;
    for (let index = 1; index < unique.length; index += 1) {
        const distance = Math.hypot(unique[index].x - unique[0].x, unique[index].y - unique[0].y);
        if (distance > farthestDistance) {
            farthest = index;
            farthestDistance = distance;
        }
    }
    const first = simplifyOpen(unique.slice(0, farthest + 1), tolerance);
    const second = simplifyOpen([...unique.slice(farthest), unique[0]], tolerance);
    const simplified = [...first.slice(0, -1), ...second.slice(0, -1)];
    return removeClosedCollinearPoints(simplified.length >= 3 ? simplified : unique, tolerance);
}

export function signedArea(points: CricutPoint[]): number {
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
        const next = points[(index + 1) % points.length];
        sum += points[index].x * next.y - next.x * points[index].y;
    }
    return sum / 2;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not load the design image.'));
        image.src = dataUrl;
    });
}

async function buildBitmap(dataUrl: string, options: CricutTraceOptions): Promise<Bitmap & { sourceWidth: number; sourceHeight: number }> {
    const image = await loadImage(dataUrl);
    const maximum = Math.max(128, Math.min(1600, options.maxTraceDimension ?? 900));
    const traceScale = Math.min(1, maximum / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * traceScale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * traceScale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('A 2D canvas context is required for Cricut tracing.');
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const mask = new Uint8Array(width * height);
    const threshold = Math.max(0, Math.min(255, options.threshold));

    for (let index = 0; index < mask.length; index += 1) {
        const offset = index * 4;
        const alpha = imageData.data[offset + 3];
        const luminance = 0.2126 * imageData.data[offset]
            + 0.7152 * imageData.data[offset + 1]
            + 0.0722 * imageData.data[offset + 2];
        const foreground = alpha >= 32 && (options.invert ? luminance >= threshold : luminance <= threshold);
        mask[index] = foreground ? 1 : 0;
        const color = foreground ? 0 : 255;
        imageData.data[offset] = color;
        imageData.data[offset + 1] = color;
        imageData.data[offset + 2] = color;
        imageData.data[offset + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
    return {
        mask,
        width,
        height,
        dataUrl: canvas.toDataURL('image/png'),
        sourceWidth: image.naturalWidth || image.width,
        sourceHeight: image.naturalHeight || image.height,
    };
}

export function labelComponents(mask: Uint8Array, width: number, height: number): { labels: Int32Array; components: PixelComponent[] } {
    const labels = new Int32Array(mask.length).fill(-1);
    const components: PixelComponent[] = [];
    const queue = new Int32Array(mask.length);

    for (let seed = 0; seed < mask.length; seed += 1) {
        if (!mask[seed] || labels[seed] >= 0) continue;
        const label = components.length;
        const pixels: number[] = [];
        let head = 0;
        let tail = 0;
        queue[tail++] = seed;
        labels[seed] = label;
        while (head < tail) {
            const index = queue[head++];
            pixels.push(index);
            const x = index % width;
            const y = Math.floor(index / width);
            const neighbors = [
                x > 0 ? index - 1 : -1,
                x + 1 < width ? index + 1 : -1,
                y > 0 ? index - width : -1,
                y + 1 < height ? index + width : -1,
            ];
            for (const next of neighbors) {
                if (next >= 0 && mask[next] && labels[next] < 0) {
                    labels[next] = label;
                    queue[tail++] = next;
                }
            }
        }
        components.push({ label, pixels });
    }
    return { labels, components };
}

/** Pure bitmap-to-contour entry point used by the browser pipeline and geometry tests. */
export function traceCricutMask(
    mask: Uint8Array,
    width: number,
    height: number,
    physicalWidthMm: number,
    simplifyToleranceMm: number,
    minimumFeatureAreaMm2: number,
): TracedComponent[] {
    if (width < 1 || height < 1 || mask.length !== width * height) {
        throw new Error('The monochrome mask dimensions are invalid.');
    }
    const mmPerPixel = Math.max(0.001, physicalWidthMm) / width;
    const minimumPixels = Math.max(1, Math.ceil(Math.max(0, minimumFeatureAreaMm2) / (mmPerPixel * mmPerPixel)));
    const tolerancePixels = Math.max(0, simplifyToleranceMm / mmPerPixel);
    const { labels, components } = labelComponents(mask, width, height);
    return components
        .filter((component) => component.pixels.length >= minimumPixels)
        .map((component) => toTracedComponent(component, labels, width, height, mmPerPixel, tolerancePixels))
        .filter((component): component is TracedComponent => component !== null);
}

function componentEdges(component: PixelComponent, labels: Int32Array, width: number, height: number): Edge[] {
    const edges: Edge[] = [];
    const same = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height
        && labels[y * width + x] === component.label;
    for (const index of component.pixels) {
        const x = index % width;
        const y = Math.floor(index / width);
        if (!same(x, y - 1)) edges.push({ from: { x, y }, to: { x: x + 1, y } });
        if (!same(x + 1, y)) edges.push({ from: { x: x + 1, y }, to: { x: x + 1, y: y + 1 } });
        if (!same(x, y + 1)) edges.push({ from: { x: x + 1, y: y + 1 }, to: { x, y: y + 1 } });
        if (!same(x - 1, y)) edges.push({ from: { x, y: y + 1 }, to: { x, y } });
    }
    return edges;
}

function traceLoops(edges: Edge[]): CricutPoint[][] {
    const byStart = new Map<string, Edge[]>();
    for (const edge of edges) {
        const key = pointKey(edge.from);
        const candidates = byStart.get(key) ?? [];
        candidates.push(edge);
        byStart.set(key, candidates);
    }
    const unused = new Set(edges);
    const loops: CricutPoint[][] = [];
    for (const first of edges) {
        if (!unused.has(first)) continue;
        const loop = [first.from];
        let edge = first;
        unused.delete(edge);
        let guard = 0;
        while (pointKey(edge.to) !== pointKey(first.from) && guard <= edges.length) {
            loop.push(edge.to);
            const next = (byStart.get(pointKey(edge.to)) ?? []).find((candidate) => unused.has(candidate));
            if (!next) break;
            edge = next;
            unused.delete(edge);
            guard += 1;
        }
        if (loop.length >= 3 && pointKey(edge.to) === pointKey(first.from)) loops.push(loop);
    }
    return loops;
}

function chooseRegistrationAnchors(component: PixelComponent, width: number, mmPerPixel: number, minX: number, minY: number): CricutPoint[] {
    if (component.pixels.length < 2) return [];
    const sorted = component.pixels.slice().sort((a, b) => (a % width) - (b % width));
    const candidates = [sorted[Math.floor(sorted.length * 0.25)], sorted[Math.floor(sorted.length * 0.75)]];
    return candidates.map((index) => ({
        x: ((index % width) + 0.5) * mmPerPixel - minX,
        y: (Math.floor(index / width) + 0.5) * mmPerPixel - minY,
    }));
}

function toTracedComponent(
    component: PixelComponent,
    labels: Int32Array,
    width: number,
    height: number,
    mmPerPixel: number,
    tolerancePixels: number,
): TracedComponent | null {
    const rawLoops = traceLoops(componentEdges(component, labels, width, height));
    if (rawLoops.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rawLoops.forEach((loop) => loop.forEach((point) => {
        minX = Math.min(minX, point.x * mmPerPixel);
        minY = Math.min(minY, point.y * mmPerPixel);
        maxX = Math.max(maxX, point.x * mmPerPixel);
        maxY = Math.max(maxY, point.y * mmPerPixel);
    }));
    const contours: CricutContour[] = rawLoops.map((loop) => {
        const simplified = simplifyClosedPath(loop, tolerancePixels);
        const points = simplified.map((point) => ({
            x: point.x * mmPerPixel - minX,
            y: point.y * mmPerPixel - minY,
        }));
        return { points, areaMm2: Math.abs(signedArea(points)) };
    }).filter((contour) => contour.points.length >= 3);
    if (contours.length === 0) return null;
    return {
        contours,
        widthMm: maxX - minX,
        heightMm: maxY - minY,
        registrationAnchors: chooseRegistrationAnchors(component, width, mmPerPixel, minX, minY),
        originalNodeCount: rawLoops.reduce((sum, loop) => sum + loop.length, 0),
    };
}

export async function traceCricutImage(dataUrl: string, options: CricutTraceOptions): Promise<CricutTraceResult> {
    const bitmap = await buildBitmap(dataUrl, options);
    const physicalWidth = Math.max(1, options.designWidthMm) * Math.max(0.01, options.scalePercent / 100);
    const traced = traceCricutMask(
        bitmap.mask,
        bitmap.width,
        bitmap.height,
        physicalWidth,
        options.simplifyToleranceMm,
        options.minimumFeatureAreaMm2,
    );
    if (traced.length === 0) throw new Error('No cuttable shapes were found. Adjust the threshold or minimum feature size.');
    return {
        sourceWidthPx: bitmap.sourceWidth,
        sourceHeightPx: bitmap.sourceHeight,
        traceWidthPx: bitmap.width,
        traceHeightPx: bitmap.height,
        outputWidthMm: physicalWidth,
        outputHeightMm: physicalWidth * bitmap.height / bitmap.width,
        components: traced,
        monochromeDataUrl: bitmap.dataUrl,
    };
}
