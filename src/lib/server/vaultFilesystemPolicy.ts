import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { getRuntimeProfile } from '@/lib/server/runtimeProfile';

/**
 * Who may point the Asset Vault at which parts of the filesystem.
 *
 * The rule follows where the app is running, because "the server" and "the
 * user's own computer" are the same machine in one case and not in the other:
 *
 * - `desktop-local` / `developer-local` — the app runs on the user's own
 *   computer, so indexing their drives exposes nothing they cannot already
 *   open in Explorer/Finder. Every drive is allowed, and they can be listed.
 * - `self-hosted` — the app serves other people. The filesystem belongs to the
 *   operator, not the visitor, so nothing is readable unless the operator has
 *   explicitly authorised it via IMAGE_EXPRESS_VAULT_ALLOWED_ROOTS. Unset
 *   means "authorise nothing", never "allow everything" — a misconfigured
 *   server must fail closed.
 */
export type VaultFilesystemAccess =
    | { mode: 'all-drives'; allowedRoots: null }
    | { mode: 'allowlist'; allowedRoots: string[] };

export const VAULT_ALLOWED_ROOTS_ENV = 'IMAGE_EXPRESS_VAULT_ALLOWED_ROOTS';

function parseAllowedRoots(): string[] {
    const raw = process.env[VAULT_ALLOWED_ROOTS_ENV]?.trim();
    if (!raw) return [];
    // Accept the platform delimiter (":" POSIX, ";" Windows) and also "," so a
    // Docker -e flag or a .env line is hard to get subtly wrong.
    return raw
        .split(/[;,]|(?<![A-Za-z]):/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => path.resolve(entry));
}

export function getVaultFilesystemAccess(): VaultFilesystemAccess {
    if (getRuntimeProfile() === 'self-hosted') {
        return { mode: 'allowlist', allowedRoots: parseAllowedRoots() };
    }
    return { mode: 'all-drives', allowedRoots: null };
}

/** Case-insensitive path comparison on Windows, exact elsewhere. */
function normalizeForCompare(target: string) {
    const resolved = path.resolve(target);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * True when `candidate` is `root` or lives inside it.
 *
 * Compares path segments rather than string prefixes: a raw `startsWith` would
 * treat `/data/media-private` as inside `/data/media`, which is exactly the
 * kind of near-miss that turns an allowlist into a hole.
 */
export function isPathInside(candidate: string, root: string) {
    const normalizedCandidate = normalizeForCompare(candidate);
    const normalizedRoot = normalizeForCompare(root);
    if (normalizedCandidate === normalizedRoot) return true;
    const relative = path.relative(normalizedRoot, normalizedCandidate);
    return Boolean(relative)
        && !relative.startsWith('..')
        && !path.isAbsolute(relative);
}

export type VaultPathDecision =
    | { allowed: true; resolvedPath: string }
    | { allowed: false; resolvedPath: string; reason: string };

/**
 * Decide whether the vault may read `requestedPath`.
 *
 * Always resolves the path first, so `..` traversal and relative input are
 * judged on where they actually land, not on how they were spelled.
 */
export function decideVaultPathAccess(requestedPath: string): VaultPathDecision {
    const trimmed = requestedPath?.trim();
    if (!trimmed) {
        return { allowed: false, resolvedPath: '', reason: 'A folder path is required.' };
    }

    const resolvedPath = path.resolve(trimmed);
    const access = getVaultFilesystemAccess();

    if (access.mode === 'all-drives') {
        return { allowed: true, resolvedPath };
    }

    if (access.allowedRoots.length === 0) {
        return {
            allowed: false,
            resolvedPath,
            reason: 'This server does not authorise any folders for indexing. '
                + `Set ${VAULT_ALLOWED_ROOTS_ENV} to the folders you want to expose.`,
        };
    }

    const permitted = access.allowedRoots.some((root) => isPathInside(resolvedPath, root));
    if (!permitted) {
        return {
            allowed: false,
            resolvedPath,
            reason: `"${resolvedPath}" is outside the folders this server authorises for indexing.`,
        };
    }

    return { allowed: true, resolvedPath };
}

/** Convert a `file://` URI (as stored on vault assets) back to an OS path. */
export function fileUriToPath(fileUri: string) {
    let pathPart = fileUri.replace(/^file:\/\//i, '');
    // "file:///D:/x" decodes to "/D:/x" on Windows — drop the leading slash.
    if (/^\/[A-Za-z]:/.test(pathPart)) {
        pathPart = pathPart.slice(1);
    }
    return path.normalize(decodeURIComponent(pathPart));
}

export type VaultDrive = {
    /** Path to hand back to the indexer, e.g. "D:\\" or "/Volumes/Media". */
    path: string;
    /** Human label for the picker. */
    label: string;
};

async function isReadableDirectory(target: string) {
    try {
        const info = await stat(target);
        return info.isDirectory();
    } catch {
        return false;
    }
}

/**
 * Drives/volumes the user could index, for a picker in the browser (where the
 * native folder dialog is unavailable).
 *
 * Returns [] under `self-hosted` — enumerating the operator's volumes to a
 * visitor is itself an information leak, regardless of what they can read.
 */
export async function listIndexableDrives(): Promise<VaultDrive[]> {
    const access = getVaultFilesystemAccess();

    if (access.mode === 'allowlist') {
        const drives = await Promise.all(access.allowedRoots.map(async (root) => (
            await isReadableDirectory(root) ? { path: root, label: root } : null
        )));
        return drives.filter((drive): drive is VaultDrive => drive !== null);
    }

    if (process.platform === 'win32') {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        const found = await Promise.all(letters.map(async (letter) => {
            const root = `${letter}:\\`;
            return await isReadableDirectory(root) ? { path: root, label: `${letter}:` } : null;
        }));
        return found.filter((drive): drive is VaultDrive => drive !== null);
    }

    // POSIX: the root plus the usual mount points for removable/network media.
    const drives: VaultDrive[] = [{ path: '/', label: '/' }];
    for (const mountParent of ['/Volumes', '/media', '/mnt']) {
        if (!(await isReadableDirectory(mountParent))) continue;
        try {
            for (const entry of await readdir(mountParent, { withFileTypes: true })) {
                if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
                const full = path.join(mountParent, entry.name);
                if (await isReadableDirectory(full)) {
                    drives.push({ path: full, label: `${entry.name} (${mountParent})` });
                }
            }
        } catch {
            // unreadable mount parent — skip it
        }
    }
    return drives;
}
