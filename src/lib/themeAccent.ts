/**
 * A custom interface accent from one colour.
 *
 * The four shipped accents each set nine CSS variables by hand. A user-chosen
 * colour has to produce the same nine, and has to stay readable: the text on
 * a primary button, and the primary against the page, are checked with the
 * WCAG contrast formula and reported so the settings panel can warn before
 * the colour is saved. Nothing here touches the DOM; `themePreferences`
 * applies the result.
 */

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

export type CustomAccent = {
    /** Normalised `#rrggbb`. */
    primary: string;
    /** The nine variables the shipped accents set, ready for `style.setProperty`. */
    variables: Record<string, string>;
    /** Text colour chosen for primary surfaces. */
    foreground: 'light' | 'dark';
    contrast: {
        /** Foreground text on the primary colour. AA for normal text is 4.5. */
        textOnPrimary: number;
        /** Primary against the dark theme's page background. */
        onDarkBackground: number;
        /** Primary against the light theme's page background. */
        onLightBackground: number;
    };
    /**
     * Keys of warnings the panel shows; empty when every ratio meets its bar.
     * Text on the accent is never warned about: the better of white and
     * near-black always reaches at least 4.2:1, so it is reported, not flagged.
     */
    warnings: Array<'onDarkBackground' | 'onLightBackground'>;
};

/** Page backgrounds from globals.css, as the ratios are measured against them. */
export const DARK_BACKGROUND_HEX = '#0e0e10'; // hsl(240 5% 6%)
export const LIGHT_BACKGROUND_HEX = '#f7f9fc'; // hsl(210 40% 98%)
/** White stays the text colour down to this ratio (AA for bold UI labels); below it near-black takes over. */
export const TEXT_CONTRAST_MIN = 3;
/** Below this, the accent no longer reads as a distinct control against the page (AA for UI components). */
export const BACKGROUND_CONTRAST_MIN = 3;

export const isHexColor = (value: unknown): value is string => (
    typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
);

export const normalizeHex = (value: string): string => {
    const hex = value.trim().toLowerCase().replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    return `#${full}`;
};

export const hexToRgb = (hex: string): Rgb => {
    const value = normalizeHex(hex).slice(1);
    return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
};

export const rgbToHex = ({ r, g, b }: Rgb): string => (
    `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`
);

export const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
    return { h, s: s * 100, l: l * 100 };
};

export const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
    const sn = Math.max(0, Math.min(100, s)) / 100, ln = Math.max(0, Math.min(100, l)) / 100;
    const hn = ((h % 360) + 360) % 360 / 360;
    if (sn === 0) return { r: ln * 255, g: ln * 255, b: ln * 255 };
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    const channel = (t0: number) => {
        let t = t0;
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return { r: channel(hn + 1 / 3) * 255, g: channel(hn) * 255, b: channel(hn - 1 / 3) * 255 };
};

const hslString = ({ h, s, l }: Hsl) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
const shift = (hsl: Hsl, by: Partial<Hsl>): Hsl => ({ h: hsl.h + (by.h ?? 0), s: Math.max(0, Math.min(100, hsl.s + (by.s ?? 0))), l: Math.max(0, Math.min(100, hsl.l + (by.l ?? 0))) });

/** WCAG 2.x relative luminance of an sRGB colour. */
export const relativeLuminance = ({ r, g, b }: Rgb): number => {
    const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** WCAG contrast ratio, 1 to 21, rounded to two decimals. */
export const contrastRatio = (a: string, b: string): number => {
    const la = relativeLuminance(hexToRgb(a));
    const lb = relativeLuminance(hexToRgb(b));
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

export function deriveCustomAccent(input: string): CustomAccent | null {
    if (!isHexColor(input)) return null;
    const primary = normalizeHex(input);
    const hsl = rgbToHsl(hexToRgb(primary));

    // White text is the house style (the shipped accents sit near 3.6:1); it
    // gives way to near-black only when the accent is light enough that white
    // drops below the bold-label bar.
    const onWhite = contrastRatio(primary, '#ffffff');
    const onDark = contrastRatio(primary, '#111827');
    const foreground: CustomAccent['foreground'] = onWhite >= TEXT_CONTRAST_MIN || onWhite >= onDark ? 'light' : 'dark';
    const foregroundHex = foreground === 'light' ? '#ffffff' : '#111827';

    const tool = shift(hsl, { l: -6, s: -4 });
    const variables: Record<string, string> = {
        '--primary': hslString(hsl),
        '--primary-foreground': foreground === 'light' ? 'hsl(0 0% 100%)' : 'hsl(222 47% 11%)',
        '--tool-accent': hslString(tool),
        '--tool-accent-foreground': foreground === 'light' ? 'hsl(0 0% 100%)' : 'hsl(222 47% 11%)',
        '--ui-brand-gradient-start': rgbToHex(hslToRgb(shift(hsl, { l: -12 }))),
        '--ui-brand-gradient-mid': primary,
        '--ui-brand-gradient-end': rgbToHex(hslToRgb(shift(hsl, { h: 32, l: 4 }))),
        '--ui-avatar-gradient-start': hslString(shift(hsl, { l: 14, s: -6 })),
        '--ui-avatar-gradient-end': hslString(shift(hsl, { h: -14, l: 2 })),
    };

    const contrast = {
        textOnPrimary: contrastRatio(primary, foregroundHex),
        onDarkBackground: contrastRatio(primary, DARK_BACKGROUND_HEX),
        onLightBackground: contrastRatio(primary, LIGHT_BACKGROUND_HEX),
    };
    const warnings: CustomAccent['warnings'] = [];
    if (contrast.onDarkBackground < BACKGROUND_CONTRAST_MIN) warnings.push('onDarkBackground');
    if (contrast.onLightBackground < BACKGROUND_CONTRAST_MIN) warnings.push('onLightBackground');

    return { primary, variables, foreground, contrast, warnings };
}

/** The variable names a custom accent sets, for clearing them when a preset is chosen again. */
export const CUSTOM_ACCENT_VARIABLES = [
    '--primary', '--primary-foreground', '--tool-accent', '--tool-accent-foreground',
    '--ui-brand-gradient-start', '--ui-brand-gradient-mid', '--ui-brand-gradient-end',
    '--ui-avatar-gradient-start', '--ui-avatar-gradient-end',
] as const;
