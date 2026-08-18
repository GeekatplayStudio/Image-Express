/**
 * Foldcraft machine layer — overhead-camera registration.
 *
 * The reference machine watches its bed with a fixed camera. Cut sheets carry
 * four corner fiducials (see exportSvg); once those are located in a camera
 * frame, a homography maps any camera pixel to bed millimetres — good enough
 * to find a sheet placed by hand, re-find it after a flip for second-face
 * groove passes, and track that it has not shifted mid-job.
 *
 * A homography rather than an affine fit because a camera looking at a flat
 * bed from a bracket is never perfectly perpendicular; perspective is exactly
 * the distortion a homography absorbs and an affine map cannot.
 */

export type PointPair = {
    /** Pixel position in the camera frame. */
    camera: { x: number; y: number };
    /** Known position on the bed, in mm. */
    bed: { x: number; y: number };
};

/** Row-major 3×3 homography. */
export type Homography = number[];

/** Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
    const size = rhs.length;
    const m = matrix.map((row, index) => [...row, rhs[index]]);
    for (let column = 0; column < size; column += 1) {
        let pivot = column;
        for (let row = column + 1; row < size; row += 1) {
            if (Math.abs(m[row][column]) > Math.abs(m[pivot][column])) pivot = row;
        }
        if (Math.abs(m[pivot][column]) < 1e-12) return null;
        [m[column], m[pivot]] = [m[pivot], m[column]];
        for (let row = 0; row < size; row += 1) {
            if (row === column) continue;
            const factor = m[row][column] / m[column][column];
            for (let k = column; k <= size; k += 1) m[row][k] -= factor * m[column][k];
        }
    }
    return m.map((row, index) => row[size] / m[index][index]);
}

/**
 * Fit camera→bed from exactly four correspondences — the four sheet fiducials.
 *
 * Direct linear transform with h9 fixed to 1: eight unknowns, eight equations.
 * Returns null for degenerate input (three collinear points), which in
 * practice means a fiducial was misdetected and the caller should re-acquire.
 */
export function homographyFromPairs(pairs: PointPair[]): Homography | null {
    if (pairs.length !== 4) return null;
    const matrix: number[][] = [];
    const rhs: number[] = [];
    pairs.forEach(({ camera, bed }) => {
        matrix.push([camera.x, camera.y, 1, 0, 0, 0, -camera.x * bed.x, -camera.y * bed.x]);
        rhs.push(bed.x);
        matrix.push([0, 0, 0, camera.x, camera.y, 1, -camera.x * bed.y, -camera.y * bed.y]);
        rhs.push(bed.y);
    });
    const h = solveLinear(matrix, rhs);
    return h ? [...h, 1] : null;
}

/** Map a camera pixel to bed millimetres. */
export function applyHomography(h: Homography, point: { x: number; y: number }): { x: number; y: number } {
    const w = h[6] * point.x + h[7] * point.y + h[8];
    return {
        x: (h[0] * point.x + h[1] * point.y + h[2]) / w,
        y: (h[3] * point.x + h[4] * point.y + h[5]) / w,
    };
}

/**
 * Worst reprojection error over a set of check points, in mm. Under ~1 mm the
 * calibration is good for foam work; above it, re-detect the fiducials.
 */
export function registrationErrorMm(h: Homography, pairs: PointPair[]): number {
    let worst = 0;
    pairs.forEach(({ camera, bed }) => {
        const mapped = applyHomography(h, camera);
        worst = Math.max(worst, Math.hypot(mapped.x - bed.x, mapped.y - bed.y));
    });
    return Number(worst.toFixed(4));
}

/** Bed-mm positions of the sheet fiducials exportSvg draws, for matching. */
export function expectedFiducials(
    sheet: { widthMm: number; heightMm: number },
    fiducialMm = 5,
): Array<{ x: number; y: number }> {
    const inset = Math.max(2, fiducialMm);
    return [
        { x: inset, y: inset },
        { x: sheet.widthMm - inset, y: inset },
        { x: sheet.widthMm - inset, y: sheet.heightMm - inset },
        { x: inset, y: sheet.heightMm - inset },
    ];
}
