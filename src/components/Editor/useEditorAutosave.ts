import { useCallback, useEffect, useRef, useState } from 'react';

import {
    loadUiPreferences,
    saveUiPreferences,
    UI_PREFERENCES_CHANGED_EVENT,
} from '@/lib/ui-preferences';

export const AUTOSAVE_DEBOUNCE_MS = 5000;

type UseEditorAutosaveArgs = {
    isDirty: boolean;
    designId: string | null;
    designName: string;
    handleSave: () => Promise<void>;
};

/**
 * Debounced autosave: when the user enables the option, dirty work is saved
 * automatically a few seconds after the last change. Autosave never opens
 * dialogs, so it only runs once the design has been saved (named) at least
 * once — until then the user's explicit Save assigns the name.
 */
export function useEditorAutosave({ isDirty, designId, designName, handleSave }: UseEditorAutosaveArgs) {
    const [autosaveEnabled, setAutosaveEnabledState] = useState(false);
    const [isAutosaving, setIsAutosaving] = useState(false);
    const timerRef = useRef<number | null>(null);
    const savingRef = useRef(false);
    const handleSaveRef = useRef(handleSave);

    useEffect(() => {
        handleSaveRef.current = handleSave;
    }, [handleSave]);

    // Load + follow the persisted preference.
    useEffect(() => {
        const sync = () => setAutosaveEnabledState(loadUiPreferences().autosaveEnabled);
        sync();
        window.addEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
        return () => window.removeEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
    }, []);

    const setAutosaveEnabled = useCallback((enabled: boolean) => {
        setAutosaveEnabledState(enabled);
        saveUiPreferences({ autosaveEnabled: enabled });
    }, []);

    const canAutosave = Boolean(designId) || (designName !== '' && designName !== 'Untitled Page');

    useEffect(() => {
        if (!autosaveEnabled || !isDirty || !canAutosave) return undefined;

        timerRef.current = window.setTimeout(() => {
            if (savingRef.current) return;
            savingRef.current = true;
            setIsAutosaving(true);
            void handleSaveRef.current()
                .catch(() => {
                    // handleSave surfaces its own error toasts; autosave just retries on the next change.
                })
                .finally(() => {
                    savingRef.current = false;
                    setIsAutosaving(false);
                });
        }, AUTOSAVE_DEBOUNCE_MS);

        return () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [autosaveEnabled, canAutosave, isDirty]);

    return { autosaveEnabled, setAutosaveEnabled, isAutosaving };
}
