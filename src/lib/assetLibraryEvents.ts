'use client';

export const ASSET_LIBRARY_CHANGED_EVENT = 'image-express-assets-changed';

export function dispatchAssetLibraryChanged(detail?: Record<string, unknown>) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(ASSET_LIBRARY_CHANGED_EVENT, { detail }));
}