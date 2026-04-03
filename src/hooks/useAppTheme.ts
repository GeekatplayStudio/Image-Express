'use client';

import { useEffect, useState } from 'react';
import { THEME_PREFERENCES_CHANGED_EVENT } from '@/lib/themePreferences';
import { getAppTheme, type AppThemeTokens } from '@/lib/theme-tokens';

export default function useAppTheme() {
    const [theme, setTheme] = useState<AppThemeTokens>(() => getAppTheme());

    useEffect(() => {
        const syncTheme = () => {
            setTheme(getAppTheme());
        };

        syncTheme();
        window.addEventListener(THEME_PREFERENCES_CHANGED_EVENT, syncTheme);
        window.addEventListener('storage', syncTheme);

        return () => {
            window.removeEventListener(THEME_PREFERENCES_CHANGED_EVENT, syncTheme);
            window.removeEventListener('storage', syncTheme);
        };
    }, []);

    return theme;
}
