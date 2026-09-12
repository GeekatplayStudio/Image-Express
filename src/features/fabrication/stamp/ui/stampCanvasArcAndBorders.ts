import { PodiumShape } from '../domain/stampTypes';

/**
 * Renders curved arc text along a circular path.
 *
 * Each glyph is advanced by its own measured width converted to an angle (arc length over
 * radius), so wide and narrow letters stay evenly spaced. A fixed per-character angle makes
 * "IIII" sprawl and "WWWW" collide, and saturates into overlapping glyphs on long strings.
 */
export function drawArcText(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    cy: number,
    radius: number,
    startAngle: number,
    isDownward: boolean,
    letterSpacingPx: number = 0
) {
    if (!text.trim() || radius <= 0) return;

    const chars = Array.from(text);
    const advances = chars.map((char) => ctx.measureText(char).width + letterSpacingPx);
    const totalWidth = advances.reduce((sum, w) => sum + w, 0);
    if (totalWidth <= 0) return;

    // Never let the text wrap past a full turn.
    const maxSpan = Math.PI * 1.9;
    const scale = Math.min(1, maxSpan / (totalWidth / radius));
    const angularSpan = (totalWidth / radius) * scale;

    ctx.save();
    // Text runs clockwise along the top of the circle and counter-clockwise along the bottom,
    // which keeps both halves of a round seal reading left to right.
    const direction = isDownward ? -1 : 1;
    let cursor = -angularSpan / 2;

    for (let i = 0; i < chars.length; i++) {
        const advance = (advances[i] / radius) * scale;
        const angle = startAngle + direction * (cursor + advance / 2);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.translate(0, isDownward ? radius : -radius);
        if (isDownward) {
            ctx.rotate(Math.PI);
        }
        ctx.fillText(chars[i], 0, 0);
        ctx.restore();

        cursor += advance;
    }
    ctx.restore();
}

/**
 * Applies tracking to a 2D context where the browser supports it.
 * `letterSpacing` is a Chromium canvas feature; the guard keeps jsdom and older engines happy.
 */
export function applyLetterSpacing(ctx: CanvasRenderingContext2D, spacingPx: number) {
    const tracked = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in tracked) {
        tracked.letterSpacing = `${spacingPx}px`;
    }
}

/**
 * Draws border rings matching the stamp shape (rectangular, circular, oval).
 */
export function drawStampBorder(
    ctx: CanvasRenderingContext2D,
    shape: PodiumShape,
    w: number,
    h: number,
    style: string,
    borderWidth: number,
    inset: number
) {
    if (style === 'none') return;

    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = borderWidth;

    if (shape === 'circular') {
        const r = Math.max(10, Math.min(cx, cy) - inset);

        if (style === 'single' || style === 'double') {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();

            if (style === 'double') {
                const innerR = r - borderWidth * 2.2;
                if (innerR > 10) {
                    ctx.beginPath();
                    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
                    ctx.lineWidth = Math.max(1, borderWidth * 0.6);
                    ctx.stroke();
                }
            }
        } else if (style === 'coin-beaded') {
            const count = Math.max(12, Math.floor((Math.PI * 2 * r) / (borderWidth * 2.2)));
            const dotR = borderWidth * 0.45;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const px = cx + r * Math.cos(angle);
                const py = cy + r * Math.sin(angle);
                ctx.beginPath();
                ctx.arc(px, py, dotR, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (shape === 'oval') {
        const rx = Math.max(10, cx - inset);
        const ry = Math.max(10, cy - inset);

        if (style === 'single' || style === 'double') {
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();

            if (style === 'double') {
                const innerRx = rx - borderWidth * 2.2;
                const innerRy = ry - borderWidth * 2.2;
                if (innerRx > 10 && innerRy > 10) {
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, innerRx, innerRy, 0, 0, Math.PI * 2);
                    ctx.lineWidth = Math.max(1, borderWidth * 0.6);
                    ctx.stroke();
                }
            }
        } else if (style === 'coin-beaded') {
            // Ramanujan approximation for ellipse perimeter
            const hTerm = Math.pow(rx - ry, 2) / Math.max(1, Math.pow(rx + ry, 2));
            const perimeter = Math.PI * (rx + ry) * (1 + (3 * hTerm) / (10 + Math.sqrt(4 - 3 * hTerm)));
            const count = Math.max(12, Math.floor(perimeter / (borderWidth * 2.2)));
            const dotR = borderWidth * 0.45;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const px = cx + rx * Math.cos(angle);
                const py = cy + ry * Math.sin(angle);
                ctx.beginPath();
                ctx.arc(px, py, dotR, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else {
        // Rectangular border
        const rw = w - inset * 2;
        const rh = h - inset * 2;
        const rx = inset;
        const ry = inset;
        const cornerR = Math.min(8, Math.min(rw, rh) * 0.2);

        const drawRoundRect = (x: number, y: number, width: number, height: number, radius: number) => {
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, radius);
            ctx.stroke();
        };

        drawRoundRect(rx, ry, rw, rh, cornerR);

        if (style === 'double') {
            const gap = borderWidth * 2.2;
            ctx.lineWidth = Math.max(1, borderWidth * 0.6);
            drawRoundRect(rx + gap, ry + gap, rw - gap * 2, rh - gap * 2, Math.max(2, cornerR - 3));
        }
    }

    ctx.restore();
}
