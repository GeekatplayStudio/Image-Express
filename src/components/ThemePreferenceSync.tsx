'use client';

import { useEffect } from 'react';
import {
    THEME_PREFERENCES_CHANGED_EVENT,
    applyThemePreferences,
    loadThemePreferences,
} from '@/lib/themePreferences';

export default function ThemePreferenceSync() {
    useEffect(() => {
        const syncTheme = () => {
            applyThemePreferences(loadThemePreferences());
        };

        syncTheme();

        window.addEventListener(THEME_PREFERENCES_CHANGED_EVENT, syncTheme);
        window.addEventListener('storage', syncTheme);

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener?.('change', syncTheme);

        return () => {
            window.removeEventListener(THEME_PREFERENCES_CHANGED_EVENT, syncTheme);
            window.removeEventListener('storage', syncTheme);
            mediaQuery.removeEventListener?.('change', syncTheme);
        };
    }, []);

    return null;
}