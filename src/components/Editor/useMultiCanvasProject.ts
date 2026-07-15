import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';

import { serializeCanvas, ensureObjectId } from '@/lib/fabric-utils';
import { captureCanvasThumbnail } from '@/lib/multicanvas/canvasThumbnail';
import type { ExtendedFabricObject } from '@/types';
import type { Project, ProjectsState, SerializedCanvasJson, SerializedLayer } from '@/lib/multicanvas/projectStore';
import {
    addCanvas as addCanvasToProject,
    addProject as addProjectToState,
    createProjectsState,
    deleteCanvas as deleteCanvasFromProject,
    deleteProject as deleteProjectFromState,
    duplicateCanvas as duplicateCanvasInProject,
    duplicateProject as duplicateProjectInState,
    getActiveProject,
    loadProjectsState,
    renameCanvas as renameCanvasInProject,
    renameProject as renameProjectInState,
    saveProjectsState,
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
};

/**
 * Federation → Projects → Canvases → Layers.
 * The active project's active canvas lives in the fabric editor; everything
 * else is kept as serialized snapshots. Shared layers (sharedLayerId) stay
 * linked across canvases AND projects: modifying one propagates its
 * adjustment/appearance settings to every instance in the workspace.
 */
export function useMultiCanvasProject({
    canvas, designName, initialWidth, initialHeight, customHistoryProps,
}: UseMultiCanvasProjectArgs) {
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
        const existing = loadProjectsState();
        const initial = existing ?? createProjectsState(designName || 'Untitled Project', initialWidth, initialHeight);
        const active = getActiveProject(initial);
        loadedProjectIdRef.current = active.id;
        loadedCanvasIdRef.current = active.activeCanvasId;
        setProjectsState(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const commit = useCallback((next: ProjectsState) => {
        setProjectsState(next);
        saveProjectsState(next);
    }, []);

    const serializeEditorCanvas = useCallback((): SerializedCanvasJson | null => {
        if (!canvas) return null;
        return serializeCanvas<SerializedCanvasJson>(canvas, customHistoryProps);
    }, [canvas, customHistoryProps]);

    // Snapshot the canvas that is actually loaded in the editor, into the
    // project it belongs to (which may not be the selected project).
    const snapshotLoadedCanvas = useCallback((base?: ProjectsState): ProjectsState | null => {
        const current = base ?? stateRef.current;
        if (!current) return null;
        const json = serializeEditorCanvas();
        if (!json) return current;
        const thumbnail = canvas ? captureCanvasThumbnail(canvas) : undefined;
        const loadedProjectId = loadedProjectIdRef.current ?? current.activeProjectId;
        return {
            ...current,
            projects: current.projects.map((project) => {
                if (project.id !== loadedProjectId) return project;
                const loadedCanvasId = loadedCanvasIdRef.current ?? project.activeCanvasId;
                return updateCanvasSnapshot(project, loadedCanvasId, json, thumbnail);
            }),
        };
    }, [canvas, serializeEditorCanvas]);

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
        loadedProjectIdRef.current = project.id;
        loadedCanvasIdRef.current = canvasId;
    }, [canvas]);

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
        const name = `Canvas ${active.canvases.length + 1}`;
        const next = updateActiveProject(current, (p) => addCanvasToProject(p, name, initialWidth, initialHeight));
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, initialHeight, initialWidth, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleDuplicateCanvas = useCallback((canvasId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = updateActiveProject(current, (p) => duplicateCanvasInProject(p, canvasId));
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleDeleteCanvas = useCallback((canvasId: string) => {
        const current = stateRef.current;
        if (!current) return;
        const next = updateActiveProject(current, (p) => deleteCanvasFromProject(p, canvasId));
        commit(next);
        if (canvasId === loadedCanvasIdRef.current) {
            const project = getActiveProject(next);
            loadCanvasIntoEditor(project, project.activeCanvasId);
        }
    }, [commit, loadCanvasIntoEditor]);

    const handleRenameCanvas = useCallback((canvasId: string, name: string) => {
        const current = stateRef.current;
        if (!current) return;
        commit(updateActiveProject(current, (p) => renameCanvasInProject(p, canvasId, name)));
    }, [commit]);

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
        const name = `Project ${current.projects.length + 1}`;
        const next = addProjectToState(current, name, initialWidth, initialHeight);
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, initialHeight, initialWidth, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleDuplicateProject = useCallback((projectId: string) => {
        const current = snapshotLoadedCanvas();
        if (!current) return;
        const next = duplicateProjectInState(current, projectId);
        commit(next);
        const project = getActiveProject(next);
        loadCanvasIntoEditor(project, project.activeCanvasId);
    }, [commit, loadCanvasIntoEditor, snapshotLoadedCanvas]);

    const handleDeleteProject = useCallback((projectId: string) => {
        const current = stateRef.current;
        if (!current) return;
        const next = deleteProjectFromState(current, projectId);
        commit(next);
        if (projectId === loadedProjectIdRef.current) {
            const project = getActiveProject(next);
            loadCanvasIntoEditor(project, project.activeCanvasId);
        }
    }, [commit, loadCanvasIntoEditor]);

    const handleRenameProject = useCallback((projectId: string, name: string) => {
        const current = stateRef.current;
        if (!current) return;
        commit(renameProjectInState(current, projectId, name));
    }, [commit]);

    const openStackView = useCallback(() => {
        const current = snapshotLoadedCanvas();
        if (current) commit(current);
        setIsStackViewOpen(true);
    }, [commit, snapshotLoadedCanvas]);

    /**
     * Mark/unmark the active layer as shared. Sharing broadcasts a linked copy
     * into every other canvas of the active project (same sharedLayerId), so
     * the 3D stack immediately shows the connections and adjustments stay in
     * sync everywhere.
     */
    const toggleShareActiveLayer = useCallback((): boolean | null => {
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

        const current = snapshotLoadedCanvas();
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

    // Linked-layer adjustments are global: propagate shared-layer changes to
    // every canvas snapshot in every project of the workspace.
    useEffect(() => {
        if (!canvas) return undefined;
        const handleModified = (event: { target?: fabric.Object }) => {
            const target = event.target as ExtendedFabricObject | undefined;
            if (!target?.sharedLayerId) return;
            const current = stateRef.current;
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
    }, [canvas, commit, customHistoryProps]);

    const project = projectsState ? getActiveProject(projectsState) : null;

    return {
        projectsState,
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
        selectProject,
        openProject,
        handleAddProject,
        handleDuplicateProject,
        handleDeleteProject,
        handleRenameProject,
        toggleShareActiveLayer,
    };
}
