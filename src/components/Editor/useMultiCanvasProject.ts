import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';

import { serializeCanvas, ensureObjectId, applyArtboardSize } from '@/lib/fabric-utils';
import { captureCanvasThumbnail } from '@/lib/multicanvas/canvasThumbnail';
import { inlineVolatileImageSources } from '@/lib/multicanvas/inlineImageSources';
import type { ExtendedFabricObject } from '@/types';
import { useI18n } from '@/providers/I18nProvider';
import type { Project, ProjectsState, ReplacedAssetSource, SerializedCanvasJson, SerializedLayer } from '@/lib/multicanvas/projectStore';
import {
    FLUSH_PENDING_EDITS_EVENT,
    addBookshelf as addBookshelfToState,
    addCanvas as addCanvasToProject,
    addProject as addProjectToState,
    bookshelfIdOfProject,
    createProjectsState,
    deleteBookshelf as deleteBookshelfFromState,
    duplicateBookshelf as duplicateBookshelfInState,
    deleteCanvas as deleteCanvasFromProject,
    deleteProject as deleteProjectFromState,
    duplicateCanvas as duplicateCanvasInProject,
    duplicateProject as duplicateProjectInState,
    getActiveProject,
    getProjectsStateSync,
    loadProjectsState,
    renameBookshelf as renameBookshelfInState,
    renameCanvas as renameCanvasInProject,
    renameProject as renameProjectInState,
    replaceSharedLayerSourceAcrossProjects,
    saveProjectsState,
    setActiveBookshelf,
    setActiveCanvas,
    setActiveProject,
    syncSharedLayerAcrossProjects,
    updateActiveProject,
    updateCanvasSnapshot,
} from '@/lib/multicanvas/projectStore';

type CanvasWithArtboard = fabric.Canvas & { artboardRect?: fabric.Rect };

type UseMultiCanvasProjectArgs = {
    canvas: fabric.Canvas | null;
    designName: string;
    initialWidth: number;
    initialHeight: number;
    customHistoryProps: string[];
    /** Restore the persisted active canvas into the editor on mount (off when a design/template is being loaded instead). */
    restoreOnMount?: boolean;
    /** Called when a snapshot could not be persisted at all (storage full even without thumbnails). */
    onStorageFull?: () => void;
    /**
     * Called after a different page's content is swapped into the editor.
     * The undo stack belongs to the page that was open, so the editor rebases
     * history here — otherwise undo on a new page walks back into the
     * previous page's document.
     */
    onCanvasSwapped?: () => void;
};

/**
 * Federation → Projects → Canvases → Layers.
 * The active project's active canvas lives in the fabric editor; everything
 * else is kept as serialized snapshots. Shared layers (sharedLayerId) stay
 * linked across canvases AND projects: modifying one propagates its
 * adjustment/appearance settings to every instance in the workspace.
 */
