// Shared 3D camera + projection for the canvas Stack view.
// World space: x = right, y = down (matches SVG), z = away from the viewer.
// The camera orbits the origin: yaw spins around the vertical axis, pitch tilts
// the scene toward the viewer, then a simple perspective divide projects to 2D.
// Adapted from GeekatplayStudio/LogiTensor (stack-3d-math.ts).

export const VIEW_W = 1440;
export const VIEW_H = 860;
const FOCAL = 1500;

export interface StackCamera {
    yaw: number;
    pitch: number;
    zoom: number;
    panX: number;
    panY: number;
}

export const DEFAULT_STACK_CAMERA: StackCamera = { yaw: -0.34, pitch: 0.52, zoom: 1, panX: 0, panY: 0 };

export interface Projected {
    x: number;
    y: number;
    depth: number; // larger = farther from the viewer (painter's-algorithm key)
}

export function project(x: number, y: number, z: number, cam: StackCamera): Projected {
    const cy = Math.cos(cam.yaw);
    const sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    // Yaw: rotate around the vertical (y) axis
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    // Pitch: rotate around the horizontal (x) axis
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const s = FOCAL / Math.max(200, FOCAL + z2);
    return {
        x: VIEW_W / 2 + x1 * s * cam.zoom + cam.panX,
        y: VIEW_H / 2 + y2 * s * cam.zoom + cam.panY,
        depth: z2,
    };
}

export const clampPitch = (p: number) => Math.min(1.25, Math.max(-0.2, p));
export const clampZoom = (z: number) => Math.min(2.6, Math.max(0.3, z));
