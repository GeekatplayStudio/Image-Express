/**
 * 3D Stamp Tool - 2D Artwork Renderer
 * Rasterizes text, uploaded images, and borders to generate:
 * 1. Pixel heightmap for 3D relief extrusion
 * 2. Visual stamp die preview
 * 3. Physical impression simulation preview (unmirrored positive)
 */

import { PodiumShape, StampArtworkConfig, StampDimensions } from '../domain/stampTypes';
import { drawArcText, applyLetterSpacing, drawStampBorder } from './stampCanvasArcAndBorders';
import {
    applyBoxBlur,
    applyLevelsAndQuantization,
    applyMorphologicalDilation,
    applyVectorDeSpeckle,
    applyVectorContourSmoothing,
} from './stampImageProcessing';

// Re-export processing helpers for consumers and unit tests
export {
    drawArcText,
    applyLetterSpacing,
    drawStampBorder,
    applyBoxBlur,
    applyLevelsAndQuantization,
    applyMorphologicalDilation,
    applyVectorDeSpeckle,
    applyVectorContourSmoothing,
};

export interface RenderedArtworkResult {
    heightmapData: Uint8ClampedArray;
    gridWidth: number;
    gridHeight: number;
    dieDataUrl: string;       // Mirrored die face view
    imprintDataUrl: string;   // Normal right-side-up imprint view
}

/**
 * Main artwork rasterization function.
 * Produces:
 * 1. heightmapData: 4-channel Uint8ClampedArray for 3D solid mesh extrusion.
 * 2. imprintDataUrl: Positive unmirrored stencil - pure black solid, transparent background.
 * 3. dieDataUrl: Mirrored die face view.
 */
