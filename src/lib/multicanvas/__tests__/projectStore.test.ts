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
            left: 10,
        });

        const other = next.canvases[1].json!.objects![0];
        expect(other.opacity).toBe(0.5);
        expect(other.adjustmentSettings).toEqual({ brightness: 0.2 });
        expect(other.left).toBe(400); // geometry stays per-canvas
        // Source canvas untouched by the sync
        expect(next.canvases[0].json!.objects![0].opacity).toBe(1);
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
