/**
 * Bookshelf level of the project store.
 *
 * The load-bearing rule is that a bookshelf is a hard resource boundary:
 * shared layers must never link or sync across shelves. These assertions pin
 * that behaviour and the migration that puts pre-bookshelf workspaces onto a
 * default shelf.
 */

import {
    addBookshelf,
    addProject,
    bookshelfIdOfProject,
    createProjectsState,
    deleteBookshelf,
    deleteProject,
    duplicateBookshelf,
    DEFAULT_BOOKSHELF_ID,
    findEmptyProject,
    getActiveBookshelf,
    listProjectLinks,
    normalizeProjectsState,
    projectsInBookshelf,
    renameBookshelf,
    setActiveBookshelf,
    setActiveProject,
    syncSharedLayerAcrossProjects,
    type Project,
    type ProjectsState,
    type SerializedLayer,
} from '@/lib/multicanvas/projectStore';

const base = () => createProjectsState('Album 1', 800, 600);

/** Put a layer on the first page of the named album. */
const withLayer = (state: ProjectsState, projectId: string, layer: SerializedLayer): ProjectsState => ({
    ...state,
    projects: state.projects.map((project) => (
        project.id !== projectId ? project : {
            ...project,
            canvases: project.canvases.map((canvas, i) => (
                i === 0 ? { ...canvas, json: { objects: [layer] } } : canvas
            )),
        }
    )),
});

describe('bookshelf structure', () => {
    it('starts with one shelf holding one album', () => {
        const state = base();
        expect(state.bookshelves).toHaveLength(1);
        expect(state.activeBookshelfId).toBe(DEFAULT_BOOKSHELF_ID);
        expect(state.projects[0].bookshelfId).toBe(DEFAULT_BOOKSHELF_ID);
        expect(getActiveBookshelf(state).id).toBe(DEFAULT_BOOKSHELF_ID);
    });

    it('opens a new shelf with one album and makes both active', () => {
        const state = addBookshelf(base(), 'Client work', 'Album 1', 800, 600);
        expect(state.bookshelves).toHaveLength(2);
        const shelfId = state.activeBookshelfId;
        expect(shelfId).not.toBe(DEFAULT_BOOKSHELF_ID);
        expect(projectsInBookshelf(state, shelfId)).toHaveLength(1);
        expect(state.activeProjectId).toBe(projectsInBookshelf(state, shelfId)[0].id);
    });

    it('adds new albums to the shelf currently in view', () => {
        let state = addBookshelf(base(), 'Client work', 'Album 1', 800, 600);
        const shelfId = state.activeBookshelfId;
        state = addProject(state, 'Album 2', 800, 600);
        expect(projectsInBookshelf(state, shelfId)).toHaveLength(2);
        expect(projectsInBookshelf(state, DEFAULT_BOOKSHELF_ID)).toHaveLength(1);
    });

    it('renames a shelf without touching its albums', () => {
        const state = renameBookshelf(base(), DEFAULT_BOOKSHELF_ID, 'Archive');
        expect(getActiveBookshelf(state).name).toBe('Archive');
        expect(state.projects).toHaveLength(1);
    });

    it('selecting an album brings its shelf into view', () => {
        let state = addBookshelf(base(), 'Client work', 'Album 1', 800, 600);
        const firstShelfAlbum = projectsInBookshelf(state, DEFAULT_BOOKSHELF_ID)[0];
        state = setActiveProject(state, firstShelfAlbum.id);
        expect(state.activeBookshelfId).toBe(DEFAULT_BOOKSHELF_ID);
    });

    it('selecting a shelf moves the album selection onto it', () => {
        let state = addBookshelf(base(), 'Client work', 'Album 1', 800, 600);
        state = setActiveBookshelf(state, DEFAULT_BOOKSHELF_ID);
        expect(state.activeBookshelfId).toBe(DEFAULT_BOOKSHELF_ID);
        expect(bookshelfIdOfProject(state, state.activeProjectId)).toBe(DEFAULT_BOOKSHELF_ID);
    });
});