export async function renderStampArtwork(
    artwork: StampArtworkConfig,
    shape: PodiumShape,
    dimensions: StampDimensions,
    canvasSize: number = 512
): Promise<RenderedArtworkResult> {
    const maxDim = canvasSize || 512;
    let canvasW = maxDim;
    let canvasH = maxDim;

    if (shape === 'circular') {
        canvasW = maxDim;
        canvasH = maxDim;
    } else {
        const wMm = Math.max(1, dimensions.widthMm);
        const dMm = Math.max(1, dimensions.depthMm);
        if (wMm >= dMm) {
            canvasW = maxDim;
            canvasH = Math.max(128, Math.round(maxDim * (dMm / wMm)));
        } else {
            canvasW = Math.max(128, Math.round(maxDim * (wMm / dMm)));
            canvasH = maxDim;
        }
    }

    if (typeof document === 'undefined') {
        const dummy = new Uint8ClampedArray(canvasW * canvasH * 4);
        return {
            heightmapData: dummy,
            gridWidth: canvasW,
            gridHeight: canvasH,
            dieDataUrl: '',
            imprintDataUrl: '',
        };
    }

    const totalPixels = canvasW * canvasH;
    // 1. Raw continuous ink intensity buffer (0 = empty background, 255 = full ink)
    const rawInk = new Uint8ClampedArray(totalPixels);
    // Final single-channel relief mask buffer (0 = empty background, 255 = solid stamp relief)
    const mask = new Uint8ClampedArray(totalPixels);

    const pxPerMm = canvasW / Math.max(1, dimensions.widthMm);
    const borderPx = (artwork.borderThicknessMm || 1.5) * pxPerMm;
    const insetPx = (artwork.borderInsetMm || 1.5) * pxPerMm;
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    if (artwork.mode === 'image' && artwork.imageUrl) {
        // Image / Logo Mode: load image and extract continuous grayscale ink luminance
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = artwork.imageUrl!;
            });

            // Inspect the source image dimensions and alpha channel directly
            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = img.width;
            srcCanvas.height = img.height;
            const srcCtx = srcCanvas.getContext('2d')!;
            srcCtx.drawImage(img, 0, 0);
            const srcPixels = srcCtx.getImageData(0, 0, img.width, img.height).data;

            // Check if source image has transparent pixels
            let transparentPixels = 0;
            let totalSampled = 0;
            let sumLumaOpaque = 0;
            let countOpaque = 0;

            const step = Math.max(1, Math.floor((img.width * img.height) / 4000));
            for (let i = 0; i < srcPixels.length; i += step * 4) {
                const a = srcPixels[i + 3];
                totalSampled++;
                if (a < 230) {
                    transparentPixels++;
                } else {
                    const luma = 0.299 * srcPixels[i] + 0.587 * srcPixels[i + 1] + 0.114 * srcPixels[i + 2];
                    sumLumaOpaque += luma;
                    countOpaque++;
                }
            }

            const hasAlpha = transparentPixels / Math.max(1, totalSampled) > 0.02;
            const avgLumaOpaque = countOpaque > 0 ? sumLumaOpaque / countOpaque : 128;

            // Sample 4 corners for background color of opaque scans
            const corner0 = 0.299 * srcPixels[0] + 0.587 * srcPixels[1] + 0.114 * srcPixels[2];
            const corner1Idx = (img.width - 1) * 4;
            const corner1 = 0.299 * srcPixels[corner1Idx] + 0.587 * srcPixels[corner1Idx + 1] + 0.114 * srcPixels[corner1Idx + 2];
            const corner2Idx = (img.width * (img.height - 1)) * 4;
            const corner2 = 0.299 * srcPixels[corner2Idx] + 0.587 * srcPixels[corner2Idx + 1] + 0.114 * srcPixels[corner2Idx + 2];
            const corner3Idx = (img.width * img.height - 1) * 4;
            const corner3 = 0.299 * srcPixels[corner3Idx] + 0.587 * srcPixels[corner3Idx + 1] + 0.114 * srcPixels[corner3Idx + 2];
            const avgCornerLuma = (corner0 + corner1 + corner2 + corner3) / 4;

            let isDarkInk = true;
            if (hasAlpha) {
                isDarkInk = avgLumaOpaque < 160;
            } else {
                isDarkInk = avgCornerLuma > 140;
            }

            const inversionMode = artwork.imageInversion ?? 'auto';
            const useDarkInk = inversionMode === 'auto' ? isDarkInk : inversionMode === 'dark-ink';

            // Draw image centered with padding into canvasW x canvasH
            const imgCanvas = document.createElement('canvas');
            imgCanvas.width = canvasW;
            imgCanvas.height = canvasH;
            const imgCtx = imgCanvas.getContext('2d')!;
            imgCtx.imageSmoothingEnabled = true;
            imgCtx.imageSmoothingQuality = 'high';

            const pad = insetPx + borderPx * 2;
            const availW = canvasW - pad * 2;
            const availH = canvasH - pad * 2;
            const scale = Math.min(availW / img.width, availH / img.height);
            const drawW = Math.round(img.width * scale);
            const drawH = Math.round(img.height * scale);
            const drawX = Math.round(cx - drawW / 2);
            const drawY = Math.round(cy - drawH / 2);

            imgCtx.drawImage(img, drawX, drawY, drawW, drawH);
            const imgPixels = imgCtx.getImageData(0, 0, canvasW, canvasH).data;

            for (let y = 0; y < canvasH; y++) {
                for (let x = 0; x < canvasW; x++) {
                    if (x < drawX || x >= drawX + drawW || y < drawY || y >= drawY + drawH) {
                        rawInk[y * canvasW + x] = 0;
                        continue;
                    }

                    const idx = (y * canvasW + x) * 4;
                    const r = imgPixels[idx];
                    const g = imgPixels[idx + 1];
                    const b = imgPixels[idx + 2];
                    const a = imgPixels[idx + 3];

                    let inkVal = 0;
                    if (hasAlpha) {
                        if (a < 10) {
                            inkVal = 0;
                        } else {
                            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                            const inkBase = useDarkInk ? Math.max(0, 255 - luma) : luma;
                            inkVal = Math.round(inkBase * (a / 255));
                        }
                    } else {
                        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                        inkVal = useDarkInk ? Math.max(0, 255 - luma) : luma;
                    }
                    rawInk[y * canvasW + x] = inkVal;
                }
            }
        } catch {
            // Fallback to empty if image fails
        }
    } else {
        // Text Generator Mode: render solid text typography
        const textCanvas = document.createElement('canvas');
        textCanvas.width = canvasW;
        textCanvas.height = canvasH;
        const tCtx = textCanvas.getContext('2d')!;
        tCtx.imageSmoothingEnabled = true;
        tCtx.imageSmoothingQuality = 'high';

        const { text } = artwork;
        tCtx.fillStyle = '#ffffff';
        tCtx.textAlign = 'center';
        tCtx.textBaseline = 'middle';
        const fontStyle = `${text.isItalic ? 'italic ' : ''}${text.isBold ? 'bold ' : ''}`;
        const minDim = Math.min(canvasW, canvasH);
        const fontSizePx = Math.round((text.fontSize / 50) * (minDim * 0.1));
        tCtx.font = `${fontStyle}${fontSizePx}px "${text.fontFamily}", sans-serif`;

        // Letter spacing is authored in design units; scale it with the rendered font size.
        // Arc text does its own per-glyph advance, so tracking is only pushed onto the
        // context for straight lines (where measureText would otherwise double-count it).
        const letterSpacingPx = ((text.letterSpacing || 0) / 50) * fontSizePx;

        if (text.arcMode === 'circular-arc' || text.arcMode === 'top-bottom-arc') {
            const arcR = (minDim / 2) - insetPx - borderPx * 3.5;
            drawArcText(tCtx, text.primaryText, cx, cy, arcR, -Math.PI / 2, false, letterSpacingPx);

            if (text.secondaryText) {
                drawArcText(tCtx, text.secondaryText, cx, cy, arcR, Math.PI / 2, true, letterSpacingPx);
            }

            if (text.centerIcon) {
                tCtx.font = `${fontStyle}${Math.round(fontSizePx * 1.5)}px "${text.fontFamily}", sans-serif`;
                tCtx.fillText(text.centerIcon, cx, cy);
            }
        } else {
            applyLetterSpacing(tCtx, letterSpacingPx);
            if (text.secondaryText.trim()) {
                tCtx.font = `${fontStyle}${Math.round(fontSizePx * 1.1)}px "${text.fontFamily}", sans-serif`;
                tCtx.fillText(text.primaryText, cx, cy - fontSizePx * 0.65);

                const secondarySize = Math.max(12, Math.round(fontSizePx * 0.55));
                tCtx.font = `600 ${secondarySize}px "${text.fontFamily}", sans-serif`;
                tCtx.fillText(text.secondaryText, cx, cy + fontSizePx * 0.85);
            } else {
                tCtx.font = `${fontStyle}${fontSizePx * 1.2}px "${text.fontFamily}", sans-serif`;
                tCtx.fillText(text.primaryText, cx, cy);
            }
        }

        const tPixels = tCtx.getImageData(0, 0, canvasW, canvasH).data;
        for (let i = 0; i < rawInk.length; i++) {
            const idx = i * 4;
            const r = tPixels[idx];
            const g = tPixels[idx + 1];
            const b = tPixels[idx + 2];
            const a = tPixels[idx + 3];
            rawInk[i] = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * (a / 255));
        }
    }

    // 2. Apply Photoshop-style Levels, Gamma, Bit-Depth Quantization, and Thresholding on rawInk
    for (let i = 0; i < mask.length; i++) {
        mask[i] = applyLevelsAndQuantization(
            rawInk[i],
            artwork.blackLevel,
            artwork.whiteLevel,
            artwork.gamma,
            artwork.bitDepthSteps,
            artwork.threshold,
            artwork.useContinuousGrayscale
        );
    }

    // 3. Vector Distance Field Contour Smoothing & Dilation (smooth diagonals, circles, connections)
    if (artwork.vectorSmoothing ?? true) {
        applyVectorDeSpeckle(mask, canvasW, canvasH);
        const smoothness = Math.max(1.0, Math.min(3.5, artwork.smoothRadius || 1.6));
        applyVectorContourSmoothing(mask, canvasW, canvasH, smoothness, artwork.lineThickening ?? 0);
    } else {
        if (artwork.lineThickening > 0) {
            applyMorphologicalDilation(mask, canvasW, canvasH, artwork.lineThickening);
        }
        if (artwork.smoothRadius > 0) {
            applyBoxBlur(mask, canvasW, canvasH, artwork.smoothRadius);
        }
    }

    // 4. Draw solid borders
    if (artwork.borderStyle !== 'none') {
        const borderCanvas = document.createElement('canvas');
        borderCanvas.width = canvasW;
        borderCanvas.height = canvasH;
        const bCtx = borderCanvas.getContext('2d')!;
        drawStampBorder(bCtx, shape, canvasW, canvasH, artwork.borderStyle, borderPx, insetPx);
        const bPixels = bCtx.getImageData(0, 0, canvasW, canvasH).data;
        for (let i = 0; i < mask.length; i++) {
            const bVal = bPixels[i * 4];
            if (bVal > mask[i]) {
                mask[i] = bVal;
            }
        }
    }

    // 5. Invert Relief if configured (e.g. wax seal deboss carving)
    if (artwork.invertRelief) {
        for (let i = 0; i < mask.length; i++) {
            mask[i] = 255 - mask[i];
        }
    }

    // 6. Generate 2D stencil: solid black artwork on a transparent background
    const imprintCanvas = document.createElement('canvas');
    imprintCanvas.width = canvasW;
    imprintCanvas.height = canvasH;
    const impCtx = imprintCanvas.getContext('2d')!;
    const impImgData = impCtx.createImageData(canvasW, canvasH);
    const impPixels = impImgData.data;

    for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
            const idx = (y * canvasW + x) * 4;
            const val = mask[y * canvasW + x];
            // Black solid artwork (#000000) with transparency where background is removed
            impPixels[idx] = 0;       // R
            impPixels[idx + 1] = 0;   // G
            impPixels[idx + 2] = 0;   // B
            impPixels[idx + 3] = val; // A (solid where val = 255, transparent where 0)
        }
    }
    impCtx.putImageData(impImgData, 0, 0);
    const imprintDataUrl = imprintCanvas.toDataURL('image/png');

    // 7. Generate Die Face Stencil (Horizontally Mirrored)
    const dieCanvas = document.createElement('canvas');
    dieCanvas.width = canvasW;
    dieCanvas.height = canvasH;
    const dieCtx = dieCanvas.getContext('2d')!;
    const dieImgData = dieCtx.createImageData(canvasW, canvasH);
    const diePixels = dieImgData.data;

    for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
            const srcX = canvasW - 1 - x;
            const idx = (y * canvasW + x) * 4;
            const val = mask[y * canvasW + srcX];
            diePixels[idx] = 0;
            diePixels[idx + 1] = 0;
            diePixels[idx + 2] = 0;
            diePixels[idx + 3] = val;
        }
    }
    dieCtx.putImageData(dieImgData, 0, 0);
    const dieDataUrl = dieCanvas.toDataURL('image/png');

    // 8. Generate Heightmap Data for 3D Mesh Extrusion (Height 0..255)
    const heightmapData = new Uint8ClampedArray(canvasW * canvasH * 4);
    for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
            // If physical flip is enabled, die heightmap is mirrored so physical stamp is unmirrored
            const srcX = artwork.flipHorizontal ? (canvasW - 1 - x) : x;
            const val = mask[y * canvasW + srcX];
            const idx = (y * canvasW + x) * 4;
            heightmapData[idx] = val;
            heightmapData[idx + 1] = val;
            heightmapData[idx + 2] = val;
            heightmapData[idx + 3] = 255;
        }
    }

    return {
        heightmapData,
        gridWidth: canvasW,
        gridHeight: canvasH,
        dieDataUrl,
        imprintDataUrl,
    };
}
