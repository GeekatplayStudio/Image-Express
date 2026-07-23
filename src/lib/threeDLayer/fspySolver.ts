// fSpy-style two-vanishing-point camera solve, reimplemented from the
// published fSpy method: two pairs of parallel scene lines give two
// vanishing points; their orthogonality constraint yields the focal length,
// and the directions through the principal point become the rotation.
//
// Coordinates: control points are relative image coords in [0,1] (origin
// top-left). Internally they map to a centered, y-up "image plane" frame
// where the short image side spans [-1, 1].

export type Vec2 = [number, number];
export type Quaternion = { x: number; y: number; z: number; w: number };

export type LinePair = [Vec2, Vec2][]; // two segments, each [start, end]

export type CameraSolve = {
    /** Camera-to-world rotation. */
    quaternion: Quaternion;
    /** Vertical field of view, degrees. */
    fovV: number;
    /** 35mm-equivalent focal length. */
    focal35: number;
    /** Relative focal in image-plane units (short side = 2). */
    focalRel: number;
};

type Vec3 = [number, number, number];

const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
};

/** Relative [0,1] image coords -> centered y-up plane (short side = [-1,1]). */
export function toImagePlane(p: Vec2, width: number, height: number): Vec2 {
    const aspect = width / height;
    if (aspect >= 1) {
        return [(p[0] * 2 - 1) * aspect, -(p[1] * 2 - 1)];
    }
    return [p[0] * 2 - 1, -(p[1] * 2 - 1) / aspect];
}

export function lineIntersect2(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
    const d1x = a2[0] - a1[0];
    const d1y = a2[1] - a1[1];
    const d2x = b2[0] - b1[0];
    const d2y = b2[1] - b1[1];
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((b1[0] - a1[0]) * d2y - (b1[1] - a1[1]) * d2x) / den;
    return [a1[0] + t * d1x, a1[1] + t * d1y];
}

function vanishingPoint(pair: LinePair, width: number, height: number): Vec2 | null {
    const [s1, s2] = pair;
    return lineIntersect2(
        toImagePlane(s1[0], width, height), toImagePlane(s1[1], width, height),
        toImagePlane(s2[0], width, height), toImagePlane(s2[1], width, height),
    );
}

/** Rotation matrix (rows) -> quaternion, Shepperd's method. */
function matrixToQuaternion(r: number[][]): Quaternion {
    const trace = r[0][0] + r[1][1] + r[2][2];
    let x: number, y: number, z: number, w: number;
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        w = s / 4;
        x = (r[2][1] - r[1][2]) / s;
        y = (r[0][2] - r[2][0]) / s;
        z = (r[1][0] - r[0][1]) / s;
    } else if (r[0][0] > r[1][1] && r[0][0] > r[2][2]) {
        const s = Math.sqrt(1 + r[0][0] - r[1][1] - r[2][2]) * 2;
        w = (r[2][1] - r[1][2]) / s;
        x = s / 4;
        y = (r[0][1] + r[1][0]) / s;
        z = (r[0][2] + r[2][0]) / s;
    } else if (r[1][1] > r[2][2]) {
        const s = Math.sqrt(1 + r[1][1] - r[0][0] - r[2][2]) * 2;
        w = (r[0][2] - r[2][0]) / s;
        x = (r[0][1] + r[1][0]) / s;
        y = s / 4;
        z = (r[1][2] + r[2][1]) / s;
    } else {
        const s = Math.sqrt(1 + r[2][2] - r[0][0] - r[1][1]) * 2;
        w = (r[1][0] - r[0][1]) / s;
        x = (r[0][2] + r[2][0]) / s;
        y = (r[1][2] + r[2][1]) / s;
        z = s / 4;
    }
    return { x, y, z, w };
}

/**
 * Solve camera orientation + focal from two vanishing-point line pairs.
 * pair1 is assumed to vanish along world +x, pair2 along world +z
 * (a floor grid's two directions). Returns null when degenerate
 * (parallel segments, VP behind principal point).
 */
export function solveCamera(
    pair1: LinePair,
    pair2: LinePair,
    width: number,
    height: number,
    principal: Vec2 = [0, 0],
): CameraSolve | null {
    const fu = vanishingPoint(pair1, width, height);
    const fv = vanishingPoint(pair2, width, height);
    if (!fu || !fv) return null;

    // f² = -(Fu - P)·(Fv - P): the two world directions are orthogonal.
    const du: Vec2 = [fu[0] - principal[0], fu[1] - principal[1]];
    const dv: Vec2 = [fv[0] - principal[0], fv[1] - principal[1]];
    const f2 = -(du[0] * dv[0] + du[1] * dv[1]);
    if (f2 <= 1e-9) return null;
    const f = Math.sqrt(f2);

    // Camera-space direction columns for the two VP axes; third by cross.
    const colU = norm([du[0], du[1], -f]);
    const colV = norm([dv[0], dv[1], -f]);
    let colW = norm(cross(colU, colV));
    // Re-orthogonalize v against u (VP picks are never exactly orthogonal).
    const colV2 = norm(cross(colW, colU));

    // Rows of camera-to-world: world x = colU, world y = up, world z = colV2.
    // colW should point "up-ish"; flip for a proper right-handed frame.
    if (colW[1] < 0) colW = [-colW[0], -colW[1], -colW[2]];
    const r = [
        [colU[0], colU[1], colU[2]],
        [colW[0], colW[1], colW[2]],
        [colV2[0], colV2[1], colV2[2]],
    ];
    // Ensure det > 0 (proper rotation, not a reflection).
    const det = dot([r[0][0], r[0][1], r[0][2]],
        cross([r[1][0], r[1][1], r[1][2]], [r[2][0], r[2][1], r[2][2]]));
    if (det < 0) {
        r[2] = [-r[2][0], -r[2][1], -r[2][2]];
    }

    // Image plane short side spans [-1,1] => half-height 1 for landscape.
    const aspect = width / height;
    const halfV = aspect >= 1 ? 1 : 1 / aspect;
    const fovV = 2 * Math.atan(halfV / f) * (180 / Math.PI);
    const focal35 = 12 / Math.tan((fovV * Math.PI) / 360); // 35mm frame: 24mm tall
    return {
        quaternion: matrixToQuaternion(r),
        fovV,
        focal35,
        focalRel: f,
    };
}