describe('bookshelf deletion', () => {
    it('refuses to delete the last shelf', () => {
        const state = base();
        expect(deleteBookshelf(state, DEFAULT_BOOKSHELF_ID)).toBe(state);
    });

    it('takes the shelf albums with it and reseats the selection', () => {
        let state = addBookshelf(base(), 'Client work', 'Album 1', 800, 600);
        const doomed = state.activeBookshelfId;
        state = addProject(state, 'Album 2', 800, 600);
        expect(state.projects).toHaveLength(3);

        state = deleteBookshelf(state, doomed);
        expect(state.bookshelves).toHaveLength(1);
        expect(state.projects).toHaveLength(1);
        expect(state.activeBookshelfId).toBe(DEFAULT_BOOKSHELF_ID);
        expect(state.projects.some((p) => p.id === state.activeProjectId)).toBe(true);
    });

    it('keeps a shelf from losing its last album', () => {
        const state = addBookshelf(base(), 'Client work', 'Album 1', 800, 600);
        const onlyAlbum = projectsInBookshelf(state, state.activeBookshelfId)[0];
        // Two albums exist workspace-wide, but only one on this shelf.
        expect(state.projects).toHaveLength(2);
        expect(deleteProject(state, onlyAlbum.id)).toBe(state);
    });

    it('deletes an album when its shelf has others', () => {
        let state = addProject(base(), 'Album 2', 800, 600);
        const victim = state.activeProjectId;
        state = deleteProject(state, victim);
        expect(state.projects).toHaveLength(1);
        expect(state.projects.some((p) => p.id === victim)).toBe(false);
    });
});

describe('bookshelf duplication', () => {
    it('copies the shelf and every album on it under fresh ids', () => {
        let state = addProject(base(), 'Album 2', 800, 600);
        state = duplicateBookshelf(state, DEFAULT_BOOKSHELF_ID);

        expect(state.bookshelves).toHaveLength(2);
        const copyId = state.activeBookshelfId;
        const copies = projectsInBookshelf(state, copyId);
        expect(copies).toHaveLength(2);

        const originalIds = new Set(projectsInBookshelf(state, DEFAULT_BOOKSHELF_ID).map((p) => p.id));
        for (const copy of copies) {
            expect(originalIds.has(copy.id)).toBe(false);
            expect(copy.bookshelfId).toBe(copyId);
        }
        // Every album id in the workspace stays unique.
        expect(new Set(state.projects.map((p) => p.id)).size).toBe(state.projects.length);
    });

    it('does not link the copy back to the shelf it came from', () => {
        // Both albums carry the same sharedLayerId, so the copy will too.
        let state = addProject(base(), 'Album 2', 800, 600);
        const [a, b] = state.projects;
        state = withLayer(state, a.id, { sharedLayerId: 'shared-1', name: 'Logo' });
        state = withLayer(state, b.id, { sharedLayerId: 'shared-1', name: 'Logo' });
        state = duplicateBookshelf(state, DEFAULT_BOOKSHELF_ID);

        const originalLinks = listProjectLinks(state, DEFAULT_BOOKSHELF_ID);
        const copyLinks = listProjectLinks(state, state.activeBookshelfId);
        // Each shelf links internally...
        expect(originalLinks).toHaveLength(1);
        expect(copyLinks).toHaveLength(1);
        // ...and never to an album on the other shelf.
        const originalIds = new Set(projectsInBookshelf(state, DEFAULT_BOOKSHELF_ID).map((p) => p.id));
        for (const link of copyLinks) {
            expect(originalIds.has(link.a)).toBe(false);
            expect(originalIds.has(link.b)).toBe(false);
        }
    });
});

