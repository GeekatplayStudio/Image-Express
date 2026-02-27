import { useCallback } from 'react';
import * as fabric from 'fabric';

import type { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';
import type { ExtendedFabricObject } from '@/types';
import type { CanvasWithArtboard, PanelDockMode } from '@/components/Editor/editorView.types';
import type { ToastOptions } from '@/providers/ToastProvider';

type PanelState = {
    mode: PanelDockMode;
    position: { x: number; y: number };
    width: number;
};

type Toast = (options: ToastOptions) => void;

type DialogApi = {
    alert: (message: string, options?: { title?: string }) => Promise<void>;
};

type UseEditorMenuActionsArgs = {
    canvas: fabric.Canvas | null;
    selectionMode: 'layer' | 'group';
    toast: Toast;
    dialog: DialogApi;
    setZoom: (value: number) => void;
    setIsDirty: (value: boolean) => void;
    pushHistory: () => void;
    setObjectLockedFromCanvasOverlay: (target: fabric.Object & ExtendedFabricObject, locked: boolean) => void;
    setPropertiesPanelMode: (mode: PanelRailMode) => void;
    setPanelState: React.Dispatch<React.SetStateAction<PanelState>>;
};

export function useEditorMenuActions({
    canvas,
    selectionMode,
    toast,
    dialog,
    setZoom,
    setIsDirty,
    pushHistory,
    setObjectLockedFromCanvasOverlay,
    setPropertiesPanelMode,
    setPanelState,
}: UseEditorMenuActionsArgs) {
    const openPanelModeFromMenu = useCallback((mode: PanelRailMode) => {
        setPropertiesPanelMode(mode);
        setPanelState((prev) => {
            if (prev.mode === 'collapsed-left') return { ...prev, mode: 'docked-left' };
            if (prev.mode === 'collapsed-right') return { ...prev, mode: 'docked-right' };
            return prev;
        });
    }, [setPanelState, setPropertiesPanelMode]);

    const getMenuLayerTarget = useCallback((): (fabric.Object & ExtendedFabricObject) | null => {
        if (!canvas) return null;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
        if (!active) return null;
        if (active.type === 'activeSelection' || active.type === 'selection') return null;
        const ext = active as ExtendedFabricObject;
        if (ext.name === 'Artboard') return null;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (canvasWithArtboard.artboardRect && active === canvasWithArtboard.artboardRect) return null;
        return active;
    }, [canvas]);

    const handleLayerDeleteFromMenu = useCallback(() => {
        if (!canvas) return;
        const activeObjects = canvas.getActiveObjects();
        const active = canvas.getActiveObject();
        const selected = activeObjects.length > 0
            ? activeObjects
            : active
                ? [active]
                : [];

        if (selected.length === 0) {
            toast({ title: 'Delete unavailable', description: 'Select a layer first.', variant: 'warning' });
            return;
        }

        const canvasWithArtboard = canvas as CanvasWithArtboard;
        const removable = selected.filter((obj) => {
            const ext = obj as ExtendedFabricObject;
            if (ext.name === 'Artboard') return false;
            if (canvasWithArtboard.artboardRect && obj === canvasWithArtboard.artboardRect) return false;
            return true;
        });

        if (removable.length === 0) {
            toast({ title: 'Delete unavailable', description: 'The selected layer cannot be deleted.', variant: 'warning' });
            return;
        }

        const runtimeCanvas = canvas as fabric.Canvas & {
            fire?: (eventName: string, payload?: Record<string, unknown>) => void;
        };

        canvas.discardActiveObject();
        removable.forEach((obj) => canvas.remove(obj));
        runtimeCanvas.fire?.('object:modified', { target: removable[0] });
        canvas.requestRenderAll();
        setIsDirty(true);
        pushHistory();
    }, [canvas, pushHistory, setIsDirty, toast]);

    const handleLayerToggleLockFromMenu = useCallback(() => {
        const target = getMenuLayerTarget();
        if (!target) {
            toast({ title: 'Lock unavailable', description: 'Select a single layer first.', variant: 'warning' });
            return;
        }
        setObjectLockedFromCanvasOverlay(target, !Boolean(target.locked));
        setIsDirty(true);
        pushHistory();
    }, [getMenuLayerTarget, pushHistory, setIsDirty, setObjectLockedFromCanvasOverlay, toast]);

    const handleSelectAllFromMenu = useCallback(() => {
        if (!canvas) return;
        const selectable = canvas.getObjects().filter((obj) => {
            const ext = obj as ExtendedFabricObject & {
                isSelectionOverlayHelper?: boolean;
                isPenDraftAnchor?: boolean;
            };
            if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
            if (ext.isSelectionOverlayHelper || ext.isPenDraftAnchor || ext.isRetouchLayer) return false;
            if (ext.name === 'Artboard') return false;
            if (obj.visible === false) return false;
            if (obj.selectable === false || obj.evented === false) return false;
            return true;
        });

        if (selectable.length === 0) {
            toast({ title: 'Select all unavailable', description: 'No selectable layers found.', variant: 'warning' });
            return;
        }

        if (selectionMode === 'layer' || selectable.length === 1) {
            canvas.setActiveObject(selectable[selectable.length - 1]);
        } else {
            canvas.setActiveObject(new fabric.ActiveSelection(selectable, { canvas }));
        }
        canvas.requestRenderAll();
    }, [canvas, selectionMode, toast]);

    const handleDeselectFromMenu = useCallback(() => {
        if (!canvas) return;
        canvas.discardActiveObject();
        canvas.requestRenderAll();
    }, [canvas]);

    const handleResetZoomFromMenu = useCallback(() => {
        if (!canvas) return;
        const centerPoint = new fabric.Point((canvas.width || canvas.getWidth()) / 2, (canvas.height || canvas.getHeight()) / 2);
        canvas.zoomToPoint(centerPoint, 1);
        canvas.requestRenderAll();
        setZoom(1);
    }, [canvas, setZoom]);

    const handleShowShortcutsFromMenu = useCallback(() => {
        toast({
            title: 'Keyboard shortcuts',
            description: 'V Move, M Marquee, L Lasso, W Wand, J Healing, Y History, B Blur, O Dodge, S Clone, A Path Select.',
            variant: 'success',
        });
    }, [toast]);

    const handleShowAboutFromMenu = useCallback(async () => {
        await dialog.alert('Image Express editor. Build and edit designs with layered tools, retouch workflows, and panel-based controls.', {
            title: 'About Image Express',
        });
    }, [dialog]);

    return {
        openPanelModeFromMenu,
        getMenuLayerTarget,
        handleLayerDeleteFromMenu,
        handleLayerToggleLockFromMenu,
        handleSelectAllFromMenu,
        handleDeselectFromMenu,
        handleResetZoomFromMenu,
        handleShowShortcutsFromMenu,
        handleShowAboutFromMenu,
    };
}
