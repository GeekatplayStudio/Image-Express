/**
 * Central registry of every image file format Image Express can open.
 *
 * Formats browsers decode natively (JPEG/PNG/WebP/GIF/BMP/SVG/AVIF) are
 * passed straight through. Everything else is converted to a displayable
 * PNG on import by `universalImageDecoder.ts` before it ever reaches the
 * asset library or the canvas — see that file for the conversion strategy
 * per format (and its honest limitations, e.g. camera RAW previews).
 */

export type ImageFormatCategory =
    | 'native'
    | 'heic'
    | 'tiff'
    | 'psd'
    | 'pdf'
    | 'raw'
    | 'radiance'
    | 'eps';

export interface ImageFormatEntry {
    /** Lowercase extension including the dot, e.g. ".png". */
    ext: string;
    /** Short display label, e.g. "Photoshop Document". */
    label: string;
    category: ImageFormatCategory;
}

export const IMAGE_FORMATS: ImageFormatEntry[] = [
    // Natively decodable by every modern browser — no conversion needed.
    { ext: '.jpg', label: 'JPEG', category: 'native' },
    { ext: '.jpeg', label: 'JPEG', category: 'native' },
    { ext: '.png', label: 'PNG', category: 'native' },
    { ext: '.webp', label: 'WebP', category: 'native' },
    { ext: '.gif', label: 'GIF', category: 'native' },
    { ext: '.bmp', label: 'Bitmap', category: 'native' },
    { ext: '.svg', label: 'SVG', category: 'native' },
    { ext: '.avif', label: 'AVIF', category: 'native' },

    // HEIC/HEIF family (iPhone photos). Decoded client-side to PNG.
    { ext: '.heic', label: 'HEIC', category: 'heic' },
    { ext: '.heif', label: 'HEIF', category: 'heic' },

    // TIFF. Decoded client-side to PNG.
    { ext: '.tif', label: 'TIFF', category: 'tiff' },
    { ext: '.tiff', label: 'TIFF', category: 'tiff' },

    // Photoshop composite image. Decoded client-side to PNG.
    { ext: '.psd', label: 'Photoshop Document', category: 'psd' },

    // PDF, and modern Illustrator files (AI 9+ is PDF-compatible) —
    // rendered client-side: first page rasterized to PNG.
    { ext: '.pdf', label: 'PDF', category: 'pdf' },
    { ext: '.ai', label: 'Illustrator', category: 'pdf' },

    // Encapsulated PostScript — only the embedded preview raster (if any)
    // is extracted; there is no PostScript interpreter in the browser.
    { ext: '.eps', label: 'EPS', category: 'eps' },

    // Camera RAW formats. There is no practical in-browser RAW processor,
    // so Image Express extracts the embedded preview/thumbnail JPEG that
    // virtually every RAW file carries (the same image your camera or OS
    // file browser shows you) rather than "developing" the raw sensor data.
    { ext: '.dng', label: 'DNG (incl. Apple ProRAW)', category: 'raw' },
    { ext: '.cr2', label: 'Canon RAW 2', category: 'raw' },
    { ext: '.cr3', label: 'Canon RAW 3', category: 'raw' },
    { ext: '.nef', label: 'Nikon RAW', category: 'raw' },
    { ext: '.nrw', label: 'Nikon RAW (compact)', category: 'raw' },
    { ext: '.arw', label: 'Sony RAW', category: 'raw' },
    { ext: '.raf', label: 'Fujifilm RAW', category: 'raw' },
    { ext: '.orf', label: 'Olympus RAW', category: 'raw' },
    { ext: '.rw2', label: 'Panasonic RAW', category: 'raw' },
    { ext: '.pef', label: 'Pentax RAW', category: 'raw' },

    // Radiance HDR. Tone-mapped client-side to a viewable PNG.
    { ext: '.hdr', label: 'Radiance HDR', category: 'radiance' },
    // OpenEXR. Tone-mapped client-side to a viewable PNG.
    { ext: '.exr', label: 'OpenEXR', category: 'radiance' },
];

const IMAGE_FORMAT_BY_EXT = new Map(IMAGE_FORMATS.map((entry) => [entry.ext, entry]));

export function getExtension(filename: string): string {
    const lower = filename.toLowerCase();
    const dotIndex = lower.lastIndexOf('.');
    return dotIndex >= 0 ? lower.slice(dotIndex) : '';
}

export function getImageFormatEntry(filename: string): ImageFormatEntry | undefined {
    return IMAGE_FORMAT_BY_EXT.get(getExtension(filename));
}

export function isKnownImageExtension(filename: string): boolean {
    return IMAGE_FORMAT_BY_EXT.has(getExtension(filename));
}

/** Extensions that browsers can decode without any client-side conversion. */
export const NATIVE_IMAGE_EXTENSIONS = new Set(
    IMAGE_FORMATS.filter((entry) => entry.category === 'native').map((entry) => entry.ext)
);

/** Full set of extensions Image Express can import (for AssetLibrary type detection etc). */
export const ALL_IMAGE_EXTENSIONS = new Set(IMAGE_FORMATS.map((entry) => entry.ext));

/** `accept` attribute value for `<input type="file">` image pickers. */
export function buildImageAcceptAttribute(): string {
    return ['image/*', ...IMAGE_FORMATS.map((entry) => entry.ext)].join(',');
}
