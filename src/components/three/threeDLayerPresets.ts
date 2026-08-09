/**
 * Lighting, environment and camera presets for the 3D layer editor.
 *
 * Pure data plus the one vector helper the presets need. Extracted from
 * ThreeDLayerEditor so the editor file holds behaviour rather than tables —
 * these change for design reasons, not for rendering reasons.
 */

export type Vec3 = { x: number; y: number; z: number };

export const GIZMO_ORBIT_RADIUS = 2.2;
export const GIZMO_GROUP_NAME = 'light-gizmo-group';

export type LightPreset = {
    name: string;
    labelKey: string;
    swatch: string;
    direction: Vec3;
    intensity: number;
    color: string;
    ambient: number;
};

export const LIGHT_PRESETS: LightPreset[] = [
    { name: 'Studio', labelKey: 'view3d.preset.studio', swatch: '#f5f5f5', direction: { x: 4, y: 6, z: 4 }, intensity: 1.3, color: '#ffffff', ambient: 0.4 },
    { name: 'Golden Hour', labelKey: 'view3d.preset.goldenHour', swatch: '#ffb36b', direction: { x: 6, y: 1.6, z: 3 }, intensity: 1.6, color: '#ffb36b', ambient: 0.3 },
    { name: 'Noon', labelKey: 'view3d.preset.noon', swatch: '#fff3c4', direction: { x: 0.5, y: 8, z: 2 }, intensity: 1.8, color: '#fff7e0', ambient: 0.5 },
    { name: 'Dramatic', labelKey: 'view3d.preset.dramatic', swatch: '#c9c9c9', direction: { x: -6, y: 4, z: -1.5 }, intensity: 2.2, color: '#ffffff', ambient: 0.12 },
    { name: 'Rim', labelKey: 'view3d.preset.rim', swatch: '#cfe4ff', direction: { x: 0, y: 3, z: -7 }, intensity: 2.4, color: '#cfe4ff', ambient: 0.2 },
    { name: 'Soft', labelKey: 'view3d.preset.soft', swatch: '#efeae2', direction: { x: 3, y: 5, z: 5 }, intensity: 0.9, color: '#fff6ec', ambient: 0.7 },
    { name: 'Moonlight', labelKey: 'view3d.preset.moonlight', swatch: '#7ea0ff', direction: { x: -4, y: 3.5, z: 4 }, intensity: 1.1, color: '#8fa8ff', ambient: 0.15 },
];

export const ENVIRONMENTS = ['studio', 'city', 'apartment', 'dawn', 'sunset', 'forest', 'park', 'night', 'lobby', 'warehouse'] as const;

export const CAMERA_VIEWS: { name: string; labelKey: string; direction: Vec3 }[] = [
    { name: 'Front', labelKey: 'view3d.view.front', direction: { x: 0, y: 0.25, z: 1 } },
    { name: '¾ Left', labelKey: 'view3d.view.threeQuarterLeft', direction: { x: -1, y: 0.45, z: 1 } },
    { name: '¾ Right', labelKey: 'view3d.view.threeQuarterRight', direction: { x: 1, y: 0.45, z: 1 } },
    { name: 'Side', labelKey: 'view3d.view.side', direction: { x: 1, y: 0.15, z: 0 } },
    { name: 'Top', labelKey: 'view3d.view.top', direction: { x: 0.01, y: 1, z: 0.15 } },
];

/** Euclidean length, never zero so it is always safe to divide by. */
export const vecLength = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;

/** Rescale a direction to a fixed length, preserving its orientation. */
export const vecScaleTo = (v: Vec3, length: number): Vec3 => {
    const l = vecLength(v);
    return { x: (v.x / l) * length, y: (v.y / l) * length, z: (v.z / l) * length };
};

export type ModelBounds = { groundY: number; radius: number };
