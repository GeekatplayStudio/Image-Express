/** @jest-environment node */

import path from 'node:path';
import {
    decideVaultPathAccess,
    fileUriToPath,
    getVaultFilesystemAccess,
    isPathInside,
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
