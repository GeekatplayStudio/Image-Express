'use client';

import { useEffect } from 'react';
import { syncStoredUiTheme } from '@/lib/ui-themes';

/**
 * Reconciles the stored UI theme pack with the server on boot: refreshes the
 * cached stylesheet snapshot and falls back to the default theme if the pack
 * was uninstalled. The pre-hydration script in layout.tsx already applied the
 * cached stylesheet, so this never causes a visible flash.
 */
export default function UiThemeSync() {
    useEffect(() => {
        void syncStoredUiTheme();
    }, []);

    return null;
}
