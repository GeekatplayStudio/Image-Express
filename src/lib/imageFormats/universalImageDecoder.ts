'use client';

/**
 * Converts any of Image Express's supported import formats into a
 * displayable PNG blob, so the rest of the app (thumbnails, the Fabric
 * canvas, export) only ever has to deal with real, browser-decodable
 * image bytes.
 *
 * Native formats (JPEG/PNG/WebP/GIF/BMP/SVG/AVIF) pass through untouched.
 * Everything else is decoded here. See supportedFormats.ts for the full
 * format list and category assignment.
 */

import { getExtension, getImageFormatEntry } from './supportedFormats';

export interface DecodedImageResult {
    /** Displayable PNG (or the original blob, for native formats). */
    blob: Blob;
    /** Null when no conversion was needed. */
    convertedFromLabel: string | null;
    /** Set when the result is a best-effort preview, not the full image. */
    isPreviewOnly: boolean;
}

export class UnsupportedImageFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedImageFormatError';
    }
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to encode PNG.'));
        }, 'image/png');
    });
}

async function decodeHeic(file: File): Promise<Blob> {
    const { heicTo } = await import('heic-to');
    return heicTo({ blob: file, type: 'image/png', quality: 0.92 });
}

async function decodeTiff(file: File): Promise<Blob> {
    const UTIF = await import('utif2');
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds.length) throw new Error('No image found in TIFF file.');
    const ifd = ifds[0];
    UTIF.decodeImage(buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);

    const canvas = document.createElement('canvas');
    canvas.width = ifd.width;
    canvas.height = ifd.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    const imageData = ctx.createImageData(ifd.width, ifd.height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
    return canvasToPngBlob(canvas);
}

async function decodePsd(file: File): Promise<Blob> {
    const { readPsd } = await import('ag-psd');
    const buffer = await file.arrayBuffer();
    const psd = readPsd(buffer, { skipLayerImageData: true });
    if (!psd.canvas) throw new Error('Could not render a composite image from this PSD.');
    return canvasToPngBlob(psd.canvas);
}

let pdfWorkerConfigured = false;

async function decodePdfOrAi(file: File): Promise<Blob> {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfWorkerConfigured) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
        ).toString();
        pdfWorkerConfigured = true;
    }

    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvasToPngBlob(canvas);
}

/** Simple Reinhard tone-map + gamma so HDR/EXR float data becomes viewable. */
function toneMapFloatRgbaToPng(width: number, height: number, data: Float32Array, exposure = 1): Blob | Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    const imageData = ctx.createImageData(width, height);
    const out = imageData.data;
    const channels = data.length / (width * height);

    for (let pixel = 0; pixel < width * height; pixel++) {
        const srcIndex = pixel * channels;
        const dstIndex = pixel * 4;
        for (let channel = 0; channel < 3; channel++) {
            const raw = (data[srcIndex + channel] ?? 0) * exposure;
            const toneMapped = raw / (1 + raw); // Reinhard
            out[dstIndex + channel] = Math.max(0, Math.min(255, Math.round(Math.pow(toneMapped, 1 / 2.2) * 255)));
        }
        out[dstIndex + 3] = channels >= 4 ? Math.round((data[srcIndex + 3] ?? 1) * 255) : 255;
    }

    // Most EXR/HDR loaders flip scanline order relative to canvas rows.
    ctx.putImageData(imageData, 0, 0);
    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(canvas, 0, -height);
    ctx.restore();

    return canvasToPngBlob(canvas);
}

async function decodeExr(file: File): Promise<Blob> {
    const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
    const { FloatType } = await import('three');
    const loader = new EXRLoader();
    loader.setDataType(FloatType);
    const buffer = await file.arrayBuffer();
    const parsed = loader.parse(buffer);
    if (!parsed.width || !parsed.height) throw new Error('Failed to parse EXR image dimensions.');
    return toneMapFloatRgbaToPng(parsed.width, parsed.height, parsed.data as Float32Array);
}

async function decodeHdr(file: File): Promise<Blob> {
    const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
    const { FloatType } = await import('three');
    const loader = new RGBELoader();
    loader.setDataType(FloatType);
    const buffer = await file.arrayBuffer();
    const parsed = loader.parse(buffer);
    if (!parsed.width || !parsed.height) throw new Error('Failed to parse HDR image dimensions.');
    return toneMapFloatRgbaToPng(parsed.width, parsed.height, parsed.data as Float32Array);
}

