'use client';

/**
 * Client runtime for installable UI theme packs (pure-visual, see docs/THEME_PACKS_SPEC.md).
 * Applies a theme by setting data-ui-theme on <html> and injecting a stylesheet link;
 * the default theme injects nothing so the app looks exactly as shipped.
 */

import {
    DEFAULT_UI_THEME,
    DEFAULT_UI_THEME_ID,
    type InstalledUiTheme,
} from '@/lib/ui-themes-shared';
import { applyThemePreferences, loadThemePreferences } from '@/lib/themePreferences';

export {
    UI_THEME_STORAGE_KEY,
    UI_THEME_CHANGED_EVENT,
} from '@/lib/ui-themes-shared';
import {
    UI_THEME_STORAGE_KEY,
    UI_THEME_STYLESHEET_ELEMENT_ID as STYLESHEET_ELEMENT_ID,
    UI_THEME_CHANGED_EVENT,
} from '@/lib/ui-themes-shared';

const FONTS_ELEMENT_ID = 'ui-theme-fonts';

type StoredUiTheme = {
    id: string;
    /** Snapshot used by the pre-hydration boot script to avoid a flash of the default theme. */
    stylesheetUrl?: string;
    lockMode?: 'light' | 'dark';
};

let activeTheme: InstalledUiTheme = DEFAULT_UI_THEME;

export const getActiveUiTheme = (): InstalledUiTheme => activeTheme;

export const loadStoredUiTheme = (): StoredUiTheme => {
    if (typeof window === 'undefined') {
        return { id: DEFAULT_UI_THEME_ID };
    }
    try {
        const raw = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
        if (!raw) return { id: DEFAULT_UI_THEME_ID };
        const parsed = JSON.parse(raw) as Partial<StoredUiTheme>;
        if (typeof parsed?.id !== 'string') return { id: DEFAULT_UI_THEME_ID };
        return {
            id: parsed.id,
            stylesheetUrl: typeof parsed.stylesheetUrl === 'string' ? parsed.stylesheetUrl : undefined,
            lockMode: parsed.lockMode === 'light' || parsed.lockMode === 'dark' ? parsed.lockMode : undefined,
        };
    } catch {
        return { id: DEFAULT_UI_THEME_ID };
    }
};

export const listUiThemes = async (): Promise<InstalledUiTheme[]> => {
    const response = await fetch('/api/themes', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to list themes (${response.status})`);
    }
    const payload = await response.json() as { success: boolean; themes?: InstalledUiTheme[]; error?: string };
    if (!payload.success || !Array.isArray(payload.themes)) {
        throw new Error(payload.error || 'Failed to list themes.');
    }
    return payload.themes;
};

const removeElement = (id: string) => {
    document.getElementById(id)?.remove();
};

const buildFontFaceCss = (theme: InstalledUiTheme): string => (
    (theme.fonts || []).map((font) => `@font-face {
  font-family: ${JSON.stringify(font.family)};
  src: url(${JSON.stringify(theme.baseUrl + font.src)});
  font-weight: ${font.weight || '400'};
  font-style: ${font.style || 'normal'};
  font-display: swap;
}`).join('\n')
);

/** Apply a theme to the document. Pass the default theme (or null) to restore the stock UI. */
export const applyUiTheme = (theme: InstalledUiTheme | null) => {
    if (typeof document === 'undefined') return;
    const next = theme && theme.id !== DEFAULT_UI_THEME_ID ? theme : DEFAULT_UI_THEME;
    const root = document.documentElement;
    activeTheme = next;

    if (next.id === DEFAULT_UI_THEME_ID) {
        delete root.dataset.uiTheme;
        removeElement(STYLESHEET_ELEMENT_ID);
        removeElement(FONTS_ELEMENT_ID);
        // Restore the user's own mode preference (a previous theme may have locked it).
        applyThemePreferences(loadThemePreferences());
        return;
    }

    root.dataset.uiTheme = next.id;

    const fontCss = buildFontFaceCss(next);
    if (fontCss) {
        let fontStyle = document.getElementById(FONTS_ELEMENT_ID) as HTMLStyleElement | null;
        if (!fontStyle) {
            fontStyle = document.createElement('style');
            fontStyle.id = FONTS_ELEMENT_ID;
            document.head.appendChild(fontStyle);
        }
        fontStyle.textContent = fontCss;
    } else {
        removeElement(FONTS_ELEMENT_ID);
    }

    const href = next.baseUrl + next.stylesheet;
    const existing = document.getElementById(STYLESHEET_ELEMENT_ID) as HTMLLinkElement | null;
    if (existing && existing.getAttribute('href') === href) {
        // Stylesheet already in place (e.g. from the boot script).
    } else {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        const finalize = () => {
            if (existing && existing !== link) existing.remove();
            link.id = STYLESHEET_ELEMENT_ID;
        };
        link.addEventListener('load', finalize, { once: true });
        link.addEventListener('error', finalize, { once: true });
        document.head.appendChild(link);
    }

    if (next.lockMode) {
        applyThemePreferences(loadThemePreferences());
        root.dataset.themeMode = next.lockMode;
        root.style.colorScheme = next.lockMode;
    } else {
        applyThemePreferences(loadThemePreferences());
    }
};

/** Persist + apply + notify. `theme` must come from listUiThemes() (or be the default). */
export const activateUiTheme = (theme: InstalledUiTheme) => {
    if (typeof window === 'undefined') return;
    const stored: StoredUiTheme = theme.id === DEFAULT_UI_THEME_ID
        ? { id: DEFAULT_UI_THEME_ID }
        : { id: theme.id, stylesheetUrl: theme.baseUrl + theme.stylesheet, lockMode: theme.lockMode };
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, JSON.stringify(stored));
    applyUiTheme(theme);
    window.dispatchEvent(new Event(UI_THEME_CHANGED_EVENT));
};

/** Re-resolve the stored theme against the server list (used on boot by UiThemeSync). */
export const syncStoredUiTheme = async () => {
    const stored = loadStoredUiTheme();
    if (stored.id === DEFAULT_UI_THEME_ID) {
        activeTheme = DEFAULT_UI_THEME;
        return;
    }
    try {
        const themes = await listUiThemes();
        const match = themes.find((theme) => theme.id === stored.id);
        if (match) {
            // Refresh the stored snapshot in case the pack was reinstalled/updated.
            activateUiTheme(match);
        } else {
            // Theme was uninstalled out from under us — fall back to default.
            activateUiTheme(DEFAULT_UI_THEME);
        }
    } catch {
        // Server unreachable: keep whatever the boot script applied.
    }
};
