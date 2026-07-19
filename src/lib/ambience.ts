'use client';

/**
 * Client runtime for Dashboard Ambience packs. The active pack (full manifest
 * snapshot) is stored in localStorage so the dashboard can render immediately;
 * it is reconciled against the server list whenever the dashboard mounts.
 */

import {
    AMBIENCE_CHANGED_EVENT,
    AMBIENCE_STORAGE_KEY,
    DEFAULT_AMBIENCE,
    DEFAULT_AMBIENCE_ID,
    validateAmbienceManifest,
    type InstalledAmbience,
} from '@/lib/ambience-shared';

export { AMBIENCE_CHANGED_EVENT, DEFAULT_AMBIENCE, DEFAULT_AMBIENCE_ID } from '@/lib/ambience-shared';

export const listAmbiencePacks = async (): Promise<InstalledAmbience[]> => {
    const response = await fetch('/api/ambience', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to list ambience packs (${response.status})`);
    }
    const payload = await response.json() as { success: boolean; packs?: InstalledAmbience[]; error?: string };
    if (!payload.success || !Array.isArray(payload.packs)) {
        throw new Error(payload.error || 'Failed to list ambience packs.');
    }
    return payload.packs;
};

export const loadStoredAmbience = (): InstalledAmbience => {
    if (typeof window === 'undefined') return DEFAULT_AMBIENCE;
    try {
        const raw = window.localStorage.getItem(AMBIENCE_STORAGE_KEY);
        if (!raw) return DEFAULT_AMBIENCE;
        const parsed = JSON.parse(raw) as InstalledAmbience;
        if (parsed?.id === DEFAULT_AMBIENCE_ID) return DEFAULT_AMBIENCE;
        const validation = validateAmbienceManifest(parsed);
        if (!validation.ok || typeof parsed.baseUrl !== 'string') return DEFAULT_AMBIENCE;
        return { ...validation.manifest, source: 'installed', baseUrl: parsed.baseUrl };
    } catch {
        return DEFAULT_AMBIENCE;
    }
};

export const activateAmbience = (pack: InstalledAmbience) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AMBIENCE_STORAGE_KEY, JSON.stringify(pack));
    window.dispatchEvent(new Event(AMBIENCE_CHANGED_EVENT));
};

/** Reconcile the stored pack with the server (pack may have been removed/updated). */
export const syncStoredAmbience = async (): Promise<InstalledAmbience> => {
    const stored = loadStoredAmbience();
    if (stored.id === DEFAULT_AMBIENCE_ID) return stored;
    try {
        const packs = await listAmbiencePacks();
        const match = packs.find((pack) => pack.id === stored.id);
        if (match) {
            activateAmbience(match);
            return match;
        }
        activateAmbience(DEFAULT_AMBIENCE);
        return DEFAULT_AMBIENCE;
    } catch {
        return stored;
    }
};
