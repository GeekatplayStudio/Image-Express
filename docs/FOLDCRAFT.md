# Foldcraft — mesh unfolding library

Foldcraft turns a 3D model into flat, cuttable panels with fold grooves sized
for a real material thickness, so a hat, a can, or a suit of armour can be cut
from foam and folded back into the original shape.

The primary target is an open-source ultrasonic cutter — a 600 × 600 mm
laser-cutter frame carrying an ultrasonic blade on a programmable tilt axis.
Because that blade can be angled under program control, it cuts true V-grooves,
which is the ideal geometry for a fold. Machines that cannot tilt, such as a
Cricut drag knife, are supported as a constrained case rather than being the
shape the library is designed around.

This document is the design and API contract. It is written before the
implementation so the API can be reviewed, and so each stage ships and is
verified on its own. Status of each stage is tracked in
[Implementation roadmap](#implementation-roadmap).

> Foldcraft replaces `src/lib/papercraft/`. That module stays in place and keeps
> working until Foldcraft reaches parity — see [Migration](#migration).

---

## 1. Why a new library

The existing papercraft unfolder produces nets that do not fold back into the
source model. Three defects were reproduced against synthetic test solids:

**Fold directions are wrong about half the time.** `foldInstruction()` derives
the shared edge's direction from `sharedEdgeKey.split('|')` — vertex keys sorted
as strings. String order has no relationship to the surface, so the sign of the
dihedral angle is arbitrary. Measured on solids where every interior fold must
be identical:

| Solid | Interior folds | Current result | Correct result |
| --- | --- | --- | --- |
| Cube | 12 | 6 mountain / 6 valley | 12 identical |
| Icosahedron | 30 | 16 mountain / 14 valley | 30 identical |
| Hemisphere (4×10) | 50 | 37 mountain / 13 valley | 50 identical |

A cube's twelve edges are the same 90° convex fold. Half of them are currently
labelled backwards. Taking the edge direction from the parent triangle's own
winding order instead produces 100% agreement on all three solids.

**Islands can be mirror images.** `seedPlacement()` always lays the seed
triangle out in a fixed 2D winding regardless of which way the face points in
3D, so each island independently has about a coin-flip chance of being the
mirror of the real surface patch. Symmetric panels hide it; an asymmetric one —
a helmet cheek plate — comes out reversed, and its fold directions read
backwards along with it.

**Islands fragment.** The flattener skips a face whenever it would overlap and
re-seeds it as a fresh island later, with no preference for cutting along edges
that are cheap to cut. A 70-face hemisphere became 11 islands, several of them a
single triangle. More islands means more seams, more glue, and more chances to
assemble it wrong.

What is already correct and worth carrying over: the rigid flattening maths
itself (edge lengths and face areas were preserved to within floating-point
error) and the separating-axis overlap test.

None of this is fixable by tuning. The fold sign needs a different input, the
seed needs orientation data the current code never computes, and the
fragmentation needs a different search strategy. Beyond that, the target
material changes the problem: paper folds on a scored line at any angle, foam
does not. Foam has thickness, and thickness needs a groove.

---

## 2. Language choice: TypeScript

Verified against the npm and PyPI registries on 2026-08-18.

### What JavaScript/TypeScript offers

| Package | Version | Licence | Maintained | Use here |
| --- | --- | --- | --- | --- |
| `meshoptimizer` | 1.2.0 | MIT | 2026-06 | Decimation to low-poly, with error control |
| `manifold-3d` | 3.5.1 | Apache-2.0 | 2026-06 | Booleans, repair, solid ops (WASM) |
| `clipper2-wasm` | 0.4.0 | BSL-1.0 | 2026-05 | 2D polygon offsetting — tabs, groove strips |
| `earcut` | 3.2.3 | ISC | 2026-07 | 2D triangulation |
| `three-mesh-bvh` | 0.9.14 | MIT | 2026-08 | Spatial queries, overlap acceleration |

### What Python offers

| Package | Version | Licence | Maintained | Use here |
| --- | --- | --- | --- | --- |
| `trimesh` | 5.0.0 | MIT | 2026-08 | Adjacency, dihedral angles, repair, voxels |
| `libigl` | 2.6.2 | MPL-2.0 | 2026-03 | Parameterisation (LSCM/ARAP), cut graphs |
| `shapely` | 2.1.2 | BSD-3 | 2025-09 | 2D polygon operations |
| `networkx` | 3.6.1 | BSD-3 | 2025-12 | Spanning trees over the dual graph |
| `potpourri3d` | 1.4.0 | MIT | 2026-03 | Geodesics, surface cut paths |
| `pymeshlab` | 2025.7 | **GPL-3** | 2026-01 | Ruled out — licence is incompatible |

Python's ecosystem is genuinely stronger. `trimesh` alone covers most of the
mesh plumbing. That is a real advantage and it is worth being honest about.

### Why TypeScript still wins

**Neither ecosystem has the part that matters.** Searching npm for papercraft
and unfolding turns up one relevant package, `orthogami` (MIT, "Turn voxel
models into papercraft"), last touched in 2022 and limited to axis-aligned
orthogonal polyhedra. Python has `paperfoldmodels`, a hobby script. The
segmentation, the corrected flattening, the developable unrolling, and every
part of the groove generation have to be written from scratch either way.
Python would save the mesh-loading and adjacency plumbing — roughly 200 lines
that already exist in this repo.

**The cost of a second runtime is concrete and permanent.** Unfold runs in the
renderer today: `usePapercraftUnfold.ts` calls `buildPapercraftPlan()`
in-process on a right-click. Moving to Python means bundling an interpreter into
the electron-builder installers for three platforms, adding a process lifecycle
and IPC bridge, and handling a new class of failure at the exact place this
project already has known pain — the Node version shadowing problem is one
runtime mismatch, and this would add a second, harder one.

**The surrounding system is already TypeScript.** The MCP server is Node with
zod schemas. The Cricut exporter, sheet nesting, and CNC planner are TypeScript.
Fabrication output has to reach a Fabric.js canvas. A Python core would be an
island reachable only by serialising across a process boundary.

**Decision: TypeScript**, in the renderer, with WASM helpers where they earn
their place (`meshoptimizer` for decimation, `clipper2-wasm` for offsetting).
Both are self-contained WASM with no native build step, so packaging is
unaffected. `manifold-3d` is held in reserve for mesh repair and is not a
dependency of the first phases.

---

## 3. What the shapes actually need

The three named targets need different treatment, and this drives the whole
architecture.

**A can** is a cylinder plus two discs. A cylinder is a *developable* surface —
it unrolls to an exact rectangle of width 2πr with zero distortion, as one
piece. Triangulating it into 80 triangles and unfolding them one at a time
throws that away and produces the ragged islands seen today. Recognising the
cylinder gives three clean pieces.

**A top hat** is the same story: a cylindrical crown, a disc for the top, and a
flat annulus for the brim. Three developable pieces, no approximation.

**Armour and helmets** are doubly curved. No amount of cleverness unrolls a
sphere without distortion, so these genuinely need faceting into flat panels and
folding along the facet edges — the low-poly look, which is also what the user
wants aesthetically.

So the pipeline needs two paths: an **analytic path** that recognises planes,
cylinders, and cones and unrolls them exactly, and a **faceted path** for
everything else. The current implementation only has the faceted path, applied
to everything.

---

## 4. Pipeline

Nine stages. Each is a pure function taking and returning JSON-serialisable
values, so each can be called on its own, tested on its own, and exposed as an
MCP tool.

```
 source model
      │
 S1   ├─ ingest ................ weld, orient outward, report manifoldness
 S2   ├─ simplify .............. decimate | panelize | voxelize
 S3   ├─ detectSurfaceRegions .. plane / cylinder / cone / freeform
 S4   ├─ segment ............... dual-graph spanning forest → patches
 S5   ├─ flatten ............... analytic unroll, or rigid unfold
 S6   ├─ planGrooves ........... dihedral → groove angle, depth, width
 S7   ├─ planJoinery ........... tabs, slots, edge labels
 S8   ├─ pack + export ......... nest on sheets → SVG / DXF
 S9   └─ validate .............. re-fold and compare against the source
```

### S1 — Ingest

Load GLB/GLTF/STL/OBJ, weld coincident vertices, and orient every face
consistently outward. Both of these are load-bearing and neither happens today.

Welding matters because real GLTF splits vertices for normals and UVs, so the
same corner appears several times with slightly different coordinates. Adjacency
built on exact float equality misses those edges and the mesh looks
disconnected. Foldcraft welds with a tolerance relative to the bounding box
rather than the current fixed `1e-5`, which is wrong for a model authored in
metres and wrong differently for one in millimetres.

Orientation matters because **every downstream fold sign depends on it**. The
fix proven in §1 reads the edge direction from the parent face's winding, which
is only meaningful if all faces wind consistently. Ingest does a breadth-first
orientation propagation and then a signed-volume check to decide whether the
whole shell needs flipping.

### S2 — Simplify

Three modes, chosen by what the piece is for.

`decimate` — edge-collapse to a target face count via `meshoptimizer`, keeping
the silhouette. The general-purpose low-poly mode.

`panelize` — cluster faces into near-planar regions, fit a plane to each, and
snap the region onto it, so panels are *genuinely* flat rather than nearly flat.
This is what makes a clean foam build: a panel that is flat to within a
tolerance still fights you when you glue it. It reduces face count and
guarantees flatness in one step, so typical input needs no separate decimation
pass. Measured on a 456-face hemisphere:

| Tolerance | Panels | Surface moved | Planarity error |
| --- | --- | --- | --- |
| 5° | 209 | 2.9% | 0.003° |
| 8° (default) | 180 | 2.6% | 0.003° |
| 12° | 77 | 6.8% | 0.008° |
| 16° | 36 | 7.1% | 0.016° |
| 25° | 69 | 10.5% | 0.010° |

"Surface moved" is the furthest any vertex travelled, as a fraction of the
model's longest axis. The sweet spot is 12–16°: past about 20° greedy region
growth starts producing regions that cannot be flattened at all, those panels
are split into triangles to keep them cuttable, and the panel count climbs back
up. Tolerance is the maker's dial between "looks like the model" and "few enough
pieces to build", and it is worth exposing directly in the UI.

`voxelize` — snap onto an axis-aligned grid, producing an orthogonal polyhedron
of rectangular panels. This is the "voxels for flat pieces" idea, and it suits
blocky stylised props. `orthogami` proved the concept; Foldcraft implements it
inline rather than depending on an unmaintained package.

### S3 — Surface region detection

Classify each region as plane, cylinder, cone, or freeform, fitting parameters
and recording the fit error. This is what makes the can and the hat come out
right. A region only keeps its analytic classification if the fit error stays
under tolerance; otherwise it falls back to freeform and takes the faceted path.

### S4 — Segmentation

Replaces the greedy breadth-first search. Build the dual graph — one node per
face, one arc per shared edge — and weight each arc by its dihedral angle.
A maximum spanning forest under that weighting keeps nearly-flat edges connected
and pushes cuts onto the sharp edges, which are both cheaper to cut and easier
to hide. This is the same algorithm class as Blender's *Export Paper Model*
add-on; the idea is public, the code is GPL and is not being copied.

Constraints are applied while the forest grows: a patch stops when it would
exceed the sheet, when it would self-overlap when flattened, or when it crosses
into a different surface region.

### S5 — Flatten

Analytic regions unroll by closed form: a cylinder of radius r and height h
becomes a 2πr × h rectangle; a cone becomes an annular sector; a plane is
already flat.

Freeform patches use rigid unfolding — the maths the current code already gets
right — with two corrections:

- The **seed triangle** is laid out with its 2D winding matched to its outward
  normal, so the panel is never a mirror image.
- The **fold sign** comes from the parent face's winding order, not from sorted
  vertex keys.

Both are verified by the convex-solid property test in §1.

### S6 — Grooves

New, and the reason this is not just a bug-fix. Paper folds on a score line at
any angle. Foam has thickness, and folding it to a given angle needs material
removed.

Let `t` be thickness, `h` the hinge left uncut, and `θ` the dihedral angle
between the two panels in the finished object. Throughout Foldcraft `θ` is
measured through the material, seen from outside: **180° is flat, below 180° is
convex, above 180° is a reflex or valley fold.** Folding rotates a panel by the
turn angle `φ = 180° − θ`. Cutting a V-notch whose walls meet exactly at that
rotation means the notch's included angle equals the turn angle:

```
grooveAngle  α = |180° − θ|
depth        d = t − h
width        w = 2 · d · tan(α / 2)
side         = θ < 180° ? inside : outside
```

The absolute value and the `side` term are the same fact: a valley fold needs
the identical groove cut on the opposite face. Convex folds dominate on the
shapes in scope, so in practice nearly every groove lands on the inside.

For 6 mm foam with a 0.5 mm hinge:

| Target dihedral θ | Groove angle α | Groove width w |
| --- | --- | --- |
| 90° (right angle) | 90° | 11.0 mm |
| 120° | 60° | 6.4 mm |
| 150° | 30° | 2.9 mm |

The 90° case shows why this cannot be an afterthought: an 11 mm channel is a
real amount of the panel, and a layout that ignores it produces an object that
assembles undersized.

**Which face gets the groove.** The groove goes on the concave side of the fold.
For a convex object — a helmet, a hat crown — that is the inner surface, so
nearly every groove lands on the back face and the sheet is cut from behind.

**Where the length is preserved.** With a near-through groove the hinge sits at
the outer surface, so the outer surface length is what survives folding. Panels
are therefore flattened from the outer surface, and the assembled outer
dimensions match the model. If a mesh represents the mid-surface instead, it is
offset outward by `t/2` during ingest. This is the foam counterpart of
bend allowance in sheet metal.

**Machines.** What varies between cutters is *how the wedge is removed*, not
what the wedge is, so `MachineProfile` is a separate type from `MaterialSpec`
and the same foam plan retargets freely.

A blade that tilts to `α/2` cuts the two walls directly, in two passes, and they
mate flush when the panel folds. That is the ideal case and the one the target
machine is built for. The tilt it needs is exactly half the groove angle, so a
±45° axis covers every fold down to a right angle; `requiredBladeTiltDeg()`
reports what a given model actually demands, which is a useful number when
specifying the hardware.

When the blade cannot reach `α/2` the two cuts never meet at the bottom — the
walls converge at `d·tan(tilt)` per side — so material bridges the groove and
the panel will not fold. Foldcraft detects this rather than emitting a groove
that quietly does not work. With depth control it clears the wedge with parallel
passes; without it, only the channel walls are cut and the waste is weeded by
hand, which is the ordinary Cricut foam workflow. Either fallback keeps the
opening width `w`, and **the opening is what sets the fold angle** — so the
assembled shape is still correct. Flush walls buy glue area and strength, not
accuracy.

Shallow folds above a configurable dihedral degrade to a plain score, because
foam simply bends.

Because a tilting knife's path carries a blade angle per segment, SVG cannot
express it — it is a 2D contour format. The tilting machine is therefore
targeted with G-code, while drag-knife machines keep SVG. A tangential knife
also has to be swivelled to face along the path; that is kinematics for the
post-processor, flagged by `requiresTangentialSwivel`, not something the groove
geometry needs to carry.

These are starting geometry, not machine settings. Foam compresses, blade depth
varies, and a test cut is still required — the same caveat the Fabrication
Studio materials table already carries.

### S7 — Joinery

Glue tabs as today, plus edge numbering so matching edges can be found during
assembly. Grooved edges that stay connected need no tab at all, which is a
direct benefit of §6 and cuts the tab count sharply versus the paper workflow.

### S8 — Pack and export

Nest panels onto sheets — the existing packer is sound and carries over, with
the sheet defaulting to the machine's bed rather than to paper sizes.

Export is per machine. **G-code** for the tilting ultrasonic cutter, carrying
per-segment blade tilt, depth, and swivel; **SVG** with separate layers for cut,
groove, score, and label for drag-knife machines; **DXF** where other cutting
software prefers it. `MachineProfile.output` selects which.

### S9 — Validate

The current confidence score reports 94% on output with half its fold
directions wrong, because it only measures coverage and edge-length
preservation — both of which stay perfect when the *sign* is wrong. The
replacement actually re-folds the net: it applies each fold at its recorded
angle and direction, reassembles the panels in 3D, and measures the deviation
from the source mesh. A flipped sign moves a panel to visibly the wrong place
and shows up immediately.

---

## 5. Public API

All types are JSON-serialisable. Every function is pure.

### Geometry

```ts
export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

/** Welded, outward-oriented mesh. `faces` index into `vertices`. */
export type FoldcraftMesh = {
    vertices: Vec3[];
    faces: number[][];
    unitsPerMm: number;
};
```

### S1 Ingest

```ts
export type IngestOptions = {
    weldToleranceRelative?: number;  // fraction of bbox diagonal, default 1e-5
    forceOutward?: boolean;          // default true
    midSurfaceThicknessMm?: number;  // offset outward by half this, if given
};

export type IngestReport = {
    mesh: FoldcraftMesh;
    weldedVertices: number;
    reorientedFaces: number;
    boundaryEdges: number;
    nonManifoldEdges: number;
    isClosed: boolean;
    isConsistentlyOriented: boolean;
    warnings: string[];
};

export function ingestMesh(source: ArrayBuffer | FoldcraftMesh, options?: IngestOptions): IngestReport;
```

### S2 Simplify

```ts
export type SimplifyMode = 'none' | 'decimate' | 'panelize' | 'voxelize';

export type SimplifyOptions = {
    mode: SimplifyMode;
    targetFaces?: number;            // decimate
    planarToleranceDeg?: number;     // panelize, default 8
    voxelResolution?: number;        // voxelize, divisions on longest axis
};

export type SimplifyReport = {
    mesh: FoldcraftMesh;
    sourceFaces: number;
    resultFaces: number;
    maxDeviationMm: number;
    planarityErrorDeg: number;
};

export function simplifyMesh(mesh: FoldcraftMesh, options: SimplifyOptions): SimplifyReport;
```

### S3 Surface regions

```ts
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

export function detectSurfaceRegions(
    mesh: FoldcraftMesh,
    options?: { fitToleranceMm?: number; minRegionFaces?: number },
): SurfaceRegion[];
```

### S4 Segment

```ts
export type SegmentOptions = {
    maxPanelWidthMm: number;
    maxPanelHeightMm: number;
    seamPreference?: 'fewest-seams' | 'hide-sharp-edges' | 'balanced';
    keepRegionsWhole?: boolean;      // default true — never split a detected cylinder
};

export type Patch = {
    id: number;
    faces: number[];
    seedFace: number;
    regionId: number;
    kind: SurfaceKind;
};

export function segmentIntoPatches(
    mesh: FoldcraftMesh,
    regions: SurfaceRegion[],
    options: SegmentOptions,
): Patch[];
```

### S5 Flatten

```ts
export type FoldDirection = 'mountain' | 'valley' | 'flat';

export type FlatInteriorEdge = {
    edgeKey: string;
    a: Vec2;
    b: Vec2;
    dihedralDeg: number;             // signed, from parent winding — never sorted keys
    direction: FoldDirection;
};

export type FlatPanel = {
    patchId: number;
    kind: SurfaceKind;
    outline: Vec2[];
    faces: Array<{ faceId: number; points: Vec2[] }>;
    interiorEdges: FlatInteriorEdge[];
    boundsMm: { minX: number; minY: number; maxX: number; maxY: number };
    mirrored: boolean;               // must be false; kept as an assertable invariant
    maxEdgeErrorPct: number;
    method: 'analytic' | 'rigid';
};

export function flattenPatch(mesh: FoldcraftMesh, patch: Patch, region: SurfaceRegion): FlatPanel;
```

### S6 Grooves

```ts
export type GrooveMethod = 'v-groove' | 'channel' | 'score' | 'through-cut';

export type MaterialSpec = {
    thicknessMm: number;
    hingeMm: number;                 // material left uncut at the hinge
    kerfMm: number;
    scoreOnlyAboveDeg: number;       // dihedral above which a score suffices, default 150
    throughCutBelowDeg: number;      // dihedral below which the edge is cut apart, default 40
};

export type GrooveSpec = {
    edgeKey: string;
    a: Vec2;
    b: Vec2;
    dihedralDeg: number;
    grooveAngleDeg: number;          // 180 - dihedral
    depthMm: number;
    widthMm: number;
    side: 'inside' | 'outside';
    method: GrooveMethod;
    /** Channel walls as cut geometry; empty for score. */
    outline: Vec2[];
};

export function planGrooves(panel: FlatPanel, material: MaterialSpec): GrooveSpec[];
```

### S7–S8 Joinery, packing, export

```ts
export type JoineryOptions = {
    tabDepthMm: number;
    tabsOnGroovedEdges?: boolean;    // default false — grooves self-align
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

export function planJoinery(panels: FlatPanel[], options: JoineryOptions): FlatPanel[];
export function packSheets(panels: FlatPanel[], sheet: SheetSpec): SheetLayout[];
export function exportSvg(panels: FlatPanel[], layout: SheetLayout, grooves: GrooveSpec[][]): string;
export function exportDxf(panels: FlatPanel[], layout: SheetLayout, grooves: GrooveSpec[][]): string;
```

### S9 Validate

```ts
export type FoldBackReport = {
    verdict: 'ok' | 'warn' | 'fail';
    refoldMaxErrorMm: number;
    refoldMeanErrorMm: number;
    foldSignConsistency: number;     // 1.0 = every fold agrees with the source dihedral
    mirroredPanels: number;
    overlappingPanels: number;
    unplacedFaces: number;
    issues: string[];
};

export function validateFoldPlan(mesh: FoldcraftMesh, plan: FoldPlan): FoldBackReport;
```

### Composed entry point

```ts
export type FoldPlanOptions = {
    simplify: SimplifyOptions;
    segment: SegmentOptions;
    material: MaterialSpec;
    joinery: JoineryOptions;
    sheet: SheetSpec;
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

export function buildFoldPlan(source: ArrayBuffer | FoldcraftMesh, options: FoldPlanOptions): FoldPlan;
```

---

## 6. MCP surface

The existing MCP server (`scripts/mcp-server.mjs`) is a thin stdio bridge: each
tool declares a zod `inputSchema`, calls a local HTTP route, and returns JSON.
Foldcraft follows that pattern exactly rather than inventing a second one.

Routes live under `src/app/api/fabrication/foldcraft/`:

| Route | Wraps |
| --- | --- |
| `POST /inspect` | `ingestMesh` — manifoldness report, no output geometry |
| `POST /plan` | `buildFoldPlan` — the whole pipeline |
| `POST /grooves` | `planGrooves` — groove table for a material, for previewing |
| `POST /validate` | `validateFoldPlan` |

A representative tool, in the shape the server already uses:

```js
registerTool('foldcraft_plan_unfold', {
    title: 'Unfold a 3D model into cuttable panels',
    annotations: WRITES,
    description:
        'Unfold a 3D model from the asset library into flat panels with fold grooves '
        + 'sized for a given material thickness. Returns panel and sheet counts plus a '
        + 'fold-back validation report. Use foldcraft_inspect_model first if the model '
        + 'may not be watertight.',
    inputSchema: {
        assetId: z.string().describe('3D model asset id from list_assets'),
        materialThicknessMm: z.number().min(0.1).max(50).default(6)
            .describe('Stock thickness, e.g. 6 for 6 mm EVA foam'),
        finishedSizeMm: z.number().min(10).max(2000).default(180)
            .describe('Longest dimension of the finished object'),
        simplifyMode: z.enum(['none', 'decimate', 'panelize', 'voxelize']).default('panelize')
            .describe('panelize gives genuinely flat panels; voxelize gives a blocky look'),
        targetFaces: z.number().int().min(4).max(2000).default(80),
        sheetWidthMm: z.number().default(210),
        sheetHeightMm: z.number().default(297),
    },
}, handler(async (args) => api('/api/fabrication/foldcraft/plan', {
    method: 'POST', body: JSON.stringify(args), timeoutMs: 120_000,
})));
```

Each stage function is independently wrappable on the same pattern, which is
what "MCP ready" means here: no stage takes a class instance, a callback, or a
handle to browser state, and every input and output survives `JSON.stringify`.

---

## 7. Package layout

```
packages/foldcraft/
  package.json              npm package "foldcraft", zero dependencies
  LICENSE.md                dual-licensing terms
  LICENSE-NONCOMMERCIAL.md  PolyForm Noncommercial 1.0.0 full text
  README.md                 standalone documentation
  jest.config.cjs           package tests run under their own config
  src/
    index.ts                public surface
    foldcraftTypes.ts       full API contract, machine + material presets
    meshTopology.ts         vectors, adjacency, signed dihedral
    loadModel.ts            GLB / STL / OBJ parsers, dependency-free
    ingest.ts               S1 weld, orient, repair
    planarize.ts            S2 regions, plane fit, vertex snap
    regionPolygons.ts       S2 outline tracing, flatness guarantee
    simplify.ts             S2 mode dispatch
    segment.ts              S4 flattest-edge-first growth into panels
    flattenRigid.ts         S5 corrected unfolding (+ shared helpers)
    grooves.ts              S6 groove geometry and pass planning
    packSheets.ts           S8 shelf nesting with rotation
    exportSvg.ts            S8 layered SVG with fiducials
    validate.ts             S9 fold-sign / coverage / mirror / overlap
    buildFoldPlan.ts        composed pipeline, owns unit scaling
    machine/
      toolpath.ts           IR with explicit depth / tilt / swivel
      gcode.ts              grblHAL post-processor
      simulator.ts          physical-limit checks on the same IR
      registration.ts       overhead-camera homography
  __tests__/                83 tests, fixtures built in memory
```

Every module is pure — no three.js, no DOM, no filesystem — so the package
runs identically in the browser, Node, and workers, and the whole pipeline is
testable on synthetic meshes.

Every module stays under the 500-line budget enforced by
`scripts/file-size-ratchet.mjs`. Nothing here imports React, Fabric, or Next —
the library is pure and the UI layer adapts it, so the same code serves the
renderer, the HTTP routes, and the tests.

---

## 8. Implementation roadmap

Ordered so the highest-value fix lands first and every phase is provable on its
own. Each phase is a separate change with its own tests.

| # | Phase | Proves it works | Replaces |
| --- | --- | --- | --- |
| 0 | ✅ Types + this doc | Full API surface compiles; every type JSON round-trips | — |
| 1 | ✅ **S1 ingest** | Split-vertex cube welds 24→8 into a closed manifold; inverted and scrambled cubes come back outward | `meshExtraction` loading |
| 2 | ✅ **S5 fold-sign + mirror fix** | Cube/tetra/icosa/hemisphere/cylinder: every fold convex and identical; `mirrored === false`; cube folds exactly 90° | `unfoldMesh` core defects |
| 3 | ✅ **S2 panelize** | Triangulated cube merges back to 6 squares; every face flat to 0.05° at every tolerance from 3° to 45°; surface never moves more than 15% | Vertex-cluster simplify |
| 4 | ✅ **S6 grooves** | α + θ = 180° for every fold; widths match the worked table; a valley cuts from the opposite face; too little blade tilt warns instead of under-cutting | Nothing — new |
| 5 | ✅ **S4 segmentation** | Cube unfolds to 1 panel, icosahedron to 1; every face on exactly one panel at every sheet size | Greedy BFS |
| 6 | ✅ **Model loading** | GLB (indices, node transforms), binary + ASCII STL, OBJ quads — all dependency-free, fixtures built byte-by-byte in tests | three.js GLTFLoader |
| 7 | ✅ **S9 validation** | A deliberately flipped fold sign is caught and the verdict fails; so are missing faces | Confidence score |
| 8 | ✅ **S8 export + machine layer** | Layered SVG with fiducials; grblHAL G-code with tilt on A, swivel on C; simulator rejects bed/tilt/depth violations and buried-blade rotation | `papercraftPlan` SVG |
| 9 | ✅ **Composed pipeline** | `buildFoldPlan`: cube and hemisphere go from mesh to validated sheets, SVG, and G-code with `verdict: ok` | — |
| 10 | **S3 analytic unroll** | A cylinder gives 1 panel of width 2πr to 0.1%; a can gives exactly 3 panels | faceted fallback for developables |
| 11 | **S2 voxelize + decimate** | Orthogonal-polyhedron mode; edge-collapse for very dense input | — |
| 12 | **HTTP routes + MCP tools** | Tools callable end to end over stdio | — |
| 13 | ◐ **UI integration** | ✅ One-click **Cut from foam** on the model context menu (`src/lib/foamcut`, `useFoamCut`): downloads SVG + G-code, only when validation and simulation pass, in 11 languages. Remaining: switch the paper Unfold path over and retire nothing — papercraft stays as reference by decision. | adds to `usePapercraftUnfold` |

**The library now lives at [`packages/foldcraft`](../packages/foldcraft/README.md)**
as a standalone, dependency-free package (dual-licensed: PolyForm Noncommercial
free, commercial paid — see its LICENSE.md). The machine it targets is designed
in [FOLDCRAFT_MACHINE.md](FOLDCRAFT_MACHINE.md). 83 tests:
`npx jest --config packages/foldcraft/jest.config.cjs`.

Phase 2 is the one that makes existing output correct. Phase 4 is the one that
makes a hat and a can come out as clean pieces instead of triangle soup.

### Verifying what is built

44 tests across `foldcraftGeometry.test.ts` and `foldcraftPlanarize.test.ts`:

```bash
npx jest src/lib/foldcraft
```

The phase 2 fixes were confirmed by mutation, not just by passing. Reinstating
the sorted-key edge direction fails 14 of the geometry tests; reinstating the
fixed seed winding fails exactly the four mirroring tests. A suite that keeps
passing when the bug is put back would not be evidence of anything.

Two problems in phase 3 were found by testing rather than by reading, and both
are worth knowing about:

**Region growth drifts.** Admitting a face when its normal is within tolerance
of the region's *running average* lets the average creep, and on a sphere a
region walks right around the surface. Regions are now capped against the seed
normal as well, bounding the total span.

**The vertex snap can throw a vertex.** Two regions whose planes are nearly
parallel meet along a barely-determined line, and least squares will travel any
distance to satisfy both — it produced a 37% shape deviation at one tolerance
with far smaller values either side. Displacement is now capped at the length of
the edges meeting at that vertex.

Neither is fully solvable by tuning, because greedy region growth can produce a
region set that genuinely cannot be flattened. So flatness is guaranteed
structurally instead: any panel still out of true after planarisation is split
into triangles, which are planar by definition. The test asserts this across
tolerances from 3° to 45°, and the report says how many panels had to be split.

---

## 9. Migration

`src/lib/papercraft/` stays until phase 10. It is still the code path behind
right-click → Unfold, and removing it before Foldcraft reaches parity would
regress a shipped feature.

At phase 10, `usePapercraftUnfold` switches to `buildFoldPlan`. Whether
papercraft is deleted or kept as a paper-specific preset is an open question
below — a paper workflow wants score lines and glue tabs, which Foldcraft
expresses as a material with `thicknessMm: 0.25` and `scoreOnlyAboveDeg: 0`, so
one library plausibly covers both.

---

## 10. Settled decisions

Answered 2026-08-18. These are now design constraints, not open questions.

**The workflow being served.** A maker has a real object — an armour plate —
models it in 3D, and wants it rebuilt in foam. Foldcraft takes that model, makes
it faceted rather than round, and flattens it. **The outside is what has to look
right.** That priority decides several things at once:

- Models represent the **outer surface**. No mid-surface offset by default;
  `midSurfaceThicknessMm` stays available for meshes authored the other way.
  Flattening preserves outer-surface lengths, so the finished silhouette matches.
- Planarisation is judged by **outward deviation**, and `panelize` reports how
  far it moved the surface so the maker can trade panel count against fidelity.
- Grooves are cut on the inside wherever possible, leaving the outer face
  unbroken — better appearance and a stronger hinge.

**Grooves are per-edge, not a global setting.** Each edge's groove angle is
derived from that edge's own fold angle. Where the geometry needs it, a groove
is cut from **both faces** of the sheet, each pass at the machine's preset blade
angle, so the two passes together open the angle the fold actually requires.
`GrooveSpec` therefore carries a list of **passes** rather than one profile —
that also covers the mixed-direction case, where mountain folds are relieved
from the inside and valley folds from the outside, and the sheet is flipped
between passes against registration marks.

This keeps one spec valid across very different machines: a Cricut blade cannot
tilt at all and realises a groove as a perpendicular-walled channel of the
computed width, while the five-axis foam cutter in the CNC inventory can tilt
and cuts the true V.

**Tabs only on cut seams**, never on grooved folds — a grooved fold stays
attached and self-aligns.

**`src/lib/papercraft/` is kept**, not deleted, as a reference implementation to
check new output against.

### The target machine

An open-source build: a 600 × 600 mm laser-cutter frame carrying an ultrasonic
blade whose angle is set under program control. Foldcraft is written against
this rather than against any commercial cutter, and `MachineProfile` exists so
that stays true as the build changes.

Two numbers in `ULTRASONIC_TILT_MACHINE` are placeholders until the machine is
real: **blade tilt range** (assumed ±45°, which covers every fold down to a
right angle) and **kerf** (assumed 0.3 mm). Both are one-line edits, and
`requiredBladeTiltDeg()` reports what a given model would demand, so the tilt
axis can be specified from actual work rather than guessed.

### Settled since

- **G-code dialect: grblHAL** (Teensy 4.1 breakout as reference controller),
  conservative RS274 so LinuxCNC accepts the same files. Tilt on A, tangential
  swivel on C. See [FOLDCRAFT_MACHINE.md](FOLDCRAFT_MACHINE.md).
- **Licensing: dual.** PolyForm Noncommercial 1.0.0 free; commercial use paid.
- **Name: Foldcraft**, now also the npm package name.
