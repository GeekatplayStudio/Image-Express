/**
 * Foldcraft — shared types.
 *
 * This file is the API contract for the whole pipeline, including stages that
 * are not implemented yet, so the shape of the library can be reviewed as a
 * whole. See docs/FOLDCRAFT.md for the design and the phase order.
 *
 * Every type here survives JSON.stringify/parse unchanged. Nothing holds a
 * class instance, a callback, or a handle to browser state, so each stage can
 * be exposed as an HTTP route and an MCP tool without an adapter.
 */

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

/**
 * An indexed mesh with welded vertices and consistent outward winding.
 *
 * Indexed rather than triangle-soup on purpose: adjacency is then "two faces
 * share two vertex indices", with no float comparison anywhere. The previous
 * implementation keyed edges on rounded coordinates, which silently lost
 * adjacency whenever a loader emitted the same corner at slightly different
 * positions — the usual case for glTF, which splits vertices per normal and UV.
 */
export type FoldcraftMesh = {
    vertices: Vec3[];
    /** Each face lists vertex indices, counter-clockwise seen from outside. */
    faces: number[][];
    /** Source units per millimetre, so scale survives the pipeline. */
    unitsPerMm: number;
};

// ---------------------------------------------------------------------------
// S1 — ingest
// ---------------------------------------------------------------------------

export type IngestOptions = {
    /** Weld radius as a fraction of the bounding-box diagonal. */
    weldToleranceRelative?: number;
    /** Propagate a consistent winding and flip the shell outward. */
    forceOutward?: boolean;
    /**
     * Set when the mesh is the mid-surface of a thick part: the surface is
     * offset outward by half this, so the assembled outer size matches.
     */
    midSurfaceThicknessMm?: number;
    /**
     * Drop connected shells whose surface area is below this fraction of the
     * total. Generated sculpts arrive with hundreds of disconnected debris
     * shells (interior bits, floating fragments); each would otherwise become
     * its own cut panel. 0 or absent keeps everything.
     */
    dropShellsBelowAreaFraction?: number;
};

export type IngestReport = {
    mesh: FoldcraftMesh;
    sourceVertices: number;
    weldedVertices: number;
    reorientedFaces: number;
    degenerateFacesRemoved: number;
    boundaryEdges: number;
    nonManifoldEdges: number;
    isClosed: boolean;
    isConsistentlyOriented: boolean;
    warnings: string[];
};

// ---------------------------------------------------------------------------
// S2 — simplify
// ---------------------------------------------------------------------------

export type SimplifyMode = 'none' | 'decimate' | 'panelize' | 'voxelize';

export type SimplifyOptions = {
    mode: SimplifyMode;
    targetFaces?: number;
    /** panelize: merge faces whose normals differ by less than this. */
    planarToleranceDeg?: number;
    /** voxelize: grid divisions along the longest axis. */
    voxelResolution?: number;
};

export type SimplifyReport = {
    mesh: FoldcraftMesh;
    sourceFaces: number;
    resultFaces: number;
    maxDeviationMm: number;
    planarityErrorDeg: number;
};

// ---------------------------------------------------------------------------
// S3 — surface regions
// ---------------------------------------------------------------------------

export type SurfaceKind = 'plane' | 'cylinder' | 'cone' | 'freeform';

export type SurfaceFit =
    | { kind: 'plane'; origin: Vec3; normal: Vec3 }
    | { kind: 'cylinder'; axisOrigin: Vec3; axisDirection: Vec3; radiusMm: number }
    | { kind: 'cone'; apex: Vec3; axisDirection: Vec3; halfAngleDeg: number }
    | { kind: 'freeform' };

export type SurfaceRegion = {
    id: number;
    kind: SurfaceKind;
    faces: number[];
    fit: SurfaceFit;
    fitErrorMm: number;
};

// ---------------------------------------------------------------------------
// S4 — segmentation
// ---------------------------------------------------------------------------

export type SeamPreference = 'fewest-seams' | 'hide-sharp-edges' | 'balanced';

export type SegmentOptions = {
    maxPanelWidthMm: number;
    maxPanelHeightMm: number;
    seamPreference?: SeamPreference;
    /** Never split a region that fitted a cylinder or cone. */
    keepRegionsWhole?: boolean;
};

export type Patch = {
    id: number;
    faces: number[];
    seedFace: number;
    regionId: number;
    kind: SurfaceKind;
};

// ---------------------------------------------------------------------------
// S5 — flattening
// ---------------------------------------------------------------------------

export type FoldDirection = 'mountain' | 'valley' | 'flat';

