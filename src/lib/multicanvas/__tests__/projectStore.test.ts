import {
    addCanvas,
    createProject,
    deleteCanvas,
    duplicateCanvas,
    listSharedLayerBridges,
    loadProject,
    renameCanvas,
    saveProject,
    setActiveCanvas,
    syncSharedLayerAcrossCanvases,
    updateCanvasSnapshot,
    PROJECT_STORAGE_KEY,
    type Project,
} from '@/lib/multicanvas/projectStore';

const makeProjectWithTwoCanvases = (): Project => {
    let project = createProject('Test Project', 1080, 1080);
    project = addCanvas(project, 'Canvas 2', 800, 600);
    return project;
};

describe('projectStore', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('creates a project with one canvas active', () => {
        const project = createProject('P', 1080, 720);
        expect(project.canvases).toHaveLength(1);
        expect(project.activeCanvasId).toBe(project.canvases[0].id);
        expect(project.canvases[0].width).toBe(1080);
    });

    it('adds a canvas and makes it active', () => {
        const project = makeProjectWithTwoCanvases();
        expect(project.canvases).toHaveLength(2);
        expect(project.activeCanvasId).toBe(project.canvases[1].id);
    });

    it('renames, duplicates and deletes canvases', () => {
        let project = makeProjectWithTwoCanvases();
        const secondId = project.canvases[1].id;

        project = renameCanvas(project, secondId, 'Hero Shot');
        expect(project.canvases[1].name).toBe('Hero Shot');

        project = duplicateCanvas(project, secondId);
        expect(project.canvases).toHaveLength(3);
        expect(project.canvases[2].name).toBe('Hero Shot copy');
        expect(project.activeCanvasId).toBe(project.canvases[2].id);

        project = deleteCanvas(project, project.canvases[2].id);
        expect(project.canvases).toHaveLength(2);
        expect(project.activeCanvasId).toBe(project.canvases[0].id);
    });

    it('never deletes the last canvas', () => {
        const project = createProject('P', 100, 100);
        expect(deleteCanvas(project, project.canvases[0].id)).toBe(project);
    });

    it('ignores setActiveCanvas for unknown ids', () => {
        const project = createProject('P', 100, 100);
        expect(setActiveCanvas(project, 'nope').activeCanvasId).toBe(project.activeCanvasId);
    });

    it('stores canvas snapshots', () => {
        let project = createProject('P', 100, 100);
        const json = { objects: [{ id: 'a', type: 'rect' }] };
        project = updateCanvasSnapshot(project, project.canvases[0].id, json);
        expect(project.canvases[0].json).toEqual(json);
    });

    it('stores and preserves thumbnails with snapshots', () => {
        let project = createProject('P', 100, 100);
        const id = project.canvases[0].id;
        project = updateCanvasSnapshot(project, id, { objects: [] }, 'data:image/jpeg;base64,abc');
        expect(project.canvases[0].thumbnail).toBe('data:image/jpeg;base64,abc');
        // Omitting the thumbnail argument keeps the previous one.
        project = updateCanvasSnapshot(project, id, { objects: [{ id: 'x' }] });
        expect(project.canvases[0].thumbnail).toBe('data:image/jpeg;base64,abc');
    });

    it('lists shared-layer bridges only for layers linked across more than one canvas', () => {
        let project = makeProjectWithTwoCanvases();
        project = updateCanvasSnapshot(project, project.canvases[0].id, {
            objects: [
                { id: 'a', sharedLayerId: 'shared-1' },
                { id: 'solo', sharedLayerId: 'only-here' },
            ],
        });
        project = updateCanvasSnapshot(project, project.canvases[1].id, {
            objects: [{ id: 'b', sharedLayerId: 'shared-1' }],
        });

        const bridges = listSharedLayerBridges(project);
        expect(bridges).toHaveLength(1);
        expect(bridges[0].sharedLayerId).toBe('shared-1');
        expect(bridges[0].members).toHaveLength(2);
    });

    it('propagates adjustment settings of shared layers to other canvases, leaving geometry alone', () => {
        let project = makeProjectWithTwoCanvases();
        project = updateCanvasSnapshot(project, project.canvases[0].id, {
            objects: [{ id: 'a', sharedLayerId: 's', left: 10, opacity: 1 }],
        });
        project = updateCanvasSnapshot(project, project.canvases[1].id, {
            objects: [{ id: 'b', sharedLayerId: 's', left: 400, opacity: 1 }],
        });

        const next = syncSharedLayerAcrossCanvases(project, project.canvases[0].id, {
            sharedLayerId: 's',
            opacity: 0.5,
            adjustmentSettings: { brightness: 0.2 },
            channelSettings: { r: 1.1 },
            left: 10,
        });

        const other = next.canvases[1].json!.objects![0];
        expect(other.opacity).toBe(0.5);
        expect(other.adjustmentSettings).toEqual({ brightness: 0.2 });
        expect(other.channelSettings).toEqual({ r: 1.1 });
        expect(other.left).toBe(400); // geometry stays per-canvas
        // Source canvas untouched by the sync
        expect(next.canvases[0].json!.objects![0].opacity).toBe(1);
    });

    it('propagates the layer name of shared layers to other canvases', () => {
        let project = makeProjectWithTwoCanvases();
        project = updateCanvasSnapshot(project, project.canvases[0].id, {
            objects: [{ id: 'a', sharedLayerId: 's', name: 'Hero shot', left: 10 }],
        });
        project = updateCanvasSnapshot(project, project.canvases[1].id, {
            objects: [{ id: 'b', sharedLayerId: 's', name: 'image', left: 400 }],
        });

        const next = syncSharedLayerAcrossCanvases(project, project.canvases[0].id, {
            sharedLayerId: 's',
            name: 'Hero shot',
            left: 10,
        });

        const other = next.canvases[1].json!.objects![0];
        expect(other.name).toBe('Hero shot');
        expect(other.left).toBe(400); // geometry stays per-canvas
    });

    it('round-trips through localStorage persistence', () => {
        const project = makeProjectWithTwoCanvases();
        saveProject(project);
        expect(window.localStorage.getItem(PROJECT_STORAGE_KEY)).toBeTruthy();
        expect(loadProject()).toEqual(project);
    });

    it('returns null for corrupt persisted data', () => {
        window.localStorage.setItem(PROJECT_STORAGE_KEY, '{not json');
        expect(loadProject()).toBeNull();
    });
});

