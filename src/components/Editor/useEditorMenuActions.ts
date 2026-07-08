import { useCallback } from 'react';
import * as fabric from 'fabric';
import type { LayerOrderAction, LayerOrderState } from '@/components/CircularContextMenu';

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

const DISABLED_LAYER_ORDER_STATE: LayerOrderState = {
    enabled: false,
    canMoveUp: false,
    canMoveDown: false,
    canBringToFront: false,
    canSendToBack: false,
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

    const getActiveLayerOrderState = useCallback((): LayerOrderState => {
        if (!canvas) return DISABLED_LAYER_ORDER_STATE;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
        if (!active) return DISABLED_LAYER_ORDER_STATE;
        if (active.type === 'activeSelection' || active.type === 'selection') return DISABLED_LAYER_ORDER_STATE;
        const ext = active as ExtendedFabricObject;
        if (ext.isRetouchLayer || ext.name === 'Artboard') return DISABLED_LAYER_ORDER_STATE;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (canvasWithArtboard.artboardRect && active === canvasWithArtboard.artboardRect) return DISABLED_LAYER_ORDER_STATE;

        if (active.group && typeof active.group.getObjects === 'function') {
            const siblings = active.group.getObjects();
            const currentIndex = siblings.indexOf(active);
            if (currentIndex < 0) return DISABLED_LAYER_ORDER_STATE;
            const maxIndex = siblings.length - 1;
            const canMoveUp = currentIndex < maxIndex;
            const canMoveDown = currentIndex > 0;
            return {
                enabled: siblings.length > 1,
                canMoveUp,
                canMoveDown,
                canBringToFront: canMoveUp,
                canSendToBack: canMoveDown,
            };
        }

        const objects = canvas.getObjects();
        const currentIndex = objects.indexOf(active);
        if (currentIndex < 0) return DISABLED_LAYER_ORDER_STATE;
        const artboardIndex = canvasWithArtboard.artboardRect ? objects.indexOf(canvasWithArtboard.artboardRect) : -1;
        const minIndex = artboardIndex >= 0 ? artboardIndex + 1 : 0;
        const maxIndex = objects.length - 1;
        if (currentIndex < minIndex || maxIndex < minIndex) return DISABLED_LAYER_ORDER_STATE;
        const canMoveUp = currentIndex < maxIndex;
        const canMoveDown = currentIndex > minIndex;
        return {
            enabled: true,
            canMoveUp,
            canMoveDown,
            canBringToFront: canMoveUp,
            canSendToBack: canMoveDown,
        };
    }, [canvas]);

    const handleLayerOrderAction = useCallback((action: LayerOrderAction) => {
        if (!canvas) return;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
        if (!active) {
            toast({ title: 'Layer reorder unavailable', description: 'Select a layer on canvas first.', variant: 'warning' });
            return;
        }
        if (active.type === 'activeSelection' || active.type === 'selection') {
            toast({ title: 'Layer reorder unavailable', description: 'Select a single layer to reorder.', variant: 'warning' });
            return;
        }
        const ext = active as ExtendedFabricObject;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (ext.isRetouchLayer || ext.name === 'Artboard' || (canvasWithArtboard.artboardRect && active === canvasWithArtboard.artboardRect)) {
            return;
        }

        const runtimeCanvas = canvas as fabric.Canvas & {
            moveObjectTo?: (object: fabric.Object, index: number) => void;
            fire?: (eventName: string, payload?: Record<string, unknown>) => void;
        };
        let moved = false;

        if (active.group && typeof active.group.getObjects === 'function') {
            const parent = active.group as fabric.Group;
            const siblings = parent.getObjects();
            const currentIndex = siblings.indexOf(active);
            if (currentIndex < 0) return;
            const maxIndex = siblings.length - 1;
            let nextIndex = currentIndex;
            if (action === 'move-up') nextIndex = Math.min(maxIndex, currentIndex + 1);
            if (action === 'move-down') nextIndex = Math.max(0, currentIndex - 1);
            if (action === 'to-front') nextIndex = maxIndex;
            if (action === 'to-back') nextIndex = 0;
            if (nextIndex !== currentIndex) {
                parent.remove(active);
                parent.insertAt(nextIndex, active);
                parent.set('dirty', true);
                parent.setCoords();
                moved = true;
            }
        } else {
            const objects = canvas.getObjects();
            const currentIndex = objects.indexOf(active);
            if (currentIndex < 0 || !runtimeCanvas.moveObjectTo) return;
            const artboardIndex = canvasWithArtboard.artboardRect ? objects.indexOf(canvasWithArtboard.artboardRect) : -1;
            const minIndex = artboardIndex >= 0 ? artboardIndex + 1 : 0;
            const maxIndex = objects.length - 1;
            let nextIndex = currentIndex;
            if (action === 'move-up') nextIndex = Math.min(maxIndex, currentIndex + 1);
            if (action === 'move-down') nextIndex = Math.max(minIndex, currentIndex - 1);
            if (action === 'to-front') nextIndex = maxIndex;
            if (action === 'to-back') nextIndex = minIndex;
            if (nextIndex !== currentIndex) {
                runtimeCanvas.moveObjectTo(active, nextIndex);
                moved = true;
            }
        }

        if (!moved) return;
        active.setCoords();
        if (active.group) active.group.set('dirty', true);
        canvas.setActiveObject(active);
        runtimeCanvas.fire?.('object:modified', { target: active });
        canvas.requestRenderAll();
    }, [canvas, toast]);

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
        void dialog.alert(
            [
                'Tools: V Move · M Marquee · L Lasso · W Quick Select · Shift+W Wand · A Path Select',
                'Create: T Text · U Shapes · P Pen · B Brush · G Gradient · I Eyedropper · C Crop · H Hand · Z Zoom',
                'Retouch: J Healing · S Clone Stamp · R Blur · O Dodge · Y History Brush',
                '',
                'History: Ctrl+Z Undo · Ctrl+Shift+Z / Ctrl+Y Redo',
                'Layers: Ctrl+C Copy · Ctrl+X Cut · Ctrl+V Paste · Ctrl+J Duplicate · Ctrl+A Select All · Ctrl+D Deselect · Del Delete',
                'Clipping: Ctrl+Alt+G Clip to layer below / release',
                '',
                'Canvas: Space+Drag Pan · Scroll Zoom · Double-click group to enter · Right-click layer row for layer actions',
            ].join('\n'),
            { title: 'Keyboard shortcuts' },
        );
    }, [dialog]);

    const handleShowAboutFromMenu = useCallback(async () => {
        await dialog.alert('Image Express editor. Build and edit designs with layered tools, retouch workflows, and panel-based controls.', {
            title: 'About Image Express',
        });
    }, [dialog]);

    return {
        openPanelModeFromMenu,
        getMenuLayerTarget,
        getActiveLayerOrderState,
        handleLayerOrderAction,
        handleLayerDeleteFromMenu,
        handleLayerToggleLockFromMenu,
        handleSelectAllFromMenu,
        handleDeselectFromMenu,
        handleResetZoomFromMenu,
        handleShowShortcutsFromMenu,
        handleShowAboutFromMenu,
    };
}
