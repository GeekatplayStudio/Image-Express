import { useEffect } from 'react';
import { WINDOW_PANEL_ITEMS } from '@/components/Editor/editorViewConfig';
import type { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';

type UseEditorPanelModePersistenceArgs = {
    storageKey: string;
    propertiesPanelMode: PanelRailMode;
    setPropertiesPanelMode: (mode: PanelRailMode) => void;
};

export function useEditorPanelModePersistence({
    storageKey,
    propertiesPanelMode,
    setPropertiesPanelMode,
}: UseEditorPanelModePersistenceArgs) {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const persistedMode = window.localStorage.getItem(storageKey);
        if (persistedMode) {
            const matched = WINDOW_PANEL_ITEMS.find((item) => item.mode === persistedMode);
            if (matched) {
                setPropertiesPanelMode(matched.mode);
            }
        }
    }, [setPropertiesPanelMode, storageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(storageKey, propertiesPanelMode);
    }, [propertiesPanelMode, storageKey]);
}