describe('projectStore federation level', () => {
    const {
        createProjectsState, addProject, renameProject, deleteProject, duplicateProject,
        getActiveProject, updateActiveProject, listProjectLinks,
        syncSharedLayerAcrossProjects, replaceSharedLayerSourceAcrossProjects,
        loadProjectsState, saveProjectsState,
        resetProjectsStateCache,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('@/lib/multicanvas/projectStore');

    beforeEach(() => {
        window.localStorage.clear();
        resetProjectsStateCache();
    });

    it('creates a workspace with one active project', () => {
        const state = createProjectsState('P1', 1080, 1080);
        expect(state.projects).toHaveLength(1);
        expect(getActiveProject(state).name).toBe('P1');
    });

    it('adds, renames, duplicates and deletes projects', () => {
        let state = createProjectsState('P1', 100, 100);
        state = addProject(state, 'P2', 200, 200);
        expect(state.projects).toHaveLength(2);
        expect(getActiveProject(state).name).toBe('P2');

        state = renameProject(state, state.projects[1].id, 'Campaign');
        expect(state.projects[1].name).toBe('Campaign');

        state = duplicateProject(state, state.projects[1].id);
        expect(state.projects).toHaveLength(3);
        expect(state.projects[2].name).toBe('Campaign copy');

        state = deleteProject(state, state.projects[2].id);
        expect(state.projects).toHaveLength(2);
        // never deletes the last project
        state = deleteProject(state, state.projects[0].id);
        expect(deleteProject(state, state.projects[0].id).projects).toHaveLength(1);
    });

    it('updateActiveProject only touches the active project', () => {
        let state = createProjectsState('P1', 100, 100);
        state = addProject(state, 'P2', 100, 100);
        const renamed = updateActiveProject(state, (p: { name: string }) => ({ ...p, name: 'X' }));
        expect(renamed.projects[1].name).toBe('X');
        expect(renamed.projects[0].name).toBe('P1');
    });

    it('links projects that share a linked layer and syncs settings across them', () => {
        let state = createProjectsState('P1', 100, 100);
        state = addProject(state, 'P2', 100, 100);
        const [p1, p2] = state.projects;
        state = {
            ...state,
            projects: [
                { ...p1, canvases: [{ ...p1.canvases[0], json: { objects: [{ id: 'a', sharedLayerId: 's', opacity: 1 }] } }] },
                { ...p2, canvases: [{ ...p2.canvases[0], json: { objects: [{ id: 'b', sharedLayerId: 's', opacity: 1 }] } }] },
            ],
        };

        const links = listProjectLinks(state);
        expect(links).toHaveLength(1);
        expect(links[0].sharedLayerId).toBe('s');

        const synced = syncSharedLayerAcrossProjects(state, p1.id, p1.canvases[0].id, { sharedLayerId: 's', opacity: 0.4 });
        expect(synced.projects[1].canvases[0].json.objects[0].opacity).toBe(0.4);
        // source canvas untouched
        expect(synced.projects[0].canvases[0].json.objects[0].opacity).toBe(1);
    });

    it('syncs a shared layer rename across albums', () => {
        let state = createProjectsState('P1', 100, 100);
        state = addProject(state, 'P2', 100, 100);
        const [p1, p2] = state.projects;
        state = {
            ...state,
            projects: [
                { ...p1, canvases: [{ ...p1.canvases[0], json: { objects: [{ id: 'a', sharedLayerId: 's', name: 'old', left: 5 }] } }] },
                { ...p2, canvases: [{ ...p2.canvases[0], json: { objects: [{ id: 'b', sharedLayerId: 's', name: 'old', left: 90 }] } }] },
            ],
        };

        const synced = syncSharedLayerAcrossProjects(state, p1.id, p1.canvases[0].id, { sharedLayerId: 's', name: 'renamed', left: 5 });
        expect(synced.projects[1].canvases[0].json.objects[0].name).toBe('renamed');
        // geometry stays per-canvas
        expect(synced.projects[1].canvases[0].json.objects[0].left).toBe(90);
    });

    it('replaces a linked image source across albums, preserving each copy’s footprint', () => {
        let state = createProjectsState('P1', 100, 100);
        state = addProject(state, 'P2', 100, 100);
        const [p1, p2] = state.projects;
        state = {
            ...state,
            projects: [
                { ...p1, canvases: [{ ...p1.canvases[0], json: { objects: [
                    { id: 'a', type: 'Image', sharedLayerId: 's', src: 'old.png', width: 100, height: 50, scaleX: 2, scaleY: 2, cropX: 5, cropY: 5, left: 10 },
                ] } }] },
                { ...p2, canvases: [{ ...p2.canvases[0], json: { objects: [
                    { id: 'b', type: 'image', sharedLayerId: 's', src: 'old.png', width: 100, height: 50, scaleX: 1, scaleY: 4, left: 70 },
                    { id: 'c', type: 'image', sharedLayerId: 'other', src: 'old.png', width: 100, height: 50 },
                ] } }] },
            ],
        };

        const next = replaceSharedLayerSourceAcrossProjects(state, p1.id, 's', { src: 'new.png', width: 200, height: 100, name: 'New asset' });

        const a = next.projects[0].canvases[0].json.objects[0];
        expect(a.src).toBe('new.png');
        expect(a.width).toBe(200);
        expect(a.height).toBe(100);
        expect(a.scaleX).toBe(1); // 2 * (100/200): same rendered width
        expect(a.scaleY).toBe(1); // 2 * (50/100): same rendered height
        expect(a.cropX).toBe(0); // crop cleared, it belonged to the old pixels
        expect(a.left).toBe(10); // position untouched

        const b = next.projects[1].canvases[0].json.objects[0];
        expect(b.src).toBe('new.png');
        expect(b.scaleX).toBe(0.5); // 1 * (100/200)
        expect(b.scaleY).toBe(2); // 4 * (50/100)
        expect(b.left).toBe(70);
        expect(b.name).toBe('New asset');

        // A different linked group is untouched
        expect(next.projects[1].canvases[0].json.objects[1].src).toBe('old.png');
    });

    it('round-trips through storage and migrates the legacy single project', async () => {
        const state = createProjectsState('P1', 100, 100);
        await saveProjectsState(state);
        expect(await loadProjectsState()).toEqual(state);

        // legacy migration
        window.localStorage.clear();
        resetProjectsStateCache();
        const legacy = createProject('Old Project', 50, 50);
        saveProject(legacy);
        const migrated = await loadProjectsState();
        expect(migrated.projects[0].name).toBe('Old Project');
    });
});

describe('projectStore empty-project reuse and storage safety', () => {
    const {
        createProjectsState, addProject, isProjectEmpty, findEmptyProject,
        updateCanvasSnapshot: updateSnap, saveProjectsState, loadProjectsState,
        getProjectsStateSync, resetProjectsStateCache, PROJECTS_STORAGE_KEY,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('@/lib/multicanvas/projectStore');

    beforeEach(() => {
        window.localStorage.clear();
        resetProjectsStateCache();
    });

    it('treats a freshly created project as empty', () => {
        const state = createProjectsState('P1', 100, 100);
        expect(isProjectEmpty(state.projects[0])).toBe(true);
        expect(findEmptyProject(state)).toBe(state.projects[0]);
    });

    it('stops treating a project as empty once a canvas has real objects', () => {
        let state = createProjectsState('P1', 100, 100);
        const p = state.projects[0];
        const withObjects = updateSnap(p, p.activeCanvasId, { objects: [{ id: 'a', type: 'rect' }] });
        state = { ...state, projects: [withObjects] };
        expect(isProjectEmpty(state.projects[0])).toBe(false);
        expect(findEmptyProject(state)).toBeNull();
    });

    it('finds an empty project among several non-empty ones', () => {
        let state = createProjectsState('P1', 100, 100);
        const p1 = updateSnap(state.projects[0], state.projects[0].activeCanvasId, { objects: [{ id: 'x' }] });
        state = { ...state, projects: [p1] };
        state = addProject(state, 'P2', 100, 100); // empty
        const empty = findEmptyProject(state);
        expect(empty?.name).toBe('P2');
    });

    it('saves successfully under normal conditions', async () => {
        const state = createProjectsState('P1', 100, 100);
        expect(await saveProjectsState(state)).toBe(true);
        expect(await loadProjectsState()).toEqual(state);
    });

    it('exposes the committed state synchronously for same-tick readers', () => {
        const state = createProjectsState('P1', 100, 100);
        expect(getProjectsStateSync()).toBeNull();
        // Deliberately not awaited: the cache must be usable before the write
        // resolves, because canvas listeners read it mid-event-dispatch.
        void saveProjectsState(state);
        expect(getProjectsStateSync()).toEqual(state);
    });

    it('drops thumbnails and retries when the primary save exceeds quota', async () => {
        const state = createProjectsState('P1', 100, 100);
        const withThumbnail = {
            ...state,
            projects: [{ ...state.projects[0], canvases: [{ ...state.projects[0].canvases[0], thumbnail: 'data:image/jpeg;base64,abc' }] }],
        };

        const realSetItem = window.localStorage.setItem.bind(window.localStorage);
        let calls = 0;
        jest.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation((...args: unknown[]) => {
            calls += 1;
            if (calls === 1) {
                throw new DOMException('exceeded', 'QuotaExceededError');
            }
            realSetItem(args[0] as string, args[1] as string);
        });

        expect(await saveProjectsState(withThumbnail)).toBe(true);
        const saved = JSON.parse(window.localStorage.getItem(PROJECTS_STORAGE_KEY)!);
        expect(saved.projects[0].canvases[0].thumbnail).toBeNull();

        (window.localStorage.setItem as jest.Mock).mockRestore();
    });

    it('returns false when storage is full even without thumbnails', async () => {
        const state = createProjectsState('P1', 100, 100);
        jest.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new DOMException('exceeded', 'QuotaExceededError');
        });

        expect(await saveProjectsState(state)).toBe(false);

        (window.localStorage.setItem as jest.Mock).mockRestore();
    });
});
