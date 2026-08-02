import type { Oklch, Rgb } from '../contracts/types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function normalizeHex(hex: string): string {
    const clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
        return `#${clean.split('').map((token) => `${token}${token}`).join('').toLowerCase()}`;
    }
    if (clean.length !== 6) return '#000000';
    return `#${clean.toLowerCase()}`;
}

/**
 * Parse user-typed hex without collapsing incomplete input to #000000.
 * Returns null while the field is still being edited (e.g. "#33").
 */
export function tryParseHex(hex: string): string | null {
    const clean = hex.replace('#', '').trim();
    if (!/^[0-9a-f]+$/i.test(clean)) return null;
    if (clean.length === 3 || clean.length === 6) return normalizeHex(`#${clean}`);
    return null;
}

export function hexToRgb(hex: string): Rgb {
    const safe = normalizeHex(hex);
    return {
        r: parseInt(safe.slice(1, 3), 16),
        g: parseInt(safe.slice(3, 5), 16),
        b: parseInt(safe.slice(5, 7), 16),
    };
}

export function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function srgbToLinear(channel: number): number {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
    const c = channel <= 0.0031308
        ? 12.92 * channel
        : 1.055 * (channel ** (1 / 2.4)) - 0.055;
    return clamp01(c) * 255;
}

/** Björn Ottosson — linear sRGB → OKLab */
function linearRgbToOklab(r: number, g: number, b: number) {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);
    return {
        L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    };
}

function oklabToLinearRgb(L: number, a: number, b: number) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    return {
        r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    };
}

export function rgbToOklch(rgb: Rgb): Oklch {
    const lab = linearRgbToOklab(
        srgbToLinear(rgb.r),
        srgbToLinear(rgb.g),
        srgbToLinear(rgb.b),
    );
    const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { l: lab.L, c, h: c < 1e-8 ? 0 : h };
}

export function oklchToRgb(oklch: Oklch): Rgb {
    const hRad = (oklch.h * Math.PI) / 180;
    const a = oklch.c * Math.cos(hRad);
    const b = oklch.c * Math.sin(hRad);
    const linear = oklabToLinearRgb(oklch.l, a, b);
    return {
        r: linearToSrgb(linear.r),
        g: linearToSrgb(linear.g),
        b: linearToSrgb(linear.b),
    };
}

export function hexToOklch(hex: string): Oklch {
    return rgbToOklch(hexToRgb(hex));
}

export function oklchToHex(oklch: Oklch): string {
    const rgb = oklchToRgb(oklch);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/** True when OKLCH maps inside the unit sRGB cube (within epsilon). */
export function isInSrgbGamut(oklch: Oklch, epsilon = 0.5): boolean {
    const hRad = (oklch.h * Math.PI) / 180;
    const a = oklch.c * Math.cos(hRad);
    const b = oklch.c * Math.sin(hRad);
    const linear = oklabToLinearRgb(oklch.l, a, b);
    const channels = [linear.r, linear.g, linear.b];
    return channels.every((channel) => channel >= -epsilon / 255 && channel <= 1 + epsilon / 255);
}

/** Reduce chroma until the color fits sRGB (binary search). */
export function clipOklchToSrgb(oklch: Oklch): Oklch {
    if (isInSrgbGamut(oklch)) return oklch;
    let lo = 0;
    let hi = oklch.c;
    for (let i = 0; i < 18; i += 1) {
        const mid = (lo + hi) / 2;
        if (isInSrgbGamut({ ...oklch, c: mid })) lo = mid;
        else hi = mid;
    }
    return { ...oklch, c: lo };
}

export function oklchDeltaE(a: Oklch, b: Oklch): number {
    const ax = a.c * Math.cos((a.h * Math.PI) / 180);
    const ay = a.c * Math.sin((a.h * Math.PI) / 180);
    const bx = b.c * Math.cos((b.h * Math.PI) / 180);
    const by = b.c * Math.sin((b.h * Math.PI) / 180);
    return Math.sqrt((a.l - b.l) ** 2 + (ax - bx) ** 2 + (ay - by) ** 2);
}

/** Map OKLCH → 3D scene coords (Y up): L→Y, C→radius, H→angle. */
export function oklchToScenePosition(oklch: Oklch, chromaScale = 8): [number, number, number] {
    const angle = (oklch.h * Math.PI) / 180;
    const radius = oklch.c * chromaScale;
    return [
        Math.cos(angle) * radius,
        (oklch.l - 0.5) * 4,
        Math.sin(angle) * radius,
    ];
}