export function useMultiCanvasProject({
    canvas, designName, initialWidth, initialHeight, customHistoryProps, restoreOnMount = false, onStorageFull,
    onCanvasSwapped,
}: UseMultiCanvasProjectArgs) {
    const { t } = useI18n();
    const [projectsState, setProjectsState] = useState<ProjectsState | null>(null);
    const [isStackViewOpen, setIsStackViewOpen] = useState(false);
    const stateRef = useRef<ProjectsState | null>(null);
    // The canvas whose content actually lives in the fabric editor right now.
    // activeCanvasId/activeProjectId are the *selection* (e.g. in the stack
    // view) and can differ until the user opens the selected canvas.
    const loadedCanvasIdRef = useRef<string | null>(null);
    const loadedProjectIdRef = useRef<string | null>(null);

    useEffect(() => {
        stateRef.current = projectsState;
    }, [projectsState]);

    // Bootstrap: restore the persisted workspace or start a fresh one.
    useEffect(() => {
        let cancelled = false;
        void loadProjectsState().then((existing) => {
            if (cancelled) return;
            const initial = existing ?? createProjectsState(designName || 'Untitled Album', initialWidth, initialHeight);
            const active = getActiveProject(initial);
            loadedProjectIdRef.current = active.id;
            loadedCanvasIdRef.current = active.activeCanvasId;
            stateRef.current = initial;
            setProjectsState(initial);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const commit = useCallback((next: ProjectsState) => {
        // Keep the ref in step immediately: several canvas listeners can
        // read-compute-write within one event dispatch, and React's state
        // update is not visible to them until the next render.
        stateRef.current = next;
        setProjectsState(next);
        void saveProjectsState(next).then((persisted) => {
            if (!persisted) onStorageFull?.();
        });
    }, [onStorageFull]);

    // Multiple listeners (this hook's own object:modified sync, plus other
    // canvas-level effects) can each read-compute-write project state within
    // the same synchronous event dispatch. React's state update from an
    // earlier writer isn't visible until the next render, so a later writer
    // in the same tick would otherwise silently clobber it. The store's
    // session cache is updated synchronously by every commit, so it is always
    // at least as fresh as our own ref — use it as the merge base.
    const getFreshState = useCallback((): ProjectsState | null => (
        getProjectsStateSync() ?? stateRef.current
    ), []);

    const serializeEditorCanvas = useCallback((): SerializedCanvasJson | null => {
        if (!canvas) return null;
        const json = serializeCanvas<SerializedCanvasJson>(canvas, customHistoryProps);
        // blob: URLs die with the session — inline them so snapshots reload.
        return inlineVolatileImageSources(canvas, json);
    }, [canvas, customHistoryProps]);

    // Snapshot the canvas that is actually loaded in the editor, into the
    // project it belongs to (which may not be the selected project).
    const snapshotLoadedCanvas = useCallback((base?: ProjectsState): ProjectsState | null => {
        // Panels may hold a debounced object:modified commit (adjustment
        // sliders). Flush it now, while the loaded-canvas refs still point at
        // the page being snapshotted — fired after the switch, the sync would
        // attribute the edit to the wrong page and the edit would be lost.
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(FLUSH_PENDING_EDITS_EVENT));
        }
        const current = base ?? getFreshState();
        if (!current) return null;
        const json = serializeEditorCanvas();
        if (!json) return current;
        const thumbnail = canvas ? captureCanvasThumbnail(canvas) : undefined;
        const loadedProjectId = loadedProjectIdRef.current ?? current.activeProjectId;
        // Keep the stored canvas size in sync with the artboard so the 3D
        // stack renders the correct aspect ratio after a resize.
        const artboard = (canvas as fabric.Canvas & { artboard?: { width: number; height: number } } | null)?.artboard;
        return {
            ...current,
            projects: current.projects.map((project) => {
                if (project.id !== loadedProjectId) return project;
                const loadedCanvasId = loadedCanvasIdRef.current ?? project.activeCanvasId;
                const updated = updateCanvasSnapshot(project, loadedCanvasId, json, thumbnail);
                if (!artboard?.width || !artboard?.height) return updated;
                return {
                    ...updated,
                    canvases: updated.canvases.map((entry) => (
                        entry.id === loadedCanvasId
                            ? { ...entry, width: artboard.width, height: artboard.height }
                            : entry
                    )),
                };
            }),
        };
    }, [canvas, getFreshState, serializeEditorCanvas]);

    const loadCanvasIntoEditor = useCallback((project: Project, canvasId: string) => {
        if (!canvas) return;
        const target = project.canvases.find((c) => c.id === canvasId);
        if (!target) return;
        const extended = canvas as CanvasWithArtboard;
        const restoreArtboard = () => {
            // loadFromJSON clears everything including the artboard page rect
            // (it is excluded from export); put it back so the page stays visible.
            if (extended.artboardRect && !canvas.getObjects().includes(extended.artboardRect)) {
                canvas.add(extended.artboardRect);
                canvas.sendObjectToBack(extended.artboardRect);
            }
            // Re-apply this canvas's own stored size — otherwise switching
            // canvases keeps whichever size the artboard rect last had.
            if (target.width && target.height) {
                applyArtboardSize(canvas, target.width, target.height);
            }
            canvas.requestRenderAll();
            // Rebase history only once the new content is actually on the
            // canvas — loadFromJSON is async, so firing this alongside the
            // call would snapshot the page we are leaving.
            onCanvasSwapped?.();
        };
        // Point the refs at the incoming page before the load resolves, so a
        // snapshot triggered in between is attributed to the right page.
        loadedProjectIdRef.current = project.id;
        loadedCanvasIdRef.current = canvasId;
        if (target.json) {
            // The second loadFromJSON argument is a per-object REVIVER in
            // fabric v7, invoked before the canvas is cleared and refilled —
            // post-load work passed there runs against the outgoing page.
            void canvas.loadFromJSON(target.json).then(restoreArtboard);
        } else {
            // A brand-new page: remove the previous page's objects AND its
            // canvas-level state. Background/overlay images live on the canvas
            // itself, not in the object list, so without this a freshly
            // created page still showed the old page's backdrop.
            canvas.getObjects()
                .filter((obj) => obj !== extended.artboardRect)
                .forEach((obj) => canvas.remove(obj));
            canvas.backgroundImage = undefined;
            canvas.overlayImage = undefined;
            canvas.discardActiveObject();
            restoreArtboard();
        }
    }, [canvas, onCanvasSwapped]);

    const loadCanvasIntoEditorRef = useRef(loadCanvasIntoEditor);
    useEffect(() => {
        loadCanvasIntoEditorRef.current = loadCanvasIntoEditor;
    }, [loadCanvasIntoEditor]);

    // Restore the persisted active canvas into a fresh editor (e.g. opening a
    // project from the dashboard). Skipped while a design/template loads.
    const restoredRef = useRef(false);
    useEffect(() => {
        if (!restoreOnMount || restoredRef.current || !canvas || !projectsState) return;
        restoredRef.current = true;
        const active = getActiveProject(projectsState);
        const target = active.canvases.find((c) => c.id === active.activeCanvasId);
        if (target?.json) {
            loadCanvasIntoEditor(active, active.activeCanvasId);
        }
    }, [canvas, loadCanvasIntoEditor, projectsState, restoreOnMount]);

    const openCanvas = useCallback((canvasId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = updateActiveProject(current, (p) => setActiveCanvas(p, canvasId));
        commit(next);
        const activeProject = getActiveProject(next);
        if (canvasId !== loadedCanvasIdRef.current || activeProject.id !== loadedProjectIdRef.current) {
            loadCanvasIntoEditor(activeProject, canvasId);
        }
        setIsStackViewOpen(false);
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const selectCanvas = useCallback((canvasId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        commit(updateActiveProject(current, (p) => setActiveCanvas(p, canvasId)));
    }, [commit, snapshotLoadedCanvas]);

    const handleAddCanvas = useCallback(() => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const active = getActiveProject(current);
        const name = t('stack.pageName', { n: active.canvases.length + 1 });
        const next = updateActiveProject(current, (p) => addCanvasToProject(p, name, initialWidth, initialHeight));
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, initialHeight, initialWidth, loadCanvasIntoEditor, snapshotLoadedCanvas, t]);

    const handleDuplicateCanvas = useCallback((canvasId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = updateActiveProject(current, (p) => duplicateCanvasInProject(p, canvasId));
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleDeleteCanvas = useCallback((canvasId: string) => {
        const current = getFreshState();
        if (!current) return;
        const next = updateActiveProject(current, (p) => deleteCanvasFromProject(p, canvasId));
        commit(next);
        if (canvasId === loadedCanvasIdRef.current) {
            const project = getActiveProject(next);
            loadCanvasIntoEditor(project, project.activeCanvasId);
        }
    }, [commit, getFreshState, loadCanvasIntoEditor]);

    const handleRenameCanvas = useCallback((canvasId: string, name: string) => {
        const current = getFreshState();
        if (!current) return;
        commit(updateActiveProject(current, (p) => renameCanvasInProject(p, canvasId, name)));
    }, [commit, getFreshState]);

    // --- Project (federation) level -----------------------------------------

    const selectProject = useCallback((projectId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        commit(setActiveProject(current, projectId));
    }, [commit, snapshotLoadedCanvas]);

    const openProject = useCallback((projectId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = setActiveProject(current, projectId);
        commit(next);
        const project = getActiveProject(next);
        if (project.id !== loadedProjectIdRef.current) {
            loadCanvasIntoEditor(project, project.activeCanvasId);
        }
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleAddProject = useCallback(() => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const name = t('stack.albumName', { n: current.projects.length + 1 });
        const next = addProjectToState(current, name, initialWidth, initialHeight);
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, initialHeight, initialWidth, loadCanvasIntoEditor, snapshotLoadedCanvas, t]);

    const handleDuplicateProject = useCallback((projectId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = duplicateProjectInState(current, projectId);
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleDeleteProject = useCallback((projectId: string) => {
        const current = getFreshState();
        if (!current) return;
        const next = deleteProjectFromState(current, projectId);
        commit(next);
        if (projectId === loadedProjectIdRef.current) {
            const project = getActiveProject(next);
            loadCanvasIntoEditor(project, project.activeCanvasId);
        }
    }, [commit, getFreshState, loadCanvasIntoEditor]);

    const handleRenameProject = useCallback((projectId: string, name: string) => {
        const current = getFreshState();
        if (!current) return;
        commit(renameProjectInState(current, projectId, name));
    }, [commit, getFreshState]);

    // --- Bookshelf level ------------------------------------------------------
    // Same shape as the album handlers: snapshot the loaded page first so
    // nothing in the editor is lost, commit, then pull whichever album the new
    // selection lands on into the editor.

    const selectBookshelf = useCallback((bookshelfId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        commit(setActiveBookshelf(current, bookshelfId));
    }, [commit, snapshotLoadedCanvas]);

    const openBookshelf = useCallback((bookshelfId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = setActiveBookshelf(current, bookshelfId);
        commit(next);
        const project = getActiveProject(next);
        if (project.id !== loadedProjectIdRef.current) {
            loadCanvasIntoEditor(project, project.activeCanvasId);
        }
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleAddBookshelf = useCallback(() => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = addBookshelfToState(
            current,
            t('stack.bookshelfName', { n: current.bookshelves.length + 1 }),
            t('stack.albumName', { n: 1 }),
            initialWidth,
            initialHeight,
        );
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, initialHeight, initialWidth, loadCanvasIntoEditor, snapshotLoadedCanvas, t]);

    const handleDuplicateBookshelf = useCallback((bookshelfId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = duplicateBookshelfInState(current, bookshelfId);
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleDeleteBookshelf = useCallback((bookshelfId: string) => {
        const current = getFreshState();
        if (!current) return;
        // Deleting a shelf takes its albums with it, so the editor may be
        // holding a page that no longer exists.
        const losingLoadedAlbum = current.projects.some((project) => (
            project.bookshelfId === bookshelfId && project.id === loadedProjectIdRef.current
        ));
        const next = deleteBookshelfFromState(current, bookshelfId);
        if (next === current) return;
        commit(next);
        if (losingLoadedAlbum) {
            const project = getActiveProject(next);
            loadCanvasIntoEditor(project, project.activeCanvasId);
        }
    }, [commit, getFreshState, loadCanvasIntoEditor]);

    const handleRenameBookshelf = useCallback((bookshelfId: string, name: string) => {
        const current = getFreshState();
        if (!current) return;
        commit(renameBookshelfInState(current, bookshelfId, name));
    }, [commit, getFreshState]);

    const openStackView = useCallback(() => {
        const current = snapshotLoadedCanvas();
        if (current) commit(current);
        setIsStackViewOpen(true);
    }, [commit, snapshotLoadedCanvas]);

    /** Explicitly persists the active canvas into its album now (used by the editor's "Save as Album" choice). */
    const saveActiveCanvasSnapshot = useCallback((): boolean => {
        const next = snapshotLoadedCanvas();
        if (!next) return false;
        commit(next);
        return true;
    }, [commit, snapshotLoadedCanvas]);

    /**
     * Mark/unmark the active layer as shared. Sharing broadcasts a linked copy
     * into every other canvas of the active project (same sharedLayerId), so
     * the 3D stack immediately shows the connections and adjustments stay in
     * sync everywhere.
     */
    const toggleShareActiveLayer = useCallback((broadcast: boolean = true): boolean | null => {
        if (!canvas) return null;
        const active = canvas.getActiveObject() as ExtendedFabricObject | null;
        if (!active) return null;
        if (active.sharedLayerId) {
            active.sharedLayerId = undefined;
            canvas.requestRenderAll();
            return false;
        }
        const sharedId = ensureObjectId(active);
        active.sharedLayerId = sharedId;
        canvas.requestRenderAll();

        const current = broadcast ? snapshotLoadedCanvas() : null;
        if (current) {
            const serialized = (active as unknown as { toObject: (props?: string[]) => SerializedLayer }).toObject(customHistoryProps);
            const loadedProjectId = loadedProjectIdRef.current ?? current.activeProjectId;
            const loadedCanvasId = loadedCanvasIdRef.current;
            const next: ProjectsState = {
                ...current,
                projects: current.projects.map((project) => {
                    if (project.id !== loadedProjectId) return project;
                    return {
                        ...project,
                        canvases: project.canvases.map((entry) => {
                            if (entry.id === loadedCanvasId) return entry;
                            const json = entry.json ?? { objects: [] };
                            const objects = json.objects ?? [];
                            if (objects.some((layer) => layer.sharedLayerId === sharedId)) return entry;
                            const copy = JSON.parse(JSON.stringify(serialized)) as SerializedLayer;
                            return { ...entry, json: { ...json, objects: [...objects, copy] } };
                        }),
                    };
                }),
            };
            commit(next);
        }
        return true;
    }, [canvas, commit, customHistoryProps, snapshotLoadedCanvas]);

    /**
     * Share the active layer with the active (default) canvas of each given
     * OTHER project — not just other canvases of the current project. Marks
     * the layer shared if it wasn't already, so it links into the same
     * cross-project sync as toggleShareActiveLayer.
     */
    const shareActiveLayerWithProjects = useCallback((targetProjectIds: string[]): boolean | null => {
        if (!canvas || targetProjectIds.length === 0) return null;
        const active = canvas.getActiveObject() as ExtendedFabricObject | null;
        if (!active) return null;

        const sharedId = active.sharedLayerId ?? ensureObjectId(active);
        if (!active.sharedLayerId) {
            active.sharedLayerId = sharedId;
            canvas.requestRenderAll();
        }

        const current = snapshotLoadedCanvas();
        if (!current) return null;
        const serialized = (active as unknown as { toObject: (props?: string[]) => SerializedLayer }).toObject(customHistoryProps);
        // Enforce the shelf boundary here too, not just in the picker: a link
        // across shelves would never sync and never render, so it must not be
        // possible to create one at all.
        const scope = bookshelfIdOfProject(current, loadedProjectIdRef.current ?? current.activeProjectId);
        const targets = new Set(
            targetProjectIds.filter((id) => (
                current.projects.find((project) => project.id === id)?.bookshelfId === scope
            )),
        );
        if (targets.size === 0) return null;

        const next: ProjectsState = {
            ...current,
            projects: current.projects.map((project) => {
                if (!targets.has(project.id)) return project;
                const targetCanvasId = project.activeCanvasId;
                return {
                    ...project,
                    canvases: project.canvases.map((entry) => {
                        if (entry.id !== targetCanvasId) return entry;
                        const json = entry.json ?? { objects: [] };
                        const objects = json.objects ?? [];
                        if (objects.some((layer) => layer.sharedLayerId === sharedId)) return entry;
                        const copy = JSON.parse(JSON.stringify(serialized)) as SerializedLayer;
                        return { ...entry, json: { ...json, objects: [...objects, copy] } };
                    }),
                };
            }),
        };
        commit(next);
        return true;
    }, [canvas, commit, customHistoryProps, snapshotLoadedCanvas]);

    // Linked-layer adjustments are global: propagate shared-layer changes to
    // every canvas snapshot in every project of the workspace.
    useEffect(() => {
        if (!canvas) return undefined;
        const handleModified = (event: { target?: fabric.Object }) => {
            const target = event.target as ExtendedFabricObject | undefined;
            if (!target?.sharedLayerId) return;
            const current = getFreshState();
            if (!current) return;
            const serialized = (target as unknown as { toObject: (props?: string[]) => SerializedLayer }).toObject(customHistoryProps);
            const next = syncSharedLayerAcrossProjects(
                current,
                loadedProjectIdRef.current ?? current.activeProjectId,
                loadedCanvasIdRef.current ?? '',
                serialized,
            );
            commit(next);
        };
        canvas.on('object:modified', handleModified);
        return () => {
            canvas.off('object:modified', handleModified);
        };
    }, [canvas, commit, customHistoryProps, getFreshState]);

    // Fan a replaced image source out to every linked copy on the shelf.
    // Updating the live fabric object is the caller's job; this rewrites the
    // stored page snapshots (footprint preserved per copy by the store).
    const replaceSharedLayerSource = useCallback((sharedLayerId: string, source: ReplacedAssetSource) => {
        const current = getFreshState();
        if (!current) return;
        commit(replaceSharedLayerSourceAcrossProjects(
            current,
            loadedProjectIdRef.current ?? current.activeProjectId,
            sharedLayerId,
            source,
        ));
    }, [commit, getFreshState]);

    const project = projectsState ? getActiveProject(projectsState) : null;

    return {
        projectsState,
        project,
        replaceSharedLayerSource,
        isStackViewOpen,
        openStackView,
        closeStackView: () => setIsStackViewOpen(false),
        openCanvas,
        selectCanvas,
        handleAddCanvas,
        handleDuplicateCanvas,
        handleDeleteCanvas,
        handleRenameCanvas,
        selectProject,
        openProject,
        handleAddProject,
        handleDuplicateProject,
        handleDeleteProject,
        handleRenameProject,
        selectBookshelf,
        openBookshelf,
        handleAddBookshelf,
        handleDuplicateBookshelf,
        handleDeleteBookshelf,
        handleRenameBookshelf,
        toggleShareActiveLayer,
        shareActiveLayerWithProjects,
        saveActiveCanvasSnapshot,
    };
}
