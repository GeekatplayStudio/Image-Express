/**
 * Storage behaviour of the album workspace once IndexedDB is available.
 *
 * The localStorage-only store capped out at ~5 MB, which a single inlined
 * photo could exceed — duplicating a layer failed to save, and the lost write
 * silently discarded newly created pages. These cover the IndexedDB path and
 * the one-time migration of an existing localStorage workspace.
 */
import type { ProjectsState } from '@/lib/multicanvas/projectStore';

const mockDb = {
    idbGet: jest.fn(),
    idbPut: jest.fn(),
    idbDelete: jest.fn(),
    isIndexedDbAvailable: jest.fn(),
    PROJECTS_RECORD_KEY: 'projects-state',
};

jest.mock('@/lib/multicanvas/projectDb', () => mockDb);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const store = require('@/lib/multicanvas/projectStore');
const {
    createProjectsState, createProject, saveProjectsState, loadProjectsState,
    getProjectsStateSync, resetProjectsStateCache,
    PROJECTS_STORAGE_KEY, PROJECT_STORAGE_KEY,
} = store;

describe('album workspace storage on IndexedDB', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetProjectsStateCache();
        jest.clearAllMocks();
        mockDb.isIndexedDbAvailable.mockReturnValue(true);
        mockDb.idbGet.mockResolvedValue(null);
        mockDb.idbPut.mockResolvedValue(true);
        mockDb.idbDelete.mockResolvedValue(undefined);
    });

    it('writes the workspace to IndexedDB rather than localStorage', async () => {
        const state: ProjectsState = createProjectsState('A1', 1080, 1080);
        expect(await saveProjectsState(state)).toBe(true);

        expect(mockDb.idbPut).toHaveBeenCalledWith('projects-state', state);
        // The big payload must not also be duplicated into the 5 MB bucket.
        expect(window.localStorage.getItem(PROJECTS_STORAGE_KEY)).toBeNull();
    });

    it('reads back what IndexedDB holds', async () => {
        const state: ProjectsState = createProjectsState('A1', 1080, 1080);
        mockDb.idbGet.mockResolvedValue(state);
        expect(await loadProjectsState()).toEqual(state);
    });

    it('migrates an existing localStorage workspace on first load', async () => {
        const legacy: ProjectsState = createProjectsState('Existing album', 800, 600);
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(legacy));

        const loaded = await loadProjectsState();

        expect(loaded.projects[0].name).toBe('Existing album');
        expect(mockDb.idbPut).toHaveBeenCalledWith('projects-state', expect.objectContaining({
            activeProjectId: legacy.activeProjectId,
        }));
        // Migrated across, so the old copy is cleared out.
        expect(window.localStorage.getItem(PROJECTS_STORAGE_KEY)).toBeNull();
    });

    it('migrates the single-project era record too', async () => {
        const legacy = createProject('Old Project', 50, 50);
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(legacy));

        const loaded = await loadProjectsState();

        expect(loaded.projects[0].name).toBe('Old Project');
        expect(window.localStorage.getItem(PROJECT_STORAGE_KEY)).toBeNull();
    });

    it('keeps the localStorage copy when the migration write fails', async () => {
        const legacy: ProjectsState = createProjectsState('Existing album', 800, 600);
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(legacy));
        mockDb.idbPut.mockResolvedValue(false);

        const loaded = await loadProjectsState();

        expect(loaded.projects[0].name).toBe('Existing album');
        // Nothing was moved, so dropping the source would lose the workspace.
        expect(window.localStorage.getItem(PROJECTS_STORAGE_KEY)).toBeTruthy();
    });

    it('falls back to localStorage when IndexedDB refuses the write', async () => {
        mockDb.idbPut.mockResolvedValue(false);
        const state: ProjectsState = createProjectsState('A1', 100, 100);

        expect(await saveProjectsState(state)).toBe(true);
        expect(window.localStorage.getItem(PROJECTS_STORAGE_KEY)).toBeTruthy();
    });

    it('reports failure only when both stores refuse', async () => {
        mockDb.idbPut.mockResolvedValue(false);
        jest.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new DOMException('exceeded', 'QuotaExceededError');
        });

        expect(await saveProjectsState(createProjectsState('A1', 100, 100))).toBe(false);

        (window.localStorage.setItem as jest.Mock).mockRestore();
    });

    it('caches the commit synchronously, before the write resolves', () => {
        const state: ProjectsState = createProjectsState('A1', 100, 100);
        void saveProjectsState(state);
        // Canvas listeners read this mid-event-dispatch; waiting for the
        // async write would let a later writer clobber an earlier one.
        expect(getProjectsStateSync()).toEqual(state);
    });
});
