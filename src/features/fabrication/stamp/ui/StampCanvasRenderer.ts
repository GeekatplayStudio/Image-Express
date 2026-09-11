/**
 * 3D Stamp Tool - 2D Artwork Renderer
 * Rasterizes text, uploaded images, and borders to generate:
 * 1. Pixel heightmap for 3D relief extrusion
 * 2. Visual stamp die preview
 * 3. Physical impression simulation preview (unmirrored positive)
 */

import { PodiumShape, StampArtworkConfig, StampDimensions } from '../domain/stampTypes';

export interface RenderedArtworkResult {
    heightmapData: Uint8ClampedArray;
    gridWidth: number;
    gridHeight: number;
    dieDataUrl: string;       // Mirrored die face view
    imprintDataUrl: string;   // Normal right-side-up imprint view
}

/**
 * Renders curved arc text along a circular path.
 */
function drawArcText(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    cy: number,
    radius: number,
    startAngle: number,
    isDownward: boolean
) {
    if (!text.trim()) return;

    ctx.save();
    const chars = text.split('');
    const totalChars = chars.length;
    // Spread angle based on text length
    const angularSpan = Math.min(Math.PI * 0.9, totalChars * 0.12);
    const step = angularSpan / Math.max(1, totalChars - 1);
    const initialAngle = startAngle - angularSpan / 2;

    for (let i = 0; i < totalChars; i++) {
        const char = chars[i];
        const angle = initialAngle + i * step;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.translate(0, isDownward ? radius : -radius);
        if (isDownward) {
            ctx.rotate(Math.PI);
        }
        ctx.fillText(char, 0, 0);
        ctx.restore();
    }
    ctx.restore();
}

/**
 * Draws border rings matching the stamp shape (rectangular, circular, oval).
 */
function drawStampBorder(
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

    if (shape === 'circular' || shape === 'oval') {
        const rx = cx - inset;
        const ry = cy - inset;

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
            // Coin edge beaded rim: circle of small dots
            const count = Math.floor((Math.PI * 2 * rx) / (borderWidth * 2.2));
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
        const cornerR = 8;

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

/**
 * Applies a 1D horizontal and vertical box blur to smooth sharp edges into a draft slope.
 */
function applyBoxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number) {
    if (radius <= 0) return;
    const r = Math.round(radius);
    const temp = new Uint8ClampedArray(data.length);

    // Horizontal pass
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let count = 0;
            for (let dx = -r; dx <= r; dx++) {
                const nx = x + dx;
                if (nx >= 0 && nx < width) {
                    sum += data[(y * width + nx) * 4];
                    count++;
                }
            }
            temp[(y * width + x) * 4] = Math.round(sum / count);
        }
    }

    // Vertical pass
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let sum = 0;
            let count = 0;
            for (let dy = -r; dy <= r; dy++) {
                const ny = y + dy;
                if (ny >= 0 && ny < height) {
                    sum += temp[(ny * width + x) * 4];
                    count++;
                }
            }
            const val = Math.round(sum / count);
            const idx = (y * width + x) * 4;
            data[idx] = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
            data[idx + 3] = 255;
        }
    }
}

/**
 * Main artwork rasterization function.
 */
