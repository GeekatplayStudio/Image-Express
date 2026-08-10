import { idbDelete, idbGet, idbPut, isIndexedDbAvailable, PROJECTS_RECORD_KEY } from '@/lib/multicanvas/projectDb';

// Project store for the multi-canvas workflow.
// Hierarchy: a Bookshelf contains Projects (albums), a Project contains
// Canvases (pages), a Canvas contains Layers (fabric objects). Layers marked
// shared (sharedLayerId) are linked across canvases; identity and adjustment
// settings (SHARED_SYNC_PROPS) propagate through syncSharedLayerAcrossCanvases.
//
// A Bookshelf is a hard resource boundary: shared layers never link or sync
// across shelves. Two albums on different shelves that happen to carry the
// same sharedLayerId are unrelated documents.
//
// Not to be confused with the asset vault's Bookcase
// (features/asset-vault/contracts/bookcase.ts), which is a saved collection
// of vault ASSETS. A Bookshelf here is a collection of ALBUMS.
//
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
    /** Owning shelf. Workspaces saved before shelves existed adopt DEFAULT_BOOKSHELF_ID on load. */
    bookshelfId: string;
};

export const PROJECT_STORAGE_KEY = 'image-express-project';
export const PROJECT_CHANGED_EVENT = 'image-express:project-changed';

/** The shelf every pre-bookshelf workspace is migrated onto. */
export const DEFAULT_BOOKSHELF_ID = 'shf-default';