/**
 * An edge interior to a panel: it is folded, not cut.
 *
 * `dihedralDeg` is the angle between the two panels in the finished object —
 * 180 is flat, 90 is a right angle. Its sign comes from the parent face's own
 * winding order. Deriving it from sorted vertex keys, as the papercraft module
 * does, makes the sign arbitrary: a cube came out 6 mountain / 6 valley when
 * all twelve edges are the same fold.
 */
export type FlatInteriorEdge = {
    edgeKey: string;
    a: Vec2;
    b: Vec2;
    dihedralDeg: number;
    direction: FoldDirection;
    parentFace: number;
    childFace: number;
};

export type FlatFacePolygon = {
    faceId: number;
    points: Vec2[];
};

export type FlatPanel = {
    patchId: number;
    kind: SurfaceKind;
    faces: FlatFacePolygon[];
    interiorEdges: FlatInteriorEdge[];
    boundaryEdges: FlatBoundaryEdge[];
    boundsMm: { minX: number; minY: number; maxX: number; maxY: number };
    /** Invariant: false. A mirrored panel assembles inside-out. */
    mirrored: boolean;
    maxEdgeErrorPct: number;
    method: 'analytic' | 'rigid';
};

export type FlatBoundaryEdge = {
    edgeKey: string;
    a: Vec2;
    b: Vec2;
    faceId: number;
    /** True when the twin face landed on another panel, so this is a seam. */
    seam: boolean;
};

// ---------------------------------------------------------------------------
// S6 — grooves
// ---------------------------------------------------------------------------

export type GrooveMethod = 'v-groove' | 'channel' | 'score' | 'through-cut';

/** Properties of the stock being cut. Nothing here depends on the machine. */
export type MaterialSpec = {
    thicknessMm: number;
    /** Material left uncut at the hinge so the panels stay joined. */
    hingeMm: number;
    /** Above this dihedral the material just bends; a score line is enough. */
    scoreOnlyAboveDeg: number;
    /** Below this dihedral the edge is cut apart and rejoined instead. */
    throughCutBelowDeg: number;
};

export type MachineOutput = 'svg' | 'dxf' | 'gcode';

/**
 * What a given cutter can physically do.
 *
 * Kept separate from the material because the same foam behaves differently on
 * different machines, and because the interesting capability — whether the
 * blade can tilt — decides whether a fold gets a true V-groove or an
 * approximation. A drag knife that cannot tilt is a special case of this type,
 * not the shape the library is designed around.
 */
export type MachineProfile = {
    id: string;
    name: string;
    bedWidthMm: number;
    bedHeightMm: number;
    /**
     * Largest tilt from perpendicular the blade can hold, in degrees.
     * 0 means it cannot tilt at all and grooves fall back to channels.
     * A fold of dihedral θ wants a tilt of |180 − θ| / 2, so 45° covers
     * every fold down to a right angle.
     */
    maxBladeTiltDeg: number;
    /** Whether cut depth is controllable, which partial-depth grooves need. */
    hasDepthControl: boolean;
    /** Tangential knives must be swivelled to face along the path. */
    requiresTangentialSwivel: boolean;
    kerfMm: number;
    output: MachineOutput;
};

export type SheetFace = 'inside' | 'outside';

/**
 * One cutting pass along a groove.
 *
 * A groove is a list of passes rather than a single profile because the angle
 * a fold needs may exceed what one pass at the machine's blade tilt can open,
 * and because mountain and valley folds on the same sheet are relieved from
 * opposite faces. A Cricut, whose blade cannot tilt at all, gets
 * `bladeTiltDeg: 0` passes that together bound a channel of the right width.
 */
export type GroovePass = {
    face: SheetFace;
    /** Signed offset from the fold line, across it, in millimetres. */
    offsetMm: number;
    /** Blade tilt from perpendicular. 0 on a machine that cannot tilt. */
    bladeTiltDeg: number;
    depthMm: number;
};

export type GrooveSpec = {
    edgeKey: string;
    a: Vec2;
    b: Vec2;
    dihedralDeg: number;
    /** |180 - dihedral|. The notch closes exactly at this rotation. */
    grooveAngleDeg: number;
    depthMm: number;
    widthMm: number;
    /** Face carrying the relief: inside for a mountain fold, outside for a valley. */
    side: SheetFace;
    method: GrooveMethod;
    passes: GroovePass[];
    /** Channel walls as cut geometry; empty for a plain score. */
    outline: Vec2[];
};

// ---------------------------------------------------------------------------
// S7–S8 — joinery, packing, export
// ---------------------------------------------------------------------------

export type JoineryOptions = {
    tabDepthMm: number;
    /** Grooved folds stay attached and self-align, so they need no tab. */
    tabsOnGroovedEdges?: boolean;
    labelEdges?: boolean;
};

export type SheetSpec = {
    widthMm: number;
    heightMm: number;
    marginMm: number;
    gapMm: number;
};

