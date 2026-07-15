// Project store for the multi-canvas workflow.
// Hierarchy: a Project contains Canvases, a Canvas contains Layers (fabric
// objects). Layers marked shared (sharedLayerId) are linked across canvases;
// adjustment settings propagate globally through syncSharedLayerAcrossCanvases.
// Pure functions + a thin localStorage persistence layer for determinism.

export type SerializedLayer = Record<string, unknown> & {
    id?: string;
    name?: string;
    type?: string;
    sharedLayerId?: string;
    isAdjustmentLayer?: boolean;
    adjustmentSettings?: unknown;
};

export type SerializedCanvasJson = Record<string, unknown> & {
    objects?: SerializedLayer[];
};

export type ProjectCanvas = {
    id: string;
    name: string;
    width: number;
    height: number;
    json: SerializedCanvasJson | null;
    /** Small JPEG data URL of the artboard, rendered on the 3D stack plane. */
    thumbnail?: string | null;
};

export type Project = {
    id: string;
    name: string;
    canvases: ProjectCanvas[];
    activeCanvasId: string;
};

export const PROJECT_STORAGE_KEY = 'image-express-project';
export const PROJECT_CHANGED_EVENT = 'image-express:project-changed';

const newId = () => `cnv-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

export const createProject = (name: string, width: number, height: number): Project => {
    const canvas = createCanvasEntry('Canvas 1', width, height);
    return {
        id: `prj-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        name,
        canvases: [canvas],
        activeCanvasId: canvas.id,
    };
};

export const createCanvasEntry = (name: string, width: number, height: number): ProjectCanvas => ({
    id: newId(),
    name,
    width,
    height,
    json: null,
});

export const addCanvas = (project: Project, name: string, width: number, height: number): Project => {
    const canvas = createCanvasEntry(name, width, height);
    return { ...project, canvases: [...project.canvases, canvas], activeCanvasId: canvas.id };
};

export const renameCanvas = (project: Project, canvasId: string, name: string): Project => ({
    ...project,
    canvases: project.canvases.map((c) => (c.id === canvasId ? { ...c, name } : c)),
});

export const deleteCanvas = (project: Project, canvasId: string): Project => {
    if (project.canvases.length <= 1) return project;
    const canvases = project.canvases.filter((c) => c.id !== canvasId);
    const activeCanvasId = project.activeCanvasId === canvasId ? canvases[0].id : project.activeCanvasId;
    return { ...project, canvases, activeCanvasId };
};

export const duplicateCanvas = (project: Project, canvasId: string): Project => {
    const source = project.canvases.find((c) => c.id === canvasId);
    if (!source) return project;
    const copy: ProjectCanvas = {
        ...source,
        id: newId(),
        name: `${source.name} copy`,
        json: source.json ? (JSON.parse(JSON.stringify(source.json)) as SerializedCanvasJson) : null,
    };
    const index = project.canvases.findIndex((c) => c.id === canvasId);
    const canvases = [...project.canvases];
    canvases.splice(index + 1, 0, copy);
    return { ...project, canvases, activeCanvasId: copy.id };
};

export const setActiveCanvas = (project: Project, canvasId: string): Project => (
    project.canvases.some((c) => c.id === canvasId)
        ? { ...project, activeCanvasId: canvasId }
        : project
);

export const updateCanvasSnapshot = (
    project: Project,
    canvasId: string,
    json: SerializedCanvasJson,
    thumbnail?: string | null,
): Project => ({
    ...project,
    canvases: project.canvases.map((c) => (
        c.id === canvasId
            ? { ...c, json, ...(thumbnail !== undefined ? { thumbnail } : {}) }
            : c
    )),
});

/** Groups of linked (shared) layers across canvases: sharedLayerId -> members. */
export type SharedLayerBridge = {
    sharedLayerId: string;
    members: Array<{ canvasId: string; canvasIndex: number; layer: SerializedLayer }>;
};

