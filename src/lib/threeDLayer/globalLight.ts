// Canvas-global "sun": one directional light shared by every 3D layer with
// useGlobalLight enabled. Persisted per browser (like lighting defaults for
// the 3D model editor) and broadcast so open panels re-bake.

import type { ThreeDLayerLight } from '@/types';

const STORAGE_KEY = 'image-express-3dlayer-global-light';
export const GLOBAL_LIGHT_CHANGED_EVENT = 'image-express-global-light-changed';

export type GlobalLightState = {
    azimuth: number;
    elevation: number;
    color: string;
    intensity: number;
    shadows: { enabled: boolean; strength: number; softness: number; range: number };
};

export const DEFAULT_GLOBAL_LIGHT: GlobalLightState = {
    azimuth: 120,
    elevation: 45,
    color: '#ffffff',
    intensity: 1,
    shadows: { enabled: true, strength: 0.5, softness: 0.3, range: 0.15 },
};

export function loadGlobalLight(): GlobalLightState {
    if (typeof window === 'undefined') return DEFAULT_GLOBAL_LIGHT;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_GLOBAL_LIGHT;
        return { ...DEFAULT_GLOBAL_LIGHT, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_GLOBAL_LIGHT;
    }
}

export function saveGlobalLight(state: GlobalLightState) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Quota/private-mode failures only lose persistence, not the session.
    }
    window.dispatchEvent(new CustomEvent(GLOBAL_LIGHT_CHANGED_EVENT, { detail: state }));
}

export function subscribeGlobalLight(listener: (state: GlobalLightState) => void): () => void {
    const handler = (e: Event) => listener((e as CustomEvent<GlobalLightState>).detail);
    window.addEventListener(GLOBAL_LIGHT_CHANGED_EVENT, handler);
    return () => window.removeEventListener(GLOBAL_LIGHT_CHANGED_EVENT, handler);
}

/** The global sun expressed as a directional ThreeDLayerLight. */
export function globalLightAsLayerLight(state: GlobalLightState): ThreeDLayerLight {
    return {
        id: 'global-sun',
        kind: 'directional',
        color: state.color,
        intensity: state.intensity,
        azimuth: state.azimuth,
        elevation: state.elevation,
        shadows: state.shadows,
    };
}
