'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadUiPreferences, saveUiPreferences, type PipelineRailMode } from '@/lib/ui-preferences';
import {
    THEME_ACCENT_OPTIONS,
    THEME_MODE_OPTIONS,
    loadThemePreferences,
    saveThemePreferences,
    type ThemeAccentPreset,
    type ThemePreferenceMode,
} from '@/lib/themePreferences';
import { resetNumberDragHintSeen } from '@/lib/number-drag-hints';

/**
 * Editor appearance (theme mode/accent), interface behavior toggles (tool
 * rail hover, number-drag hints), and the login activity log viewer.
 */
export function useWorkspacePreferences(isOpen: boolean, onSaved: () => void) {
    const [expandToolRailLabelsOnHover, setExpandToolRailLabelsOnHover] = useState(true);
    const [suppressNumberDragHints, setSuppressNumberDragHints] = useState(false);
    const [pipelineRailMode, setPipelineRailMode] = useState<PipelineRailMode>('minimal');
    const [notifyOnJobComplete, setNotifyOnJobComplete] = useState(true);
    const [themeMode, setThemeMode] = useState<ThemePreferenceMode>('system');
    const [themeAccentPreset, setThemeAccentPreset] = useState<ThemeAccentPreset>('ocean');

    const [isLogVisible, setIsLogVisible] = useState(false);
    const [logContent, setLogContent] = useState('');
    const [isLogLoading, setIsLogLoading] = useState(false);
    const [logError, setLogError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const uiPreferences = loadUiPreferences();
        setExpandToolRailLabelsOnHover(uiPreferences.expandToolRailLabelsOnHover);
        setSuppressNumberDragHints(uiPreferences.suppressNumberDragHints);
        setPipelineRailMode(uiPreferences.pipelineRailMode);
        setNotifyOnJobComplete(uiPreferences.notifyOnJobComplete);
        const themePreferences = loadThemePreferences();
        setThemeMode(themePreferences.mode);
        setThemeAccentPreset(themePreferences.accentPreset);
    }, [isOpen]);

    const handleToggleLog = useCallback(async () => {
        if (!isLogVisible) {
            setIsLogLoading(true);
            setLogError(null);
            try {
                const res = await fetch('/api/logs/login');
                if (!res.ok) throw new Error(`Status ${res.status}`);
                setLogContent(await res.text());
            } catch (error) {
                console.error('Failed to load login log', error);
                setLogError('Failed to load log. Please try again later.');
                setLogContent('');
            } finally {
                setIsLogLoading(false);
            }
        }
        setIsLogVisible((prev) => !prev);
    }, [isLogVisible]);

    const handleResetNumberDragHint = useCallback(() => {
        resetNumberDragHintSeen();
        setSuppressNumberDragHints(false);
        saveUiPreferences({ suppressNumberDragHints: false });
        onSaved();
    }, [onSaved]);

    const saveWorkspacePreferences = useCallback(() => {
        saveUiPreferences({
            expandToolRailLabelsOnHover,
            suppressNumberDragHints,
            pipelineRailMode,
            notifyOnJobComplete,
        });
        saveThemePreferences({ mode: themeMode, accentPreset: themeAccentPreset });
    }, [expandToolRailLabelsOnHover, suppressNumberDragHints, pipelineRailMode, notifyOnJobComplete, themeAccentPreset, themeMode]);

    return {
        expandToolRailLabelsOnHover, setExpandToolRailLabelsOnHover,
        suppressNumberDragHints, setSuppressNumberDragHints,
        pipelineRailMode, setPipelineRailMode,
        notifyOnJobComplete, setNotifyOnJobComplete,
        themeMode, setThemeMode,
        themeAccentPreset, setThemeAccentPreset,
        isLogVisible,
        logContent,
        isLogLoading,
        logError,
        handleToggleLog,
        handleResetNumberDragHint,
        saveWorkspacePreferences,
        THEME_ACCENT_OPTIONS,
        THEME_MODE_OPTIONS,
    };
}

export type WorkspacePreferences = ReturnType<typeof useWorkspacePreferences>;