export type SheetLayout = {
    index: number;
    spec: SheetSpec;
    placements: Array<{ panelId: number; x: number; y: number; rotationDeg: number }>;
};

// ---------------------------------------------------------------------------
// S9 — validation
// ---------------------------------------------------------------------------

export type FoldBackReport = {
    verdict: 'ok' | 'warn' | 'fail';
    refoldMaxErrorMm: number;
    refoldMeanErrorMm: number;
    /** 1 when every fold's sign agrees with the source dihedral. */
    foldSignConsistency: number;
    mirroredPanels: number;
    overlappingPanels: number;
    unplacedFaces: number;
    issues: string[];
};

// ---------------------------------------------------------------------------
// Composed pipeline
// ---------------------------------------------------------------------------

export type FoldPlanOptions = {
    simplify: SimplifyOptions;
    segment: SegmentOptions;
    material: MaterialSpec;
    joinery: JoineryOptions;
    sheet: SheetSpec;
    /** Longest dimension of the finished object. */
    finishedSizeMm?: number;
};

export type FoldPlan = {
    panels: FlatPanel[];
    grooves: GrooveSpec[][];
    layouts: SheetLayout[];
    validation: FoldBackReport;
    stats: {
        sourceFaces: number;
        panelCount: number;
        analyticPanels: number;
        seamCount: number;
        sheetCount: number;
    };
};

// ---------------------------------------------------------------------------
// Pipeline progress
// ---------------------------------------------------------------------------

/**
 * The user-facing stages of the composed pipeline, in the order they run.
 * Internal stages (welding, debris filtering, decimation escalation) fold
 * into the stage the user would name: "read the model", "make it low-poly",
 * "unfold it", and so on.
 */
export const FOLD_PROGRESS_STAGES = ['load', 'lowpoly', 'unfold', 'grooves', 'layout', 'verify'] as const;

export type FoldProgressStage = (typeof FOLD_PROGRESS_STAGES)[number];

export type FoldProgressEvent = {
    stage: FoldProgressStage;
    status: 'start' | 'done';
    /** Headline numbers for the stage, keyed for the host to format. */
    stats?: Record<string, number | string>;
    /** Self-contained SVG thumbnail of this stage's output, when visual. */
    previewSvg?: string;
    /**
     * Why this stage is unhappy, in the maker's terms. Present on `verify`
     * whenever validation or machine simulation found something, so a host
     * can show the reason a plan was refused instead of a bare failure.
     */
    issues?: string[];
};

/**
 * Serialisable except for being a function — hosts running the pipeline in a
 * worker forward events over postMessage instead of passing the listener in.
 */
export type FoldProgressListener = (event: FoldProgressEvent) => void;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** 6 mm EVA foam, the common cosplay armour stock. */
export const DEFAULT_MATERIAL: MaterialSpec = {
    thicknessMm: 6,
    hingeMm: 0.5,
    scoreOnlyAboveDeg: 150,
    throughCutBelowDeg: 40,
};

/**
 * The open-source ultrasonic cutter this library targets: a 600 mm laser-cutter
 * frame carrying an ultrasonic blade on a programmable tilt axis.
 *
 * Tilt range and kerf are placeholders pending the real build — they are the
 * two numbers to correct once the machine exists. Everything else follows from
 * the frame and the knife type.
 */
export const ULTRASONIC_TILT_MACHINE: MachineProfile = {
    id: 'ultrasonic-tilt-600',
    name: 'Ultrasonic tilting knife (600 × 600)',
    bedWidthMm: 600,
    bedHeightMm: 600,
    maxBladeTiltDeg: 45,
    hasDepthControl: true,
    requiresTangentialSwivel: true,
    kerfMm: 0.3,
    output: 'gcode',
};

/** A drag knife that cannot tilt — the constrained case, kept as a comparison. */
export const CRICUT_MAKER_MACHINE: MachineProfile = {
    id: 'cricut-maker',
    name: 'Cricut Maker (12 × 24 mat)',
    bedWidthMm: 305,
    bedHeightMm: 610,
    maxBladeTiltDeg: 0,
    hasDepthControl: false,
    requiresTangentialSwivel: false,
    kerfMm: 0.4,
    output: 'svg',
};

export const DEFAULT_MACHINE = ULTRASONIC_TILT_MACHINE;

/** Usable sheet for a machine, inset by a margin. */
export const sheetForMachine = (
    machine: MachineProfile,
    marginMm = 10,
    gapMm = 5,
): SheetSpec => ({
    widthMm: machine.bedWidthMm,
    heightMm: machine.bedHeightMm,
    marginMm,
    gapMm,
});

export const DEFAULT_SHEET: SheetSpec = sheetForMachine(DEFAULT_MACHINE);
