import type { Vec3 } from '@/components/three/threeDLayerPresets';

/**
 * Lighting defaults remembered across sessions. Applied only when opening a NEW
 * model (e.g. from the asset library); layers reopened from the canvas keep the
 * settings saved on the layer itself. Camera, rotation, scale, and resolution
 * are deliberately per-model and never remembered here.
 */
const LIGHTING_DEFAULTS_KEY = 'imageExpressThreeDLightingDefaults';

export type LightingDefaults = {
    lightPosition: Vec3;
    lightIntensity: number;
    lightColor: string;
    ambientIntensity: number;
    environment: string;
    envIntensity: number;
    castShadowEnabled: boolean;
    castShadowBlur: number;
    castShadowIntensity: number;
    contactShadowEnabled: boolean;
    contactShadowBlur: number;
    contactShadowIntensity: number;
};

export const loadLightingDefaults = (): Partial<LightingDefaults> => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(LIGHTING_DEFAULTS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Partial<LightingDefaults>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

export const saveLightingDefaults = (defaults: LightingDefaults) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(LIGHTING_DEFAULTS_KEY, JSON.stringify(defaults));
    } catch {
        // Best effort — remembered lighting is a convenience.
    }
};
