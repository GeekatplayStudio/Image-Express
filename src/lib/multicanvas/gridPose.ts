// Shared axis-aligned XYZ lattice for the two "box" levels of the 3D view:
// Bookshelves (collections of albums) and Albums (collections of pages).
// Both use the same layout so the spatial model is learned once — the only
// thing that changes on the way down is what is drawn inside the box.
//
// Pages deliberately do NOT use this: a page is a sheet in a deck, and the
// shared-layer bridge curves in CanvasStackView depend on that vertical
// ordering. See CanvasStackView's `planeMeta`.
//
// World space matches stack3dMath: x = right, y = down, z = away.

export type GridPose = { cx: number; cy: number; cz: number };

export type GridPoseOptions = {
    /** Horizontal (column) spacing. */
    spacingX?: number;
    /** Depth (row) spacing. */
    spacingZ?: number;
    /** Vertical (layer) spacing. */
    spacingY?: number;
    /**
     * How many boxes fit on the floor before the lattice starts stacking
     * upward. Past this the set becomes a true 3D matrix.
     */
    growAfter?: number;
};

/**
 * Spacings are set against the box footprint, not picked by eye: a box is
 * 2 × BOX_HALF (192) across and swells to 1.12× when selected (215), so
 * anything under ~215 makes neighbours interpenetrate. These leave a clear
 * gap around every box at rest, and still leave room once the hover
 * repulsion pushes neighbours apart.
 */
export const DEFAULT_GRID_OPTIONS: Required<GridPoseOptions> = {
    spacingX: 280,
    spacingZ: 280,
    spacingY: 252,
    growAfter: 6,
};

/**
 * Place box `index` of `total` on the lattice, centred on the origin.
 *
 * Up to `growAfter` boxes lie flat on one floor so a small set reads as a
 * simple row/grid at eye level. Past that the lattice grows upward (negative
 * y is up in this world space) instead of sprawling outward — a ring or a
 * single ever-widening row forces the camera further back with every box,
 * while the matrix keeps the whole set inside roughly the same frustum.
 */
export function gridPose(index: number, total: number, options: GridPoseOptions = {}): GridPose {
    const { spacingX, spacingZ, spacingY, growAfter } = { ...DEFAULT_GRID_OPTIONS, ...options };
    const n = Math.max(1, total);
    const i = Math.max(0, index);

    if (n <= growAfter) {
        const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
        const rows = Math.ceil(n / cols);
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
            cx: (col - (cols - 1) / 2) * spacingX,
            cy: 0,
            cz: (row - (rows - 1) / 2) * spacingZ,
        };
    }

    // Keep the floor no wider than it needs to be, so the set grows up rather
    // than out: a cube root gives roughly equal extent on all three axes.
    const cols = Math.max(2, Math.ceil(Math.cbrt(n)));
    const depthRows = Math.max(1, Math.ceil(Math.sqrt(n / cols)));
    const perLayer = cols * depthRows;
    const col = i % cols;
    const row = Math.floor(i / cols) % depthRows;
    const layer = Math.floor(i / perLayer);
    const layers = Math.ceil(n / perLayer);

    return {
        cx: (col - (cols - 1) / 2) * spacingX,
        // Centre the stack vertically, and avoid signed zero from `-0 * s` so
        // poses stay clean for tests and debug output.
        cy: layers <= 1 ? 0 : (layer - (layers - 1) / 2) * -spacingY || 0,
        cz: (row - (depthRows - 1) / 2) * spacingZ,
    };
}

/** How far a neighbour is pushed aside by the box under the cursor. */
export const REPULSION_STRENGTH = 46;
/**
 * Distance at which the push has fallen to half. Set near one cell so
 * immediate neighbours part noticeably while the far side of the lattice
 * stays put — the effect should read as "this box has room", not as the whole
 * grid breathing.
 */
export const REPULSION_FALLOFF = 300;

/**
 * Displace `pose` away from `from`, falling off with distance.
 *
 * The box under the cursor is its own origin and never moves; everything else
 * drifts radially outward. Returns a zero vector when the two coincide, so a
 * box cannot push itself in an arbitrary direction.
 */
export function repulsionOffset(
    pose: GridPose,
    from: GridPose,
    strength: number = REPULSION_STRENGTH,
    falloff: number = REPULSION_FALLOFF,
): GridPose {
    const dx = pose.cx - from.cx;
    const dy = pose.cy - from.cy;
    const dz = pose.cz - from.cz;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-6) return { cx: 0, cy: 0, cz: 0 };
    // Inverse-square-ish falloff: strong for the ring of neighbours, close to
    // nothing two cells out.
    const push = strength / (1 + (distance / falloff) ** 2);
    return {
        cx: (dx / distance) * push,
        cy: (dy / distance) * push,
        cz: (dz / distance) * push,
    };
}

/** Lattice dimensions for a set of `total` boxes — used for framing hints. */
export function gridExtent(total: number, options: GridPoseOptions = {}): {
    cols: number;
    rows: number;
    layers: number;
} {
    const { growAfter } = { ...DEFAULT_GRID_OPTIONS, ...options };
    const n = Math.max(1, total);
    if (n <= growAfter) {
        const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
        return { cols, rows: Math.ceil(n / cols), layers: 1 };
    }
    const cols = Math.max(2, Math.ceil(Math.cbrt(n)));
    const rows = Math.max(1, Math.ceil(Math.sqrt(n / cols)));
    return { cols, rows, layers: Math.ceil(n / (cols * rows)) };
}
