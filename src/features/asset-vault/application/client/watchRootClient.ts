'use client';

import { buildSessionAuthorizationHeader } from '@/lib/authSession';
import type { WatchRoot } from '@/features/asset-vault/contracts/watchRoot';

async function vaultFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const authorization = buildSessionAuthorizationHeader();
    const response = await fetch(path, {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...(authorization ? { Authorization: authorization } : {}),
            ...(init?.headers || {}),
        },
    });
    const data = await response.json() as T & { message?: string; error?: { message?: string } };
    if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || `Vault API ${path} failed`);
    }
    return data;
}

/**
 * A 200 response is not a guarantee of the expected body -- a proxy, an older
 * server, or a stubbed fetch can all return JSON without `roots`. Callers render
 * straight off this value (`roots.length`, `roots.map`), so normalise here
 * rather than making every consumer defend itself.
 */
function toWatchRoots(value: unknown): WatchRoot[] {
    return Array.isArray(value) ? value as WatchRoot[] : [];
}

export async function listWatchRoots(): Promise<WatchRoot[]> {
    const data = await vaultFetch<{ success: true; roots: WatchRoot[] }>('/api/assets/vault/watch-roots');
    return toWatchRoots(data?.roots);
}

export async function saveWatchRoot(root: WatchRoot): Promise<WatchRoot[]> {
    const data = await vaultFetch<{ success: true; roots: WatchRoot[] }>('/api/assets/vault/watch-roots', {
        method: 'POST',
        body: JSON.stringify(root),
    });
    return toWatchRoots(data?.roots);
}

export async function deleteWatchRoot(id: string): Promise<WatchRoot[]> {
    const data = await vaultFetch<{ success: true; roots: WatchRoot[] }>('/api/assets/vault/watch-roots', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
    });
    return toWatchRoots(data?.roots);
}

export async function scanWatchRoot(rootId: string, embed = true): Promise<{ fileCount: number }> {
    const data = await vaultFetch<{ success: true; fileCount: number }>('/api/assets/vault/watch-roots', {
        method: 'PUT',
        body: JSON.stringify({ rootId, embed }),
    });
    return { fileCount: Number.isFinite(data?.fileCount) ? data.fileCount : 0 };
}

export function createWatchRootId() {
    return `wr_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`;
}

export async function pickDesktopWatchFolder(): Promise<string | null> {
    if (typeof window === 'undefined' || !window.desktop?.pickWatchRootFolder) return null;
    const result = await window.desktop.pickWatchRootFolder();
    if (!result.success || !result.path) return null;
    return result.path;
}

/** Prefer native OS folder/drive browser; typed paths are fallback only. */
export async function pickWatchFolderInteractive(): Promise<{
    path: string | null;
    reason?: 'canceled' | 'unsupported';
}> {
    if (typeof window === 'undefined') return { path: null, reason: 'unsupported' };
    if (!window.desktop?.pickWatchRootFolder) return { path: null, reason: 'unsupported' };
    const result = await window.desktop.pickWatchRootFolder();
    if (result.canceled) return { path: null, reason: 'canceled' };
    if (result.success && result.path) return { path: result.path };
    return { path: null, reason: 'unsupported' };
}

/** Convert file:// URI to an absolute OS path for Electron IPC. */
export function fileUriToAbsolutePath(fileUri: string): string {
    let pathPart = fileUri.replace(/^file:\/\//i, '');
    if (pathPart.startsWith('/') && /^[A-Za-z]:/.test(pathPart.slice(1))) {
        pathPart = pathPart.slice(1);
    }
    return decodeURIComponent(pathPart.replace(/\//g, '\\'));
}

/**
 * A small, server-resized rendition for grid tiles.
 *
 * Always goes over HTTP, including on desktop: the IPC path reads the *whole*
 * file and base64-encodes it, which for a 2 MB photo shown at 200 pixels is
 * the exact cost this exists to avoid. The local server is in-process anyway.
 */
export function resolveLocalFileThumbnailUrl(fileUri: string, width = 256): string {
    return `/api/assets/vault/file?uri=${encodeURIComponent(fileUri)}&w=${width}`;
}

/**
 * A URL the browser can render or stream for an indexed file.
 *
 * HTTP is preferred even on desktop. The IPC path reads the entire file and
 * base64-encodes it into a blob, which for a 4 GB render costs several times
 * that in memory before a single frame is shown — and a blob has no seek
 * support, so scrubbing a video means holding the whole thing in RAM. The HTTP
 * route serves byte ranges, so a player fetches only what it plays. The route
 * re-checks the access policy and that the file is inside a registered watch
 * root, so this is not a filesystem escape hatch.
 *
 * IPC remains the fallback for a renderer loaded from `file://`, where a
 * relative URL has no server to resolve against.
 */
export async function resolveLocalFilePreviewUrl(fileUri: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;

    const servedOverHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    if (servedOverHttp) {
        return `/api/assets/vault/file?uri=${encodeURIComponent(fileUri)}`;
    }

    if (window.desktop?.readLocalVaultFile) {
        const absolute = fileUriToAbsolutePath(fileUri);
        const result = await window.desktop.readLocalVaultFile(absolute);
        if (result.success && result.base64) {
            const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: result.mimeType || 'application/octet-stream' });
            return URL.createObjectURL(blob);
        }
        return null;
    }

    return null;
}

export type VaultDrive = { path: string; label: string };

export type VaultDirectoryEntry = { path: string; name: string };

export type VaultDirectoryListing = {
    path: string;
    /** null at a drive root or the top of the allowlist — nothing above to browse. */
    parent: string | null;
    entries: VaultDirectoryEntry[];
};

/**
 * Subfolders of `path`, so the browser can offer a real folder picker.
 *
 * The File System Access API cannot help here: it yields an opaque handle,
 * and the indexer needs an actual path. On a local install the server is the
 * same machine, so it does the walking.
 */
export async function browseVaultDirectory(path: string): Promise<VaultDirectoryListing> {
    const data = await vaultFetch<{
        success: true;
        path: string;
        parent: string | null;
        entries: VaultDirectoryEntry[];
    }>(`/api/assets/vault/browse?path=${encodeURIComponent(path)}`);
    return {
        path: typeof data?.path === 'string' ? data.path : path,
        parent: typeof data?.parent === 'string' ? data.parent : null,
        entries: Array.isArray(data?.entries) ? data.entries : [],
    };
}

/** Drives/volumes the server will let this install index. */
export async function listIndexableDrives(): Promise<{
    mode: 'all-drives' | 'allowlist';
    drives: VaultDrive[];
}> {
    const data = await vaultFetch<{
        success: true;
        mode: 'all-drives' | 'allowlist';
        drives: VaultDrive[];
    }>('/api/assets/vault/drives');
    return {
        mode: data?.mode === 'allowlist' ? 'allowlist' : 'all-drives',
        drives: Array.isArray(data?.drives) ? data.drives : [],
    };
}
