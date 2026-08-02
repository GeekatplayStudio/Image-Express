import type { SavedHarmonyPalette } from '../contracts/types';
import { normalizeHex } from '../domain/oklch';

/** Shared with classic ColorWheelTool so sets interchange. */
export const HARMONY_STORAGE_KEY = 'saved-harmony-palettes';
export const SWATCH_STORAGE_KEY = 'saved-color-swatches';
export const CONSTELLATION_UI_KEY = 'image-express-color-constellation-ui';

export type ConstellationUiPrefs = {
    /** Prefer constellation over classic wheel in Color panel */
    preferConstellation: boolean;
};

const DEFAULT_UI: ConstellationUiPrefs = { preferConstellation: true };

export function loadHarmonyPalettes(): SavedHarmonyPalette[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(HARMONY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as SavedHarmonyPalette[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry) => entry && typeof entry.name === 'string' && Array.isArray(entry.colors))
            .map((entry) => ({
                id: entry.id || `harmony-${Date.now()}-${Math.random()}`,
                name: entry.name,
                createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
                colors: entry.colors.map(normalizeHex).filter((color) => /^#[0-9a-f]{6}$/i.test(color)),
            }))
            .filter((entry) => entry.colors.length >= 2)
            .slice(0, 24);
    } catch {
        return [];
    }
}

export function saveHarmonyPalettes(palettes: SavedHarmonyPalette[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(HARMONY_STORAGE_KEY, JSON.stringify(palettes.slice(0, 24)));
}

export function loadSwatches(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(SWATCH_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as string[];
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeHex).filter((color) => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 64);
    } catch {
        return [];
    }
}

export function saveSwatches(colors: string[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
        SWATCH_STORAGE_KEY,
        JSON.stringify(colors.map(normalizeHex).slice(0, 64)),
    );
}

export function loadConstellationUiPrefs(): ConstellationUiPrefs {
    if (typeof window === 'undefined') return { ...DEFAULT_UI };
    try {
        const raw = window.localStorage.getItem(CONSTELLATION_UI_KEY);
        if (!raw) return { ...DEFAULT_UI };
        const parsed = JSON.parse(raw) as Partial<ConstellationUiPrefs>;
        return {
            preferConstellation: typeof parsed.preferConstellation === 'boolean'
                ? parsed.preferConstellation
                : DEFAULT_UI.preferConstellation,
        };
    } catch {
        return { ...DEFAULT_UI };
    }
}

export function saveConstellationUiPrefs(prefs: Partial<ConstellationUiPrefs>) {
    if (typeof window === 'undefined') return;
    const next = { ...loadConstellationUiPrefs(), ...prefs };
    window.localStorage.setItem(CONSTELLATION_UI_KEY, JSON.stringify(next));
}

export function exportHarmonyJson(palettes: SavedHarmonyPalette[]) {
    return JSON.stringify({
        version: 1,
        exportedAt: Date.now(),
        palettes: palettes.map(({ name, colors, createdAt }) => ({ name, colors, createdAt })),
    }, null, 2);
}

export function importHarmonyJson(raw: string): SavedHarmonyPalette[] {
    const parsed = JSON.parse(raw) as
        | { palettes?: SavedHarmonyPalette[] }
        | SavedHarmonyPalette[];
    const list = Array.isArray(parsed) ? parsed : (parsed.palettes || []);
    return list
        .filter((entry) => entry && typeof entry.name === 'string' && Array.isArray(entry.colors))
        .map((entry, index) => ({
            id: `harmony-import-${Date.now()}-${index}`,
            name: entry.name,
            createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
            colors: entry.colors.map(normalizeHex).filter((color) => /^#[0-9a-f]{6}$/i.test(color)),
        }))
        .filter((entry) => entry.colors.length >= 2);
}
