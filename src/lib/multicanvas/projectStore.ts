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
    return { id: `prj-${Date.now()}`, name, canvases: [canvas], activeCanvasId: canvas.id };
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
): Project => ({
    ...project,
    canvases: project.canvases.map((c) => (c.id === canvasId ? { ...c, json } : c)),
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