export async function renderStampArtwork(
    artwork: StampArtworkConfig,
    shape: PodiumShape,
    dimensions: StampDimensions,
    canvasSize: number = 512
): Promise<RenderedArtworkResult> {
    if (typeof document === 'undefined') {
        // Fallback for non-DOM / test environments
        const dummy = new Uint8ClampedArray(canvasSize * canvasSize * 4);
        return {
            heightmapData: dummy,
            gridWidth: canvasSize,
            gridHeight: canvasSize,
            dieDataUrl: '',
            imprintDataUrl: '',
        };
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d')!;

    // 1. Fill base with black (0 = base plate level)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const cx = canvasSize / 2;
    const cy = canvasSize / 2;

    // Draw borders
    const borderPx = (artwork.borderThicknessMm / dimensions.widthMm) * canvasSize;
    const insetPx = (artwork.borderInsetMm / dimensions.widthMm) * canvasSize;
    drawStampBorder(ctx, shape, canvasSize, canvasSize, artwork.borderStyle, borderPx, insetPx);

    // 2. Render Text or Image
    if (artwork.mode === 'image' && artwork.imageUrl) {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = artwork.imageUrl!;
            });

            // Draw image centered with padding
            const pad = insetPx + borderPx * 2;
            const availW = canvasSize - pad * 2;
            const availH = canvasSize - pad * 2;
            const scale = Math.min(availW / img.width, availH / img.height);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            const drawX = cx - drawW / 2;
            const drawY = cy - drawH / 2;

            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } catch {
            // If image fails, fallback to rendering placeholder text
        }
    } else {
        // Text mode
        const { text } = artwork;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontStyle = `${text.isItalic ? 'italic ' : ''}${text.isBold ? 'bold ' : ''}`;
        const fontSizePx = Math.round((text.fontSize / 50) * (canvasSize * 0.1));
        ctx.font = `${fontStyle}${fontSizePx}px "${text.fontFamily}", sans-serif`;

        if (text.arcMode === 'circular-arc' || text.arcMode === 'top-bottom-arc') {
            const arcR = (canvasSize / 2) - insetPx - borderPx * 3.5;
            // Top arc text
            drawArcText(ctx, text.primaryText, cx, cy, arcR, -Math.PI / 2, false);

            // Bottom arc text
            if (text.secondaryText) {
                drawArcText(ctx, text.secondaryText, cx, cy, arcR, Math.PI / 2, true);
            }

            // Center icon or monogram
            if (text.centerIcon) {
                ctx.font = `${fontStyle}${Math.round(fontSizePx * 1.5)}px "${text.fontFamily}", sans-serif`;
                ctx.fillText(text.centerIcon, cx, cy);
            }
        } else {
            // Straight text layout
            if (text.secondaryText.trim()) {
                ctx.font = `${fontStyle}${Math.round(fontSizePx * 1.1)}px "${text.fontFamily}", sans-serif`;
                ctx.fillText(text.primaryText, cx, cy - fontSizePx * 0.65);

                const secondarySize = Math.max(12, Math.round(fontSizePx * 0.55));
                ctx.font = `600 ${secondarySize}px "${text.fontFamily}", sans-serif`;
                ctx.fillText(text.secondaryText, cx, cy + fontSizePx * 0.85);
            } else {
                ctx.font = `${fontStyle}${fontSizePx * 1.2}px "${text.fontFamily}", sans-serif`;
                ctx.fillText(text.primaryText, cx, cy);
            }
        }
    }

    // Capture the normal imprint (unmirrored positive)
    const imprintDataUrl = canvas.toDataURL('image/png');

    // 3. Image Post-Processing (Mirroring, Inverting, Thresholding, Smoothing)
    let imgData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    const pixels = imgData.data;

    // Horizontal Mirroring (Stamps must be mirrored on the physical die face!)
    if (artwork.flipHorizontal) {
        const flippedCanvas = document.createElement('canvas');
        flippedCanvas.width = canvasSize;
        flippedCanvas.height = canvasSize;
        const fCtx = flippedCanvas.getContext('2d')!;
        fCtx.translate(canvasSize, 0);
        fCtx.scale(-1, 1);
        fCtx.drawImage(canvas, 0, 0);
        imgData = fCtx.getImageData(0, 0, canvasSize, canvasSize);
    }

    const workingPixels = imgData.data;
    const threshold = artwork.threshold;
    const invert = artwork.invertRelief;
    const isContinuous = artwork.useContinuousGrayscale;

    for (let i = 0; i < workingPixels.length; i += 4) {
        const r = workingPixels[i];
        const g = workingPixels[i + 1];
        const b = workingPixels[i + 2];
        const a = workingPixels[i + 3];

        // Perceived luminance
        let luma = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * (a / 255));

        if (!isContinuous) {
            luma = luma >= threshold ? 255 : 0;
        }

        if (invert) {
            luma = 255 - luma;
        }

        workingPixels[i] = luma;
        workingPixels[i + 1] = luma;
        workingPixels[i + 2] = luma;
        workingPixels[i + 3] = 255;
    }

    // Apply smoothing for organic draft angle taper
    if (artwork.smoothRadius > 0) {
        applyBoxBlur(workingPixels, canvasSize, canvasSize, artwork.smoothRadius);
    }

    ctx.putImageData(imgData, 0, 0);
    const dieDataUrl = canvas.toDataURL('image/png');

    return {
        heightmapData: workingPixels,
        gridWidth: canvasSize,
        gridHeight: canvasSize,
        dieDataUrl,
        imprintDataUrl,
    };
}
