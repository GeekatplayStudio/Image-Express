import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';

import { serializeCanvas, ensureObjectId } from '@/lib/fabric-utils';
import { captureCanvasThumbnail } from '@/lib/multicanvas/canvasThumbnail';
import type { ExtendedFabricObject } from '@/types';
import type { Project, SerializedCanvasJson, SerializedLayer } from '@/lib/multicanvas/projectStore';
import {
    addCanvas as addCanvasToProject,
    createProject,
    deleteCanvas as deleteCanvasFromProject,
    duplicateCanvas as duplicateCanvasInProject,
    loadProject,
    renameCanvas as renameCanvasInProject,
    saveProject,
    setActiveCanvas,
    syncSharedLayerAcrossCanvases,
    updateCanvasSnapshot,
} from '@/lib/multicanvas/projectStore';

type CanvasWithArtboard = fabric.Canvas & { artboardRect?: fabric.Rect };

type UseMultiCanvasProjectArgs = {
    canvas: fabric.Canvas | null;
    designName: string;
    initialWidth: number;
    initialHeight: number;
    customHistoryProps: string[];
};

/**
 * Multi-canvas project state: a Project contains Canvases, each Canvas holds
 * its own layer stack. The active canvas lives in the fabric editor; inactive
 * canvases are kept as serialized snapshots. Shared layers (sharedLayerId)
 * stay linked: modifying one propagates its adjustment/appearance settings to
 * every canvas in the project.
 */
