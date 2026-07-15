import {
    project, clampPitch, clampZoom, DEFAULT_STACK_CAMERA, VIEW_W, VIEW_H,
} from '@/lib/multicanvas/stack3dMath';

describe('stack3dMath', () => {
    it('projects the origin to the view center with a neutral camera', () => {
        const cam = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };
        const p = project(0, 0, 0, cam);
        expect(p.x).toBeCloseTo(VIEW_W / 2);
        expect(p.y).toBeCloseTo(VIEW_H / 2);
        expect(p.depth).toBeCloseTo(0);
    });

    it('is deterministic for a fixed camera', () => {
        const a = project(120, -40, 260, DEFAULT_STACK_CAMERA);
        const b = project(120, -40, 260, DEFAULT_STACK_CAMERA);
        expect(a).toEqual(b);
    });

    it('applies pan directly in screen space', () => {
        const cam = { yaw: 0, pitch: 0, zoom: 1, panX: 25, panY: -10 };
        const p = project(0, 0, 0, cam);
        expect(p.x).toBeCloseTo(VIEW_W / 2 + 25);
        expect(p.y).toBeCloseTo(VIEW_H / 2 - 10);
    });

    it('scales x offsets by zoom', () => {
        const near = project(100, 0, 0, { yaw: 0, pitch: 0, zoom: 2, panX: 0, panY: 0 });
        const far = project(100, 0, 0, { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 });
        expect(near.x - VIEW_W / 2).toBeCloseTo(2 * (far.x - VIEW_W / 2));
    });

    it('reports farther depth for points behind the pitch-rotated plane', () => {
        const cam = { ...DEFAULT_STACK_CAMERA };
        const nearPoint = project(0, 0, -300, cam);
        const farPoint = project(0, 0, 300, cam);
        expect(farPoint.depth).toBeGreaterThan(nearPoint.depth);
    });

    it('clamps pitch and zoom to their documented ranges', () => {
        expect(clampPitch(9)).toBe(1.25);
        expect(clampPitch(-9)).toBe(-0.2);
        expect(clampZoom(99)).toBe(2.6);
        expect(clampZoom(0)).toBe(0.3);
    });
});