/**
 * Camera RAW files (and legacy EPS) can't be fully decoded in a browser —
 * there's no licensed demosaicing/PostScript engine to run client-side.
 * Instead we extract the embedded preview/thumbnail JPEG that the format
 * itself carries (the same image your camera's LCD or a file browser
 * shows you), which is genuinely useful for placing on the canvas even
 * though it isn't a from-sensor "develop".
 */
async function decodeRawPreview(file: File): Promise<Blob> {
    const exifr = (await import('exifr')).default;
    const thumbnail = await exifr.thumbnail(file);
    if (!thumbnail) {
        throw new UnsupportedImageFormatError(
            `This RAW file doesn't carry an embedded preview image Image Express can extract. Export a JPEG, TIFF, or DNG preview from your camera app and import that instead.`
        );
    }
    return new Blob([new Uint8Array(thumbnail)], { type: 'image/jpeg' });
}

const DOS_EPS_MAGIC = 0xc5d0d3c6;

async function decodeEps(file: File): Promise<Blob> {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    if (buffer.byteLength < 30 || view.getUint32(0, true) !== DOS_EPS_MAGIC) {
        throw new UnsupportedImageFormatError(
            `This EPS file has no embedded preview image ("DOS EPS" binary header) for Image Express to extract, and there is no PostScript interpreter in the browser. Export a PDF, TIFF, or PNG from the original application instead.`
        );
    }

    const tiffOffset = view.getUint32(20, true);
    const tiffLength = view.getUint32(24, true);
    if (!tiffLength) {
        throw new UnsupportedImageFormatError(
            `This EPS file's preview is not a TIFF Image Express can decode. Export a PDF, TIFF, or PNG instead.`
        );
    }

    const tiffBuffer = buffer.slice(tiffOffset, tiffOffset + tiffLength);
    return decodeTiff(new File([tiffBuffer], 'preview.tif', { type: 'image/tiff' }));
}

/**
 * Ensures `file` is a displayable image, converting it to PNG when the
 * browser can't decode the source format natively. Throws
 * `UnsupportedImageFormatError` (with a user-facing message) when a
 * format has no viable decode/preview path.
 */
export async function ensureDisplayableImage(file: File): Promise<DecodedImageResult> {
    const entry = getImageFormatEntry(file.name);
    const ext = getExtension(file.name);

    if (!entry || entry.category === 'native') {
        return { blob: file, convertedFromLabel: null, isPreviewOnly: false };
    }

    try {
        switch (entry.category) {
            case 'heic':
                return { blob: await decodeHeic(file), convertedFromLabel: entry.label, isPreviewOnly: false };
            case 'tiff':
                return { blob: await decodeTiff(file), convertedFromLabel: entry.label, isPreviewOnly: false };
            case 'psd':
                return { blob: await decodePsd(file), convertedFromLabel: entry.label, isPreviewOnly: false };
            case 'pdf':
                return { blob: await decodePdfOrAi(file), convertedFromLabel: entry.label, isPreviewOnly: ext === '.ai' };
            case 'radiance':
                return {
                    blob: ext === '.exr' ? await decodeExr(file) : await decodeHdr(file),
                    convertedFromLabel: entry.label,
                    isPreviewOnly: true, // tone-mapped preview, not the original HDR data
                };
            case 'raw':
                return { blob: await decodeRawPreview(file), convertedFromLabel: entry.label, isPreviewOnly: true };
            case 'eps':
                return { blob: await decodeEps(file), convertedFromLabel: entry.label, isPreviewOnly: true };
            default:
                return { blob: file, convertedFromLabel: null, isPreviewOnly: false };
        }
    } catch (error) {
        if (error instanceof UnsupportedImageFormatError) throw error;
        const message = error instanceof Error
            ? error.message
            : (typeof error === 'object' && error && 'message' in error)
                ? String((error as { message: unknown }).message)
                : String(error);
        throw new UnsupportedImageFormatError(`Could not open this ${entry.label} file: ${message}`);
    }
}

/** True when `filename` needs `ensureDisplayableImage` before use. */
export function needsImageConversion(filename: string): boolean {
    const entry = getImageFormatEntry(filename);
    return !!entry && entry.category !== 'native';
}