describe('shelves are a resource boundary', () => {
    const makeTwoShelvesSharingAnId = (): ProjectsState => {
        let state = base();
        const first = state.projects[0].id;
        state = withLayer(state, first, { sharedLayerId: 'shared-1', name: 'Logo', opacity: 1 });
        state = addBookshelf(state, 'Other shelf', 'Album 1', 800, 600);
        const second = state.activeProjectId;
        return withLayer(state, second, { sharedLayerId: 'shared-1', name: 'Logo', opacity: 1 });
    };

    it('never pairs albums across shelves into a link', () => {
        const state = makeTwoShelvesSharingAnId();
        expect(listProjectLinks(state, DEFAULT_BOOKSHELF_ID)).toHaveLength(0);
        expect(listProjectLinks(state, state.activeBookshelfId)).toHaveLength(0);
    });

    it('links albums that share a layer on the same shelf', () => {
        let state = addProject(base(), 'Album 2', 800, 600);
        const [a, b] = state.projects;
        state = withLayer(state, a.id, { sharedLayerId: 'shared-1', name: 'Logo' });
        state = withLayer(state, b.id, { sharedLayerId: 'shared-1', name: 'Logo' });
        const links = listProjectLinks(state, DEFAULT_BOOKSHELF_ID);
        expect(links).toHaveLength(1);
        expect(new Set([links[0].a, links[0].b])).toEqual(new Set([a.id, b.id]));
    });

    it('defaults to the active shelf', () => {
        let state = addProject(base(), 'Album 2', 800, 600);
        const [a, b] = state.projects;
        state = withLayer(state, a.id, { sharedLayerId: 'shared-1', name: 'Logo' });
        state = withLayer(state, b.id, { sharedLayerId: 'shared-1', name: 'Logo' });
        expect(listProjectLinks(state)).toEqual(listProjectLinks(state, state.activeBookshelfId));
    });

    it('does not sync a shared-layer edit into another shelf', () => {
        const state = makeTwoShelvesSharingAnId();
        const sourceId = state.projects[0].id;
        const otherShelfId = state.activeBookshelfId;
        const otherAlbum = projectsInBookshelf(state, otherShelfId)[0];

        const next = syncSharedLayerAcrossProjects(state, sourceId, 'no-such-canvas', {
            sharedLayerId: 'shared-1',
            opacity: 0.25,
        });

        const untouched = next.projects.find((p) => p.id === otherAlbum.id) as Project;
        expect(untouched.canvases[0].json?.objects?.[0].opacity).toBe(1);
    });

    it('does sync within the source shelf', () => {
        let state = addProject(base(), 'Album 2', 800, 600);
        const [a, b] = state.projects;
        state = withLayer(state, a.id, { sharedLayerId: 'shared-1', opacity: 1 });
        state = withLayer(state, b.id, { sharedLayerId: 'shared-1', opacity: 1 });

        const next = syncSharedLayerAcrossProjects(state, a.id, a.canvases[0].id, {
            sharedLayerId: 'shared-1',
            opacity: 0.25,
        });

        const target = next.projects.find((p) => p.id === b.id) as Project;
        expect(target.canvases[0].json?.objects?.[0].opacity).toBe(0.25);
    });

    it('never reuses an empty album from another shelf', () => {
        // The default shelf's album is untouched, but the active shelf is elsewhere.
        const state = addBookshelf(base(), 'Client work', 'Album 1', 800, 600);
        const reused = findEmptyProject(state);
        expect(reused?.bookshelfId).toBe(state.activeBookshelfId);
    });
});

describe('migration of pre-bookshelf workspaces', () => {
    it('puts shelf-less albums on one default shelf', () => {
        const legacy = {
            projects: [
                { id: 'p1', name: 'A', canvases: [], activeCanvasId: 'c1' },
                { id: 'p2', name: 'B', canvases: [], activeCanvasId: 'c2' },
            ],
            activeProjectId: 'p2',
        } as unknown as ProjectsState;

        const migrated = normalizeProjectsState(legacy);
        expect(migrated.bookshelves).toHaveLength(1);
        expect(migrated.bookshelves[0].id).toBe(DEFAULT_BOOKSHELF_ID);
        expect(migrated.projects.every((p) => p.bookshelfId === DEFAULT_BOOKSHELF_ID)).toBe(true);
        // The user's selection survives the upgrade.
        expect(migrated.activeProjectId).toBe('p2');
        expect(migrated.activeBookshelfId).toBe(DEFAULT_BOOKSHELF_ID);
    });

    it('reseats an album whose shelf no longer exists', () => {
        const orphaned = {
            projects: [{ id: 'p1', name: 'A', canvases: [], activeCanvasId: 'c1', bookshelfId: 'gone' }],
            activeProjectId: 'p1',
            bookshelves: [{ id: 'shf-real', name: 'Real' }],
            activeBookshelfId: 'shf-real',
        } as unknown as ProjectsState;

        const migrated = normalizeProjectsState(orphaned);
        expect(migrated.projects[0].bookshelfId).toBe('shf-real');
    });

    it('repairs a dangling active album and shelf id', () => {
        const dangling = {
            projects: [{ id: 'p1', name: 'A', canvases: [], activeCanvasId: 'c1', bookshelfId: 'shf-real' }],
            activeProjectId: 'missing',
            bookshelves: [{ id: 'shf-real', name: 'Real' }],
            activeBookshelfId: 'missing',
        } as unknown as ProjectsState;

        const migrated = normalizeProjectsState(dangling);
        expect(migrated.activeProjectId).toBe('p1');
        expect(migrated.activeBookshelfId).toBe('shf-real');
    });

    it('leaves an already-migrated workspace alone', () => {
        const state = addBookshelf(base(), 'Client work', 'Album 1', 800, 600);
        expect(normalizeProjectsState(state)).toEqual(state);
    });
});
