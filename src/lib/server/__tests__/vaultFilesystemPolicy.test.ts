/** @jest-environment node */

import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
    decideVaultPathAccess,
    fileUriToPath,
    getVaultFilesystemAccess,
    isPathInside,
    listVaultDirectory,
    VAULT_ALLOWED_ROOTS_ENV,
} from '../vaultFilesystemPolicy';

const ORIGINAL_ENV = process.env;

/** Absolute path that is valid on the current platform. */
const abs = (...segments: string[]) => path.resolve(path.sep, ...segments);

beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.IMAGE_EXPRESS_RUNTIME;
    delete process.env.NEXT_DESKTOP;
    delete process.env[VAULT_ALLOWED_ROOTS_ENV];
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

describe('runtime-driven access mode', () => {
    it('allows every drive on a desktop install', () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'desktop-local';
        expect(getVaultFilesystemAccess().mode).toBe('all-drives');
        expect(decideVaultPathAccess(abs('any', 'folder')).allowed).toBe(true);
    });

    it('allows every drive in a local developer workspace', () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'developer-local';
        expect(getVaultFilesystemAccess().mode).toBe('all-drives');
        expect(decideVaultPathAccess(abs('any', 'folder')).allowed).toBe(true);
    });

    it('restricts a self-hosted server to an allowlist', () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'self-hosted';
        expect(getVaultFilesystemAccess().mode).toBe('allowlist');
    });
});

describe('self-hosted allowlist', () => {
    beforeEach(() => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'self-hosted';
    });

    it('fails closed when the operator authorised nothing', () => {
        // The dangerous default would be "unset means unrestricted".
        const decision = decideVaultPathAccess(abs('data', 'media'));
        expect(decision.allowed).toBe(false);
        expect(decision).toHaveProperty('reason', expect.stringContaining(VAULT_ALLOWED_ROOTS_ENV));
    });

    it('permits an authorised root and its descendants', () => {
        process.env[VAULT_ALLOWED_ROOTS_ENV] = abs('data', 'media');
        expect(decideVaultPathAccess(abs('data', 'media')).allowed).toBe(true);
        expect(decideVaultPathAccess(abs('data', 'media', 'photos', '2026')).allowed).toBe(true);
    });

    it('refuses a sibling whose name merely starts with an authorised root', () => {
        // A naive startsWith check would leak "/data/media-private".
        process.env[VAULT_ALLOWED_ROOTS_ENV] = abs('data', 'media');
        expect(decideVaultPathAccess(abs('data', 'media-private')).allowed).toBe(false);
    });

    it('refuses traversal that escapes an authorised root', () => {
        process.env[VAULT_ALLOWED_ROOTS_ENV] = abs('data', 'media');
        const escape = path.join(abs('data', 'media'), '..', '..', 'etc');
        expect(decideVaultPathAccess(escape).allowed).toBe(false);
    });

    it('accepts several roots separated by comma or semicolon', () => {
        process.env[VAULT_ALLOWED_ROOTS_ENV] = `${abs('data', 'a')},${abs('data', 'b')}`;
        expect(decideVaultPathAccess(abs('data', 'a', 'x')).allowed).toBe(true);
        expect(decideVaultPathAccess(abs('data', 'b')).allowed).toBe(true);
        expect(decideVaultPathAccess(abs('data', 'c')).allowed).toBe(false);
    });

    it('reports the resolved path so callers store a normalised root', () => {
        process.env[VAULT_ALLOWED_ROOTS_ENV] = abs('data', 'media');
        const messy = path.join(abs('data', 'media'), 'photos', '..', 'photos');
        const decision = decideVaultPathAccess(messy);
        expect(decision.allowed).toBe(true);
        expect(decision.resolvedPath).toBe(path.join(abs('data', 'media'), 'photos'));
    });

    it('rejects an empty path', () => {
        expect(decideVaultPathAccess('   ').allowed).toBe(false);
    });
});

describe('isPathInside', () => {
    it('treats a root as inside itself', () => {
        expect(isPathInside(abs('a'), abs('a'))).toBe(true);
    });

    it('rejects a parent of the root', () => {
        expect(isPathInside(abs('a'), abs('a', 'b'))).toBe(false);
    });
});

describe('fileUriToPath', () => {
    it('decodes percent-escaped characters', () => {
        expect(fileUriToPath('file:///tmp/my%20photos')).toContain('my photos');
    });

    it('strips the leading slash before a Windows drive letter', () => {
        expect(fileUriToPath('file:///D:/Photos')).toMatch(/^D:/);
    });
});

/**
 * The in-app folder browser exists so the browser build can pick a real path
 * (the File System Access API only ever yields an opaque handle). It reads the
 * filesystem on the user's behalf, so containment matters more here than
 * anywhere else in the vault.
 */
describe('listVaultDirectory', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'vault-browse-'));
        await mkdir(path.join(root, 'photos'));
        await mkdir(path.join(root, 'Archive'));
        await mkdir(path.join(root, '.hidden'));
        await writeFile(path.join(root, 'notes.txt'), 'x');
    });

    it('lists only folders, alphabetically, ignoring files and dotfolders', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'developer-local';
        const listing = await listVaultDirectory(root);
        expect(listing.entries.map((e) => e.name)).toEqual(['Archive', 'photos']);
    });

    it('returns absolute paths the indexer can use directly', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'developer-local';
        const listing = await listVaultDirectory(root);
        for (const entry of listing.entries) {
            expect(path.isAbsolute(entry.path)).toBe(true);
            expect(isPathInside(entry.path, root)).toBe(true);
        }
    });

    it('offers a parent to climb to when one is reachable', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'developer-local';
        const listing = await listVaultDirectory(path.join(root, 'photos'));
        expect(listing.parent).toBe(path.resolve(root));
    });

    it('reports no parent at the top of the filesystem', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'developer-local';
        const top = path.parse(root).root;
        expect((await listVaultDirectory(top)).parent).toBeNull();
    });

    it('refuses a folder outside the allowlist when self-hosted', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'self-hosted';
        process.env[VAULT_ALLOWED_ROOTS_ENV] = path.join(root, 'photos');
        await expect(listVaultDirectory(root)).rejects.toThrow(/authorise/i);
    });

    it('refuses everything when a self-hosted server allowlists nothing', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'self-hosted';
        await expect(listVaultDirectory(root)).rejects.toThrow(/does not authorise/i);
    });

    it('will not climb out of the allowlist via the parent link', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'self-hosted';
        process.env[VAULT_ALLOWED_ROOTS_ENV] = root;
        // Inside the root, the parent is offered...
        const inside = await listVaultDirectory(path.join(root, 'photos'));
        expect(inside.parent).toBe(path.resolve(root));
        // ...but at the root itself there is nowhere up to go, so the UI never
        // presents a path that would then be refused.
        expect((await listVaultDirectory(root)).parent).toBeNull();
    });

    it('rejects traversal that lands outside the allowlist', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'self-hosted';
        process.env[VAULT_ALLOWED_ROOTS_ENV] = path.join(root, 'photos');
        await expect(
            listVaultDirectory(path.join(root, 'photos', '..', 'Archive')),
        ).rejects.toThrow(/outside/i);
    });
});
