import { type Dispatch, type RefObject, type SetStateAction, useEffect } from 'react';
import * as fabric from 'fabric';

import { loadUiPreferences, UI_PREFERENCES_CHANGED_EVENT } from '@/lib/ui-preferences';

type MediaPreview = { type: 'video' | 'audio'; url: string } | null;

type UseEditorShellEffectsArgs = {
    canvas: fabric.Canvas | null;
    activeTool: string;
    autoSelectEnabled: boolean;
    showTransformControls: boolean;
    selectAntiAlias: boolean;
    initialActiveTool?: string;
    setActiveTool: (tool: string) => void;
    exportRef: RefObject<HTMLDivElement | null>;
    setShowExportMenu: Dispatch<SetStateAction<boolean>>;
    setZoom: Dispatch<SetStateAction<number>>;
    handTopLockPan: boolean;
    mediaPreview: MediaPreview;
    setMediaPreview: Dispatch<SetStateAction<MediaPreview>>;
    settingsOpen: boolean;
    setExpandToolRailLabelsOnHover: Dispatch<SetStateAction<boolean>>;
};

const CREATION_TOOLS = [
    'marquee',
    'lasso',
    'wand',
    'quick-select',
    'selection-brush',
    'healing',
    'spot-healing',
    'remove',
    'clone-stamp',
    'history-brush',
    'blur',
    'sharpen',
    'dodge',
    'burn',
    'sponge',
    'pen',
    'paint',
    'text',
    'shapes',
    '3d-gen',
    'ai-zone',
    'crop',
    'eyedropper',
    'zoom',
    'hand',
];

export function useEditorShellEffects({
    canvas,
    activeTool,
    autoSelectEnabled,
    showTransformControls,
    selectAntiAlias,
    initialActiveTool,
    setActiveTool,
    exportRef,
    setShowExportMenu,
    setZoom,
    handTopLockPan,
    mediaPreview,
    setMediaPreview,
    settingsOpen,
    setExpandToolRailLabelsOnHover,
}: UseEditorShellEffectsArgs) {
    // Auto-switch to properties when clicking canvas objects.
    useEffect(() => {
        if (!canvas) return;

        const handleSelection = (event: { e?: Event }) => {
            if (autoSelectEnabled && event.e && !CREATION_TOOLS.includes(activeTool) && activeTool !== 'select') {
                setActiveTool('select');
            }
        };

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        return () => {
            canvas.off('selection:created', handleSelection);
            canvas.off('selection:updated', handleSelection);
        };
    }, [canvas, activeTool, autoSelectEnabled, setActiveTool]);

    useEffect(() => {
        if (!canvas) return;

        canvas.getObjects().forEach((object) => {
            object.set({
                hasControls: showTransformControls,
                hasBorders: showTransformControls,
            });
            object.setCoords();
        });
        canvas.requestRenderAll();
    }, [canvas, showTransformControls]);

    useEffect(() => {
        if (!canvas) return;

        const activeCanvas = canvas as fabric.Canvas & {
            contextContainer?: CanvasRenderingContext2D | null;
            contextTop?: CanvasRenderingContext2D | null;
        };
        const contextContainer = activeCanvas.contextContainer;
        const contextTop = activeCanvas.contextTop;
        if (contextContainer) {
            Reflect.set(contextContainer, 'imageSmoothingEnabled', selectAntiAlias);
        }
        if (contextTop) {
            Reflect.set(contextTop, 'imageSmoothingEnabled', selectAntiAlias);
        }
        canvas.requestRenderAll();
    }, [canvas, selectAntiAlias]);

    // Initial Tool Effect
    useEffect(() => {
        if (!initialActiveTool) return;

        const toolMap: Record<string, string> = {
            upload: 'assets',
            '3d': '3d-gen',
            ai: 'ai-zone',
            move: 'select',
            'path-select': 'select',
        };

        const timeoutId = window.setTimeout(() => {
            setActiveTool(toolMap[initialActiveTool] || initialActiveTool);
        }, 100);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [initialActiveTool, setActiveTool]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
                setShowExportMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [exportRef, setShowExportMenu]);

    // Sync UI zoom state with Canvas events (e.g. Mouse Wheel)
    useEffect(() => {
        if (!canvas) return;

        const updateZoomState = () => {
            setZoom(canvas.getZoom());
        };

        canvas.on('mouse:wheel', updateZoomState);
        return () => {
            canvas.off('mouse:wheel', updateZoomState);
        };
    }, [canvas, setZoom]);

    useEffect(() => {
        if (!canvas) return;

        (canvas as unknown as {
            fire: (eventName: string, payload?: unknown) => void;
        }).fire('hand:mode:set', {
            enabled: activeTool === 'hand' && handTopLockPan,
        });
    }, [canvas, activeTool, handTopLockPan]);

    useEffect(() => {
        if (!mediaPreview) return;

        const handleKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMediaPreview(null);
        };

        window.addEventListener('keydown', handleKeydown);
        return () => {
            window.removeEventListener('keydown', handleKeydown);
        };
    }, [mediaPreview, setMediaPreview]);

    useEffect(() => {
        const syncUiPreferences = () => {
            setExpandToolRailLabelsOnHover(loadUiPreferences().expandToolRailLabelsOnHover);
        };

        syncUiPreferences();
        window.addEventListener(UI_PREFERENCES_CHANGED_EVENT, syncUiPreferences);
        return () => {
            window.removeEventListener(UI_PREFERENCES_CHANGED_EVENT, syncUiPreferences);
        };
    }, [settingsOpen, setExpandToolRailLabelsOnHover]);
}
