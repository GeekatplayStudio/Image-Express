/** OKLCH / Oklab perceptual color types for Color Constellation. */

export type Oklch = {
    /** Lightness 0–1 */
    l: number;
    /** Chroma ≥ 0 (typical sRGB max ~0.4) */
    c: number;
    /** Hue degrees 0–360 */
    h: number;
};

export type Rgb = { r: number; g: number; b: number };

export type ConstellationRole =
    | 'primary'
    | 'secondary'
    | 'tertiary'
    | 'hover'
    | 'pressed'
    | 'background'
    | 'highlight'
    | 'shadow'
    | 'neutral';

export type ConstellationNode = {
    id: string;
    role: ConstellationRole;
    oklch: Oklch;
    hex: string;
    /** Locked brand pins resist bulk transforms */
    pinned?: boolean;
};

export type HarmonyKind =
    | 'complementary'
    | 'analogous'
    | 'triadic'
    | 'tetradic'
    | 'pentadic'
    | 'hexadic'
    | 'split-complementary';

export type SavedHarmonyPalette = {
    id: string;
    name: string;
    colors: string[];
    createdAt: number;
};

export type ConstellationEdge = {
    fromId: string;
    toId: string;
};