export const listSharedLayerBridges = (project: Project): SharedLayerBridge[] => {
    const groups = new Map<string, SharedLayerBridge['members']>();
    project.canvases.forEach((canvas, canvasIndex) => {
        (canvas.json?.objects ?? []).forEach((layer) => {
            const sid = layer.sharedLayerId;
            if (!sid) return;
            if (!groups.has(sid)) groups.set(sid, []);
            groups.get(sid)!.push({ canvasId: canvas.id, canvasIndex, layer });
        });
    });
    return [...groups.entries()]
        .filter(([, members]) => members.length > 1)
        .map(([sharedLayerId, members]) => ({ sharedLayerId, members }));
};

// Properties that propagate between linked layers. Geometry stays per-canvas;
// adjustments and appearance are global, matching "linked layer adjustments
// are global through all layers".
const SHARED_SYNC_PROPS = [
    'adjustmentSettings',
    'adjustmentType',
    'isAdjustmentLayer',
    'filters',
    'opacity',
    'visible',
    'fill',
    'baseFilters',
] as const;

export const syncSharedLayerAcrossCanvases = (
    project: Project,
    sourceCanvasId: string,
    sourceLayer: SerializedLayer,
): Project => {
    const sid = sourceLayer.sharedLayerId;
    if (!sid) return project;
    return {
        ...project,
        canvases: project.canvases.map((canvas) => {
            if (canvas.id === sourceCanvasId || !canvas.json?.objects) return canvas;
            let touched = false;
            const objects = canvas.json.objects.map((layer) => {
                if (layer.sharedLayerId !== sid) return layer;
                touched = true;
                const next: SerializedLayer = { ...layer };
                for (const prop of SHARED_SYNC_PROPS) {
                    if (prop in sourceLayer) {
                        next[prop] = JSON.parse(JSON.stringify(sourceLayer[prop] ?? null)) ?? undefined;
                    }
                }
                return next;
            });
            return touched ? { ...canvas, json: { ...canvas.json, objects } } : canvas;
        }),
    };
};

// --- Persistence -----------------------------------------------------------

export const loadProject = (): Project | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Project;
        if (!parsed || !Array.isArray(parsed.canvases) || parsed.canvases.length === 0) return null;
        return parsed;
    } catch {
        return null;
    }
};

export const saveProject = (project: Project): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
        window.dispatchEvent(new Event(PROJECT_CHANGED_EVENT));
    } catch {
        // Quota errors are non-fatal: the in-memory project stays authoritative.
    }
};

export const clearProject = (): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(PROJECT_STORAGE_KEY);
    window.dispatchEvent(new Event(PROJECT_CHANGED_EVENT));
};

// --- Federation level: a workspace holds many Projects -----------------------
// Hierarchy (matches the LogiTensor reference): Federation (all projects) →
// Project (cube) → Canvases (planes) → Layers.

export type ProjectsState = {
    projects: Project[];
    activeProjectId: string;
};

export const PROJECTS_STORAGE_KEY = 'image-express-projects';

export const createProjectsState = (name: string, width: number, height: number): ProjectsState => {
    const project = createProject(name, width, height);
    return { projects: [project], activeProjectId: project.id };
};

export const getActiveProject = (state: ProjectsState): Project => (
    state.projects.find((p) => p.id === state.activeProjectId) ?? state.projects[0]
);

export const updateActiveProject = (state: ProjectsState, updater: (project: Project) => Project): ProjectsState => ({
    ...state,
    projects: state.projects.map((p) => (p.id === state.activeProjectId ? updater(p) : p)),
});

export const addProject = (state: ProjectsState, name: string, width: number, height: number): ProjectsState => {
    const project = createProject(name, width, height);
    return { projects: [...state.projects, project], activeProjectId: project.id };
};

export const renameProject = (state: ProjectsState, projectId: string, name: string): ProjectsState => ({
    ...state,
    projects: state.projects.map((p) => (p.id === projectId ? { ...p, name } : p)),
});

/** A project with no real content yet: one default canvas, never drawn on. */
export const isProjectEmpty = (project: Project): boolean => (
    project.canvases.length <= 1
    && project.canvases.every((c) => !c.json || !c.json.objects || c.json.objects.length === 0)
);

