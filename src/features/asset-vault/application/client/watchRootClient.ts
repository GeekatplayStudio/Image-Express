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

export async function listWatchRoots(): Promise<WatchRoot[]> {
    const data = await vaultFetch<{ success: true; roots: WatchRoot[] }>('/api/assets/vault/watch-roots');
    return data.roots;
}

export async function saveWatchRoot(root: WatchRoot): Promise<WatchRoot[]> {
    const data = await vaultFetch<{ success: true; roots: WatchRoot[] }>('/api/assets/vault/watch-roots', {
        method: 'POST',
        body: JSON.stringify(root),
    });
    return data.roots;
}

export async function deleteWatchRoot(id: string): Promise<WatchRoot[]> {
    const data = await vaultFetch<{ success: true; roots: WatchRoot[] }>('/api/assets/vault/watch-roots', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
    });
    return data.roots;
}

export async function scanWatchRoot(rootId: string, embed = true): Promise<{ fileCount: number }> {
    const data = await vaultFetch<{ success: true; fileCount: number }>('/api/assets/vault/watch-roots', {
        method: 'PUT',
        body: JSON.stringify({ rootId, embed }),
    });
    return { fileCount: data.fileCount };
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

export async function resolveLocalFilePreviewUrl(fileUri: string): Promise<string | null> {
    if (typeof window === 'undefined' || !window.desktop?.readLocalVaultFile) return null;
    const absolute = fileUriToAbsolutePath(fileUri);
    const result = await window.desktop.readLocalVaultFile(absolute);
    if (!result.success || !result.base64) return null;
    const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: result.mimeType || 'application/octet-stream' });
    return URL.createObjectURL(blob);
}