const newId = () => `cnv-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const newProjectId = () => `prj-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const newBookshelfId = () => `shf-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

export const createProject = (
    name: string,
    width: number,
    height: number,
    bookshelfId: string = DEFAULT_BOOKSHELF_ID,
): Project => {
    const canvas = createCanvasEntry('Canvas 1', width, height);
    return {
        id: newProjectId(),
        name,
        canvases: [canvas],
        activeCanvasId: canvas.id,
        bookshelfId,
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
// identity (name), adjustments and appearance are global, matching "linked
// layer adjustments are global through all layers".
const SHARED_SYNC_PROPS = [
    'name',
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

// --- Bookshelf level: a workspace holds many Bookshelves ---------------------
// Hierarchy: Bookshelf (box) → Project/album (box) → Canvases/pages (planes)
// → Layers. The first two levels render on the same 3D lattice (gridPose.ts).

/** A collection of albums. Resources are never shared across shelves. */
export type Bookshelf = {
    id: string;
    name: string;
};

export type ProjectsState = {
    projects: Project[];
    activeProjectId: string;
    bookshelves: Bookshelf[];
    activeBookshelfId: string;
};

export const PROJECTS_STORAGE_KEY = 'image-express-projects';

export const createBookshelf = (name: string, id: string = newBookshelfId()): Bookshelf => ({ id, name });

export const createProjectsState = (
    name: string,
    width: number,
    height: number,
    bookshelfName = 'Bookshelf 1',
): ProjectsState => {
    const bookshelf = createBookshelf(bookshelfName, DEFAULT_BOOKSHELF_ID);
    const project = createProject(name, width, height, bookshelf.id);
    return {
        projects: [project],
        activeProjectId: project.id,
        bookshelves: [bookshelf],
        activeBookshelfId: bookshelf.id,
    };
};

/**
 * Bring any persisted workspace up to the current shape.
 *
 * Workspaces written before shelves existed have no `bookshelves` array and
 * no `bookshelfId` on their projects; they all land on one default shelf, so
 * an upgrading user sees exactly the albums they had, on one shelf. Also
 * repairs dangling active ids and orphaned shelf references, which is cheap
 * here and saves every reader from defensive lookups.
 */
export const normalizeProjectsState = (state: ProjectsState): ProjectsState => {
    const shelves = Array.isArray(state.bookshelves) && state.bookshelves.length > 0
        ? state.bookshelves
        : [createBookshelf('Bookshelf 1', DEFAULT_BOOKSHELF_ID)];
    const shelfIds = new Set(shelves.map((shelf) => shelf.id));
    const fallbackShelfId = shelves[0].id;

    const projects = state.projects.map((project) => (
        project.bookshelfId && shelfIds.has(project.bookshelfId)
            ? project
            : { ...project, bookshelfId: fallbackShelfId }
    ));

    const activeProject = projects.find((project) => project.id === state.activeProjectId) ?? projects[0];
    const activeBookshelfId = shelfIds.has(state.activeBookshelfId)
        ? state.activeBookshelfId
        : (activeProject?.bookshelfId ?? fallbackShelfId);

    return {
        projects,
        activeProjectId: activeProject?.id ?? state.activeProjectId,
        bookshelves: shelves,
        activeBookshelfId,
    };
};

export const getActiveBookshelf = (state: ProjectsState): Bookshelf => (
    state.bookshelves.find((shelf) => shelf.id === state.activeBookshelfId) ?? state.bookshelves[0]
);

/** Albums that live on a given shelf, in workspace order. */
export const projectsInBookshelf = (state: ProjectsState, bookshelfId: string): Project[] => (
    state.projects.filter((project) => project.bookshelfId === bookshelfId)
);

/** The shelf a given album belongs to, or the active shelf if it is unknown. */
export const bookshelfIdOfProject = (state: ProjectsState, projectId: string): string => (
    state.projects.find((project) => project.id === projectId)?.bookshelfId ?? state.activeBookshelfId
);

/**
 * Add a shelf. A shelf is never empty — it opens with one album holding one
 * page, mirroring how a new album opens with one page — and becomes active
 * along with that album.
 */
export const addBookshelf = (
    state: ProjectsState,
    name: string,
    albumName: string,
    width: number,
    height: number,
): ProjectsState => {
    const bookshelf = createBookshelf(name);
    const project = createProject(albumName, width, height, bookshelf.id);
    return {
        projects: [...state.projects, project],
        activeProjectId: project.id,
        bookshelves: [...state.bookshelves, bookshelf],
        activeBookshelfId: bookshelf.id,
    };
};

export const renameBookshelf = (state: ProjectsState, bookshelfId: string, name: string): ProjectsState => ({
    ...state,
    bookshelves: state.bookshelves.map((shelf) => (shelf.id === bookshelfId ? { ...shelf, name } : shelf)),
});

/** Deleting a shelf deletes the albums on it. The last shelf cannot be deleted. */
export const deleteBookshelf = (state: ProjectsState, bookshelfId: string): ProjectsState => {
    if (state.bookshelves.length <= 1) return state;
    const bookshelves = state.bookshelves.filter((shelf) => shelf.id !== bookshelfId);
    const projects = state.projects.filter((project) => project.bookshelfId !== bookshelfId);
    if (projects.length === 0) return state;
    const activeBookshelfId = state.activeBookshelfId === bookshelfId
        ? bookshelves[0].id
        : state.activeBookshelfId;
    const activeProjectId = projects.some((project) => project.id === state.activeProjectId)
        ? state.activeProjectId
        : (projects.find((project) => project.bookshelfId === activeBookshelfId) ?? projects[0]).id;
    return { projects, activeProjectId, bookshelves, activeBookshelfId };
};

/**
 * Copy a shelf and every album on it. sharedLayerIds are copied verbatim: they
 * only ever link within a shelf, so the copy reproduces the original's
 * internal links without reaching back into the source shelf.
 */
export const duplicateBookshelf = (state: ProjectsState, bookshelfId: string): ProjectsState => {
    const source = state.bookshelves.find((shelf) => shelf.id === bookshelfId);
    if (!source) return state;
    const copy = createBookshelf(`${source.name} copy`);
    const copiedProjects = projectsInBookshelf(state, bookshelfId).map((project, offset) => {
        const clone = JSON.parse(JSON.stringify(project)) as Project;
        clone.id = `${newProjectId()}-${offset}`;
        clone.bookshelfId = copy.id;
        return clone;
    });
    if (copiedProjects.length === 0) return state;
    const index = state.bookshelves.findIndex((shelf) => shelf.id === bookshelfId);
    const bookshelves = [...state.bookshelves];
    bookshelves.splice(index + 1, 0, copy);
    return {
        projects: [...state.projects, ...copiedProjects],
        activeProjectId: copiedProjects[0].id,
        bookshelves,
        activeBookshelfId: copy.id,
    };
};

/** Select a shelf, moving the album selection onto it. */
export const setActiveBookshelf = (state: ProjectsState, bookshelfId: string): ProjectsState => {
    if (!state.bookshelves.some((shelf) => shelf.id === bookshelfId)) return state;
    const onShelf = projectsInBookshelf(state, bookshelfId);
    const activeProjectId = onShelf.some((project) => project.id === state.activeProjectId)
        ? state.activeProjectId
        : (onShelf[0]?.id ?? state.activeProjectId);
    return { ...state, activeBookshelfId: bookshelfId, activeProjectId };
};

export const getActiveProject = (state: ProjectsState): Project => (
    state.projects.find((p) => p.id === state.activeProjectId) ?? state.projects[0]
);

export const updateActiveProject = (state: ProjectsState, updater: (project: Project) => Project): ProjectsState => ({
    ...state,
    projects: state.projects.map((p) => (p.id === state.activeProjectId ? updater(p) : p)),
});

/** New albums land on the shelf currently in view. */
export const addProject = (state: ProjectsState, name: string, width: number, height: number): ProjectsState => {
    const project = createProject(name, width, height, state.activeBookshelfId);
    return { ...state, projects: [...state.projects, project], activeProjectId: project.id };
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

/**
 * Find an untouched project to reuse instead of spawning a new one.
 * Confined to the active shelf: reusing an empty album from another shelf
 * would silently move the user's work across a resource boundary.
 */
export const findEmptyProject = (state: ProjectsState): Project | null => (
    projectsInBookshelf(state, state.activeBookshelfId).find((p) => isProjectEmpty(p)) ?? null
);

/** A shelf always keeps at least one album, so its last album cannot be deleted. */
export const deleteProject = (state: ProjectsState, projectId: string): ProjectsState => {
    if (state.projects.length <= 1) return state;
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return state;
    if (projectsInBookshelf(state, target.bookshelfId).length <= 1) return state;
    const projects = state.projects.filter((p) => p.id !== projectId);
    const activeProjectId = state.activeProjectId === projectId
        ? (projects.find((p) => p.bookshelfId === target.bookshelfId) ?? projects[0]).id
        : state.activeProjectId;
    return { ...state, projects, activeProjectId };
};

export const duplicateProject = (state: ProjectsState, projectId: string): ProjectsState => {
    const source = state.projects.find((p) => p.id === projectId);
    if (!source) return state;
    const copy = JSON.parse(JSON.stringify(source)) as Project;
    copy.id = newProjectId();
    copy.name = `${source.name} copy`;
    const index = state.projects.findIndex((p) => p.id === projectId);
    const projects = [...state.projects];
    projects.splice(index + 1, 0, copy);
    return { ...state, projects, activeProjectId: copy.id };
};

/** Selecting an album also brings its shelf into view. */
export const setActiveProject = (state: ProjectsState, projectId: string): ProjectsState => {
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return state;
    return { ...state, activeProjectId: projectId, activeBookshelfId: target.bookshelfId };
};

/**
 * Album links: one entry per shared asset per album pair, carrying the
 * layer's identity so the view can say WHAT is shared, not just that
 * something is. Three shared assets between two albums are three links.
 *
 * Links never cross a shelf — see listProjectLinks.
 */
export type ProjectLink = {
    sharedLayerId: string;
    a: string;
    b: string;
    layerName?: string;
    layerType?: string;
    /** Preview source when the shared layer is an image (data:/path, never blob:). */
    layerSrc?: string;
};

/**
 * Links between albums on one shelf. Defaults to the active shelf: albums on
 * different shelves are unrelated documents even when they carry matching
 * sharedLayerIds (a duplicated shelf produces exactly that), so pairing across
 * shelves would draw connections the user never made.
 */
export const listProjectLinks = (
    state: ProjectsState,
    bookshelfId: string = state.activeBookshelfId,
): ProjectLink[] => {
    const byShared = new Map<string, { ids: Set<string>; layer: SerializedLayer }>();
    for (const project of projectsInBookshelf(state, bookshelfId)) {
        for (const canvas of project.canvases) {
            for (const layer of canvas.json?.objects ?? []) {
                if (!layer.sharedLayerId) continue;
                const entry = byShared.get(layer.sharedLayerId);
                if (entry) {
                    entry.ids.add(project.id);
                } else {
                    byShared.set(layer.sharedLayerId, { ids: new Set([project.id]), layer });
                }
            }
        }
    }
    const links: ProjectLink[] = [];
    for (const [sharedLayerId, { ids, layer }] of byShared) {
        const src = typeof layer.src === 'string' && !layer.src.startsWith('blob:') ? layer.src : undefined;
        const list = [...ids];
        for (let i = 0; i < list.length - 1; i += 1) {
            links.push({
                sharedLayerId,
                a: list[i],
                b: list[i + 1],
                layerName: typeof layer.name === 'string' ? layer.name : undefined,
                layerType: typeof layer.type === 'string' ? layer.type : undefined,
                layerSrc: src,
            });
        }
    }
    return links;
};

/**
 * Propagate a shared layer's linked settings across the source album's shelf.
 * Albums on other shelves are left untouched — the shelf is the boundary for
 * shared resources, so an edit here must not reach into a neighbouring shelf
 * that happens to hold a copy with the same sharedLayerId.
 */
export const syncSharedLayerAcrossProjects = (
    state: ProjectsState,
    sourceProjectId: string,
    sourceCanvasId: string,
    sourceLayer: SerializedLayer,
): ProjectsState => {
    const scope = bookshelfIdOfProject(state, sourceProjectId);
    return {
        ...state,
        projects: state.projects.map((project) => (
            project.bookshelfId !== scope
                ? project
                : syncSharedLayerAcrossCanvases(project, project.id === sourceProjectId ? sourceCanvasId : '', sourceLayer)
        )),
    };
};

/**
 * Session cache — the synchronous authority while the app is running.
 *
 * The backing store is IndexedDB, whose reads and writes are async, so a
 * caller that needs the latest state mid-tick (several canvas listeners can
 * read-compute-write within one event dispatch) cannot go to disk for it.
 * Every commit updates this cache synchronously before the write is queued,
 * so `getProjectsStateSync` is always at least as fresh as the store.
 */
let cachedState: ProjectsState | null = null;

/** Latest committed workspace, without touching the backing store. */
export const getProjectsStateSync = (): ProjectsState | null => cachedState;

/** Test seam: drop the session cache so a suite starts from a clean slate. */
export const resetProjectsStateCache = (): void => {
    cachedState = null;
};

const isUsableState = (value: unknown): value is ProjectsState => {
    const state = value as ProjectsState | null;
    return Boolean(state && Array.isArray(state.projects) && state.projects.length > 0);
};

/**
 * Read the pre-IndexedDB localStorage copies, newest format first.
 * Everything is normalized on the way out, so pre-bookshelf and
 * single-project workspaces both arrive on a default shelf.
 */
const readLegacyLocalStorage = (): ProjectsState | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as ProjectsState;
            if (isUsableState(parsed)) return normalizeProjectsState(parsed);
        }
        // Single-project era.
        const legacy = loadProject();
        if (legacy) {
            return normalizeProjectsState({
                projects: [legacy],
                activeProjectId: legacy.id,
                bookshelves: [],
                activeBookshelfId: '',
            });
        }
        return null;
    } catch {
        return null;
    }
};

const writeLocalStorageFallback = (state: ProjectsState): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch {
        // Thumbnails are pure previews, regenerable from the canvas, so they
        // are the only thing safe to drop to make room. Layer/canvas/album
        // data is never silently discarded.
        try {
            const withoutThumbnails: ProjectsState = {
                ...state,
                projects: state.projects.map((project) => ({
                    ...project,
                    canvases: project.canvases.map((c) => ({ ...c, thumbnail: null })),
                })),
            };
            window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(withoutThumbnails));
            return true;
        } catch {
            return false;
        }
    }
};

/**
 * Load the workspace: IndexedDB first, then a one-time migration of any
 * localStorage copy left by an older build. Populates the session cache.
 */
export const loadProjectsState = async (): Promise<ProjectsState | null> => {
    if (typeof window === 'undefined') return null;

    if (isIndexedDbAvailable()) {
        const stored = await idbGet<ProjectsState>(PROJECTS_RECORD_KEY);
        if (isUsableState(stored)) {
            // Workspaces written before shelves existed land on a default one.
            const migrated = normalizeProjectsState(stored);
            cachedState = migrated;
            return migrated;
        }
        // Nothing in IndexedDB yet — adopt whatever localStorage still holds
        // and move it across, so an existing workspace survives the upgrade.
        const legacy = readLegacyLocalStorage();
        if (legacy) {
            const moved = await idbPut(PROJECTS_RECORD_KEY, legacy);
            if (moved) {
                try {
                    window.localStorage.removeItem(PROJECTS_STORAGE_KEY);
                    window.localStorage.removeItem(PROJECT_STORAGE_KEY);
                } catch {
                    // Leaving the old copy behind is harmless; IndexedDB wins
                    // on the next load either way.
                }
            }
            cachedState = legacy;
            return legacy;
        }
        cachedState = null;
        return null;
    }

    const fallback = readLegacyLocalStorage();
    cachedState = fallback;
    return fallback;
};

/**
 * Commit the workspace. The session cache updates synchronously so later
 * readers in the same tick see it; the returned promise reports whether the
 * write actually landed. Resolving false means this session's changes exist
 * only in memory and the caller should tell the user.
 */
export const saveProjectsState = (state: ProjectsState): Promise<boolean> => {
    if (typeof window === 'undefined') return Promise.resolve(false);
    cachedState = state;
    window.dispatchEvent(new Event(PROJECT_CHANGED_EVENT));

    if (!isIndexedDbAvailable()) {
        return Promise.resolve(writeLocalStorageFallback(state));
    }
    return idbPut(PROJECTS_RECORD_KEY, state).then((ok) => (
        // IndexedDB can still refuse (quota, corrupt profile). localStorage
        // will usually refuse too at this size, but trying costs nothing and
        // covers the case where the album is small.
        ok ? true : writeLocalStorageFallback(state)
    ));
};

export const clearProjectsState = async (): Promise<void> => {
    cachedState = null;
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(PROJECTS_STORAGE_KEY);
    } catch {
        // Non-fatal.
    }
    if (isIndexedDbAvailable()) await idbDelete(PROJECTS_RECORD_KEY);
    window.dispatchEvent(new Event(PROJECT_CHANGED_EVENT));
};