/** Find an untouched project to reuse instead of spawning a new one. */
export const findEmptyProject = (state: ProjectsState): Project | null => (
    state.projects.find((p) => isProjectEmpty(p)) ?? null
);

export const deleteProject = (state: ProjectsState, projectId: string): ProjectsState => {
    if (state.projects.length <= 1) return state;
    const projects = state.projects.filter((p) => p.id !== projectId);
    const activeProjectId = state.activeProjectId === projectId ? projects[0].id : state.activeProjectId;
    return { projects, activeProjectId };
};

export const duplicateProject = (state: ProjectsState, projectId: string): ProjectsState => {
    const source = state.projects.find((p) => p.id === projectId);
    if (!source) return state;
    const copy = JSON.parse(JSON.stringify(source)) as Project;
    copy.id = `prj-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    copy.name = `${source.name} copy`;
    const index = state.projects.findIndex((p) => p.id === projectId);
    const projects = [...state.projects];
    projects.splice(index + 1, 0, copy);
    return { projects, activeProjectId: copy.id };
};

export const setActiveProject = (state: ProjectsState, projectId: string): ProjectsState => (
    state.projects.some((p) => p.id === projectId)
        ? { ...state, activeProjectId: projectId }
        : state
);

/** Federation links: projects that share a linked layer (same sharedLayerId). */
export type ProjectLink = { sharedLayerId: string; a: string; b: string };

export const listProjectLinks = (state: ProjectsState): ProjectLink[] => {
    const byShared = new Map<string, Set<string>>();
    for (const project of state.projects) {
        for (const canvas of project.canvases) {
            for (const layer of canvas.json?.objects ?? []) {
                if (!layer.sharedLayerId) continue;
                if (!byShared.has(layer.sharedLayerId)) byShared.set(layer.sharedLayerId, new Set());
                byShared.get(layer.sharedLayerId)!.add(project.id);
            }
        }
    }
    const links: ProjectLink[] = [];
    for (const [sharedLayerId, ids] of byShared) {
        const list = [...ids];
        for (let i = 0; i < list.length - 1; i += 1) {
            links.push({ sharedLayerId, a: list[i], b: list[i + 1] });
        }
    }
    return links;
};

/** Propagate a shared layer's linked settings to every project in the workspace. */
export const syncSharedLayerAcrossProjects = (
    state: ProjectsState,
    sourceProjectId: string,
    sourceCanvasId: string,
    sourceLayer: SerializedLayer,
): ProjectsState => ({
    ...state,
    projects: state.projects.map((project) => (
        syncSharedLayerAcrossCanvases(project, project.id === sourceProjectId ? sourceCanvasId : '', sourceLayer)
    )),
});

export const loadProjectsState = (): ProjectsState | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as ProjectsState;
            if (parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0) return parsed;
        }
        // Migrate the single-project era storage.
        const legacy = loadProject();
        if (legacy) {
            const migrated: ProjectsState = { projects: [legacy], activeProjectId: legacy.id };
            window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(migrated));
            window.localStorage.removeItem(PROJECT_STORAGE_KEY);
            return migrated;
        }
        return null;
    } catch {
        return null;
    }
};

/**
 * Persist the workspace. Returns true on success. Thumbnails are pure
 * previews (regenerable from the canvas), so on quota-exceeded they are
 * stripped and the save is retried once before giving up — layer/canvas/
 * project data is never silently dropped to make room.
 */
export const saveProjectsState = (state: ProjectsState): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state));
        window.dispatchEvent(new Event(PROJECT_CHANGED_EVENT));
        return true;
    } catch {
        try {
            const withoutThumbnails: ProjectsState = {
                ...state,
                projects: state.projects.map((project) => ({
                    ...project,
                    canvases: project.canvases.map((c) => ({ ...c, thumbnail: null })),
                })),
            };
            window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(withoutThumbnails));
            window.dispatchEvent(new Event(PROJECT_CHANGED_EVENT));
            return true;
        } catch {
            // Storage is full even without thumbnails: the in-memory state
            // stays authoritative for this session; the caller should warn
            // the user that changes are not being saved to disk.
            return false;
        }
    }
};
