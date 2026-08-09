'use client';

/**
 * Turn a job result URL into one the browser can actually load.
 *
 * New jobs are stored server-side the moment they complete, so their result is
 * already an app-local path. But jobs finished *before* that existed are still
 * in localStorage holding the provider's signed CDN URL — and opening one
 * reproduces the original failure exactly: blocked by CORS, the GLTF loader
 * throws, and the page goes down. Reloading did not help, because reloading
 * restored the same poisoned URLs.
 *
 * So anything not already local is routed through the server's save endpoint,
 * which can fetch cross-origin and returns a path the viewer can open. It also
 * puts the asset in the user's collection, where it should have been all along.
 */

/** True for a URL the browser can load from this origin without CORS. */
export function isLocalAssetUrl(url: string): boolean {
    if (!url) return false;
    // Relative paths and blobs/data are same-origin by construction.
    if (url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:')) return true;
    if (typeof window === 'undefined') return false;
    try {
        return new URL(url, window.location.href).origin === window.location.origin;
    } catch {
        return false;
    }
}

/**
 * A filename for the stored copy, always carrying an extension.
 *
 * Derived from the URL *path*, never the query string — a signed URL's
 * Signature is hundreds of base64 characters. The extension matters beyond
 * tidiness: the library decides an asset's type and whether it can render a
 * thumbnail from the name, so an extension-less file becomes a model nothing
 * recognises.
 */
export function nameHintFor(url: string, provider?: string, isModel = true): string {
    const base = (url.split('?')[0].split('/').pop() || '').trim();
    if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
    return `${provider || 'job'}-result${isModel ? '.glb' : '.png'}`;
}

export type LocalizeResult =
    | { ok: true; url: string; wasRemote: boolean }
    | { ok: false; reason: string };

/**
 * Returns a loadable URL, saving the remote one first when needed.
 *
 * Never falls back to the remote URL on failure — handing that back is the bug
 * this exists to prevent, and a clear error beats a crashed editor.
 */
export async function localizeResultUrl(
    url: string,
    options?: { type?: string; provider?: string },
): Promise<LocalizeResult> {
    if (isLocalAssetUrl(url)) return { ok: true, url, wasRemote: false };

    try {
        const response = await fetch('/api/assets/save-url', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                url,
                filename: nameHintFor(url, options?.provider, (options?.type ?? 'models') === 'models'),
                type: options?.type ?? 'models',
                category: 'generated',
            }),
        });
        const data = await response.json() as { success?: boolean; path?: string; message?: string };
        if (!response.ok || !data.success || !data.path) {
            return { ok: false, reason: data.message || `Save failed (${response.status})` };
        }
        return { ok: true, url: data.path, wasRemote: true };
    } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'Save failed' };
    }
}
