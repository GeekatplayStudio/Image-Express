import { solveCamera, toImagePlane, lineIntersect2, type Vec2 } from '../threeDLayer/fspySolver';

// Synthetic pinhole camera: project world points and check the solver
// recovers the FOV it was rendered with.
function makeProjector(fovVdeg: number, width: number, height: number, pitchDeg: number, yawDeg: number) {
    const aspect = width / height;
    const halfV = Math.tan((fovVdeg * Math.PI) / 360);
    const pitch = (pitchDeg * Math.PI) / 180;
    const yaw = (yawDeg * Math.PI) / 180;
    const camPos = [0, 1.6, 5];
    return (p: [number, number, number]): Vec2 => {
        // world -> camera: yaw about y, then pitch about x, camera at camPos
        let x = p[0] - camPos[0];
        let y = p[1] - camPos[1];
        let z = p[2] - camPos[2];
        const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
        const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
        x = x1; z = z1;
        const y1 = y * Math.cos(pitch) - z * Math.sin(pitch);
        const z2 = y * Math.sin(pitch) + z * Math.cos(pitch);
        y = y1; z = z2;
        // camera looks down -z
        const ndcY = (y / -z) / halfV;
        const ndcX = (x / -z) / (halfV * aspect);
        return [(ndcX + 1) / 2, (1 - ndcY) / 2]; // relative image coords
    };
}

describe('solveCamera', () => {
    it('recovers FOV from a synthetic floor grid', () => {
        const W = 1600, H = 1000;
        const fov = 55;
        const project = makeProjector(fov, W, H, -15, 20);
        // Floor lines along +x and +z
        const pair1: [Vec2, Vec2][] = [
            [project([-2, 0, 0]), project([2, 0, 0])],
            [project([-2, 0, 2]), project([2, 0, 2])],
        ];
        const pair2: [Vec2, Vec2][] = [
            [project([-1, 0, -2]), project([-1, 0, 3])],
            [project([1.5, 0, -2]), project([1.5, 0, 3])],
        ];
        const solve = solveCamera(pair1, pair2, W, H)!;
        expect(solve).not.toBeNull();
        expect(solve.fovV).toBeCloseTo(fov, 0);
        expect(solve.focal35).toBeGreaterThan(10);
        // Quaternion is unit length
        const { x, y, z, w } = solve.quaternion;
        expect(Math.hypot(x, y, z, w)).toBeCloseTo(1);
    });

    it('returns null for parallel line pairs', () => {
        const flat: [Vec2, Vec2][] = [
            [[0.1, 0.5], [0.9, 0.5]],
            [[0.1, 0.6], [0.9, 0.6]],
        ];
        // Both pairs horizontal and parallel -> VPs at infinity/degenerate
        expect(solveCamera(flat, flat, 1000, 800)).toBeNull();
    });
});

describe('toImagePlane', () => {
    it('centers and flips y, short side spanning [-1,1]', () => {
        expect(toImagePlane([0.5, 0.5], 1600, 1000)).toEqual([0, -0]);
        const [x, y] = toImagePlane([1, 0], 1600, 1000);
        expect(x).toBeCloseTo(1.6);
        expect(y).toBeCloseTo(1);
    });
});

describe('lineIntersect2', () => {
    it('intersects two crossing lines', () => {
        expect(lineIntersect2([0, 0], [1, 1], [0, 1], [1, 0])).toEqual([0.5, 0.5]);
    });
    it('returns null for parallels', () => {
        expect(lineIntersect2([0, 0], [1, 0], [0, 1], [1, 1])).toBeNull();
    });
});