export function useMultiCanvasProject({
    canvas, designName, initialWidth, initialHeight, customHistoryProps,
}: UseMultiCanvasProjectArgs) {
    const [project, setProject] = useState<Project | null>(null);
    const [isStackViewOpen, setIsStackViewOpen] = useState(false);
    const projectRef = useRef<Project | null>(null);
    // The canvas whose content actually lives in the fabric editor right now.
    // project.activeCanvasId is the *selection* (e.g. in the stack view) and
    // can differ until the user opens the selected canvas.
    const loadedCanvasIdRef = useRef<string | null>(null);

    useEffect(() => {
        projectRef.current = project;
    }, [project]);

    // Bootstrap: restore the persisted project or start a fresh one.
    useEffect(() => {
        const existing = loadProject();
        const initial = existing ?? createProject(designName || 'Untitled Project', initialWidth, initialHeight);
        loadedCanvasIdRef.current = initial.activeCanvasId;
        setProject(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const commit = useCallback((next: Project) => {
        setProject(next);
        saveProject(next);
    }, []);

    const serializeEditorCanvas = useCallback((): SerializedCanvasJson | null => {
        if (!canvas) return null;
        return serializeCanvas<SerializedCanvasJson>(canvas, customHistoryProps);
    }, [canvas, customHistoryProps]);

    // Snapshot the canvas that is actually loaded in the editor.
    const snapshotLoadedCanvas = useCallback((base?: Project): Project | null => {
        const current = base ?? projectRef.current;
        if (!current) return null;
        const loadedId = loadedCanvasIdRef.current ?? current.activeCanvasId;
        const json = serializeEditorCanvas();
        if (!json) return current;
        const thumbnail = canvas ? captureCanvasThumbnail(canvas) : undefined;
        return updateCanvasSnapshot(current, loadedId, json, thumbnail);
    }, [canvas, serializeEditorCanvas]);

    const loadCanvasIntoEditor = useCallback((next: Project, canvasId: string) => {
        if (!canvas) return;
        const target = next.canvases.find((c) => c.id === canvasId);
        if (!target) return;
        const extended = canvas as CanvasWithArtboard;
        const restoreArtboard = () => {
            // loadFromJSON clears everything including the artboard page rect
            // (it is excluded from export); put it back so the page stays visible.
            if (extended.artboardRect && !canvas.getObjects().includes(extended.artboardRect)) {
                canvas.add(extended.artboardRect);
                canvas.sendObjectToBack(extended.artboardRect);
            }
            canvas.requestRenderAll();
        };
        if (target.json) {
            void canvas.loadFromJSON(target.json, restoreArtboard);
        } else {
            canvas.getObjects()
                .filter((obj) => obj !== extended.artboardRect)
                .forEach((obj) => canvas.remove(obj));
            canvas.discardActiveObject();
            restoreArtboard();
        }
    }, [canvas]);

    const openCanvas = useCallback((canvasId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = setActiveCanvas(current, canvasId);
        commit(next);
        if (canvasId !== loadedCanvasIdRef.current) {
            loadCanvasIntoEditor(next, canvasId);
            loadedCanvasIdRef.current = canvasId;
        }
        setIsStackViewOpen(false);
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const selectCanvas = useCallback((canvasId: string) => {
        const current = projectRef.current;
        if (!current) return;
        commit(setActiveCanvas(snapshotLoadedCanvas(current) ?? current, canvasId));
    }, [commit, snapshotLoadedCanvas]);

    const handleAddCanvas = useCallback(() => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const name = `Canvas ${current.canvases.length + 1}`;
        const next = addCanvasToProject(current, name, initialWidth, initialHeight);
        commit(next);
        loadCanvasIntoEditor(next, next.activeCanvasId);
        loadedCanvasIdRef.current = next.activeCanvasId;
    }, [commit, initialHeight, initialWidth, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleDuplicateCanvas = useCallback((canvasId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = duplicateCanvasInProject(current, canvasId);
        commit(next);
        loadCanvasIntoEditor(next, next.activeCanvasId);
        loadedCanvasIdRef.current = next.activeCanvasId;
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleDeleteCanvas = useCallback((canvasId: string) => {
        const current = projectRef.current;
        if (!current || current.canvases.length <= 1) return;
        const next = deleteCanvasFromProject(current, canvasId);
        commit(next);
        if (canvasId === loadedCanvasIdRef.current) {
            loadCanvasIntoEditor(next, next.activeCanvasId);
            loadedCanvasIdRef.current = next.activeCanvasId;
        }
    }, [commit, loadCanvasIntoEditor]);

    const handleRenameCanvas = useCallback((canvasId: string, name: string) => {
        const current = projectRef.current;
        if (!current) return;
        commit(renameCanvasInProject(current, canvasId, name));
    }, [commit]);

    const openStackView = useCallback(() => {
        const current = snapshotLoadedCanvas();
        if (current) commit(current);
        setIsStackViewOpen(true);
    }, [commit, snapshotLoadedCanvas]);

    /** Mark/unmark the active layer as shared across the project. */
    const toggleShareActiveLayer = useCallback((): boolean | null => {
        if (!canvas) return null;
        const active = canvas.getActiveObject() as ExtendedFabricObject | null;
        if (!active) return null;
        if (active.sharedLayerId) {
            active.sharedLayerId = undefined;
            canvas.requestRenderAll();
            return false;
        }
        active.sharedLayerId = ensureObjectId(active);
        canvas.requestRenderAll();
        return true;
    }, [canvas]);

    // Linked-layer adjustments are global: propagate shared-layer changes to
    // every other canvas snapshot in the project.
    useEffect(() => {
        if (!canvas) return undefined;
        const handleModified = (event: { target?: fabric.Object }) => {
            const target = event.target as ExtendedFabricObject | undefined;
            if (!target?.sharedLayerId) return;
            const current = projectRef.current;
            if (!current) return;
            const serialized = (target as unknown as { toObject: (props?: string[]) => SerializedLayer }).toObject(customHistoryProps);
            const next = syncSharedLayerAcrossCanvases(current, loadedCanvasIdRef.current ?? current.activeCanvasId, serialized);
            commit(next);
        };
        canvas.on('object:modified', handleModified);
        return () => {
            canvas.off('object:modified', handleModified);
        };
    }, [canvas, commit, customHistoryProps]);

    return {
        project,
        isStackViewOpen,
        openStackView,
        closeStackView: () => setIsStackViewOpen(false),
        openCanvas,
        selectCanvas,
        handleAddCanvas,
        handleDuplicateCanvas,
        handleDeleteCanvas,
        handleRenameCanvas,
        toggleShareActiveLayer,
    };
}
