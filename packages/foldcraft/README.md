# Foldcraft

**Unfold 3D models into flat panels with machine-ready fold grooves.**

Foldcraft takes a model of a helmet, an armour plate, a hat — anything a maker
wants to rebuild from sheet material — converts it to genuinely flat low-poly
panels, unfolds them with *correct* mountain/valley fold directions, computes
the V-groove each fold needs for a given material thickness, packs panels onto
sheets, and emits SVG and five-axis G-code. A built-in simulator verifies every
toolpath against the machine's physical limits before anything touches foam.

Zero runtime dependencies. Pure TypeScript. Every stage is a pure function over
JSON-serialisable types, so any stage can be wrapped as an HTTP route, an MCP
tool, or a CLI without adaptation.

```
model bytes (GLB / STL / OBJ)
   │  loadModel        parse, world transforms, units
   ▼
FoldcraftMesh
   │  ingestMesh       weld vertices, orient outward, repair, report
   │  panelizeMesh     low-poly: flat panels within a tolerance you choose
   │  segmentIntoPanels  cut at sharp edges, fold at flat ones
   │  planGrooves      per-fold V-groove: angle, depth, width, face, passes
   │  packSheets       nest panels onto the machine bed
   ▼
exportSheetSvg → SVG with cut / groove / score / label / registration layers
buildSheetToolpath → toGcode → grblHAL five-axis G-code
simulateToolpath → violations report before you cut
validateFoldPlan → fold-sign, coverage, mirroring, overlap checks
```

## Quick start

```ts
import { buildFoldPlan } from 'foldcraft';
import { readFileSync, writeFileSync } from 'node:fs';

const result = buildFoldPlan(readFileSync('helmet.glb'), {
    finishedSizeMm: 260,      // longest dimension of the finished piece
    planarToleranceDeg: 14,   // low-poly dial: higher = fewer, larger panels
});

console.log(result.stats);
// { panelCount: 4, foldCount: 31, seamCount: 6, sheetCount: 1,
//   trueVeeCount: 31, ... }

console.log(result.validation.verdict);       // 'ok' — or why not
result.svgs.forEach((svg, i) => writeFileSync(`sheet-${i + 1}.svg`, svg));
result.gcode.forEach((nc, i) => writeFileSync(`sheet-${i + 1}.nc`, nc));
```

Every stage is also callable on its own — see the API tour below.

## Why this exists

Existing options fall into two camps. Commercial papercraft tools (Pepakura)
target paper: score lines work at any angle when material has no thickness.
Open-source unfolds (Blender's paper-model add-on) are the same idea inside a
DCC app. **Foam is different.** It is thick, so folding it to a chosen angle
requires removing a wedge of material — and the wedge geometry, which face it
is cut from, and whether a given machine can physically cut it are exactly the
parts papercraft tools do not model. Foldcraft models them.

It also fixes correctness failures we measured in a typical hand-rolled
unfolder (the one this library replaces):

| Defect | Old behaviour | Foldcraft |
| --- | --- | --- |
| Fold direction | 6 of a cube's 12 identical folds labelled backwards | sign derived from face winding; property-tested on convex solids |
| Mirroring | each island a coin-flip mirror image | seed frame matched to the outward normal; asserted never |
| Fragmentation | 70-face hemisphere → 11 islands | cuts land on sharp edges; cube → 1 panel, icosahedron → 1 panel |
| Validation | 94% "confidence" on broken output | flipped fold sign = hard `fail` |

## The groove maths

For stock thickness `t`, uncut hinge `h`, and target dihedral `θ` (angle
between panels in the finished object, 180° = flat):

```
groove angle   α = |180° − θ|      the notch closes exactly at this rotation
depth          d = t − h
opening width  w = 2·d·tan(α/2)
face           inside for θ < 180° (mountain), outside for θ > 180° (valley)
```

6 mm EVA foam, 0.5 mm hinge:

| Fold θ | Groove α | Width w |
| --- | --- | --- |
| 90° | 90° | 11.0 mm |
| 120° | 60° | 6.4 mm |
| 150° | 30° | 2.9 mm |

An 11 mm channel is a real fraction of a panel — which is why groove geometry
cannot be an afterthought bolted onto a paper unfolder.

**Machines.** A blade that tilts to `α/2` cuts the two groove walls directly
and they mate flush when folded (`method: 'v-groove'`, two passes). A blade
that cannot tilt far enough gets the same opening width as a channel — the
opening is what sets the fold angle, so the assembled shape stays correct;
flush walls buy glue strength, not accuracy. Too-sharp folds become
through-cuts; near-flat folds become scores. `requiredBladeTiltDeg()` reports
the tilt range a model demands, useful when specifying hardware.

## Machine layer

`MachineProfile` describes what a cutter can do — bed size, blade tilt range,
depth control, tangential swivel, output format. Two presets ship:

- `ULTRASONIC_TILT_MACHINE` — the reference build: 600 × 600 mm frame,
  ultrasonic knife on a programmable tilt axis, grblHAL G-code out.
- `CRICUT_MAKER_MACHINE` — a drag knife that cannot tilt; grooves fall back to
  weeded channels, output is SVG.

The toolpath IR carries explicit blade state (depth Z, tilt A, swivel C) so a
post-processor only translates, never decides. The **simulator executes the
same IR the G-code post consumes** and reports bed overruns, tilt beyond the
axis, cuts deeper than the stock, and rotation of a buried blade — the mistake
that snaps ultrasonic blades. It caught a real one during development: the
outline planner originally swivelled at corners while buried; the corner-lift
behaviour it has now exists because the simulator rejected the first version.

Safety ordering is built in: grooves and scores cut first while every panel is
still anchored by the surrounding sheet; through-cut outlines run last.

**Camera registration** (`machine/registration.ts`): every sheet carries four
corner fiducials. Locate them in an overhead-camera frame, and
`homographyFromPairs` maps camera pixels to bed millimetres — find a sheet
placed by hand, re-find it after flipping for second-face passes, detect
mid-job shift. A homography, not an affine fit, because a bracket-mounted
camera is never perfectly perpendicular.

## API tour

| Function | In → Out | Stage |
| --- | --- | --- |
| `loadModel(bytes)` | GLB/STL/OBJ → `FoldcraftMesh` | parse |
| `ingestMesh(mesh)` | mesh → welded, outward-oriented mesh + report | S1 |
| `panelizeMesh(mesh, tolDeg)` | mesh → flat-panel low-poly + fidelity report | S2 |
| `segmentIntoPanels(mesh, opts)` | mesh → `FlatPanel[]` (cuts at sharp edges) | S4 |
| `flattenPatchRigid(mesh, patch)` | one patch → one panel | S5 |
| `planGrooves(panel, material, machine)` | panel → `GrooveSpec[]` + warnings | S6 |
| `packSheets(panels, sheet)` | panels → `SheetLayout[]` | S8 |
| `exportSheetSvg(panels, grooves, layout)` | → layered SVG string | S8 |
| `buildSheetToolpath(...)` | → `Toolpath` IR | machine |
| `toGcode(toolpath, machine)` | → grblHAL G-code string | machine |
| `simulateToolpath(toolpath, machine, opts)` | → violations + stats | machine |
| `validateFoldPlan(mesh, panels)` | → verdict + issues | S9 |
| `buildFoldPlan(bytes, opts)` | everything above, composed | pipeline |
| `meshPreviewSvg(mesh)` | mesh → shaded isometric SVG thumbnail | preview |
| `panelsPreviewSvg(panels)` | panels → flat-piece SVG thumbnail | preview |

All inputs and outputs are plain JSON-serialisable data. To expose a stage as
an MCP tool, wrap it in a zod schema and a handler; nothing needs adapting.

### Watching the pipeline run

`buildFoldPlan` accepts `onProgress`, called with a `FoldProgressEvent` as
each user-facing stage starts and finishes: `load`, `lowpoly`, `unfold`,
`grooves`, `layout`, `verify` (the ordered list is exported as
`FOLD_PROGRESS_STAGES`). A `done` event carries headline `stats` for the
stage, and the visual stages also carry `previewSvg` — a self-contained SVG
thumbnail (the model as read, the faceted low-poly result, the unfolded flat
pieces, the first packed sheet). Previews are only rendered when a listener
is attached, so the pipeline costs nothing extra without one.

The listener is a function, so it cannot cross a worker boundary; hosts that
run the pipeline in a worker forward the events over `postMessage` instead
(that is exactly what Image Express's foam-cut worker does).

```ts
buildFoldPlan(bytes, {
    onProgress: (e) => {
        if (e.status === 'done') console.log(e.stage, e.stats);
    },
});
```

### Conventions that everything relies on

- **Dihedral angles** are measured through the material, seen from outside:
  180° flat, < 180° convex (mountain), > 180° reflex (valley).
- **Meshes are outward-wound** after `ingestMesh` — counter-clockwise seen
  from outside. Every fold sign depends on this; run ingest first, always.
- **Models represent the outer surface**, which is what must look right.
  Mid-surface meshes: pass `midSurfaceThicknessMm` to ingest.
- **Toolpath Z** is 0 at the stock surface, negative into the stock.

## Testing

111 tests, run with `npx jest --config packages/foldcraft/jest.config.cjs` from
the repo root. The correctness-critical properties are tested as *properties*
(every fold on a convex solid has the same direction; every face lands on
exactly one panel; groove angle + dihedral = 180°; **the overlap test gives
the same verdict at every scale**) and the historic bugs are pinned by
mutation: reintroducing any of them makes multiple tests fail.

One property is worth calling out because it is not obvious. Overlap is
judged twice — by segmentation in model units, and by validation after the
panels are scaled to finished millimetres. A tolerance that is absolute
rather than relative makes those two answers differ, and the stages then
contradict each other: segmentation grows a panel that validation condemns.
A real 280 mm model hit exactly this, over an interpenetration of 1.7e-7 mm
at a shared corner.

## Status and roadmap

Implemented: load (GLB/STL/OBJ) · ingest · panelize · segment · rigid flatten ·
grooves · pack · SVG · toolpath/G-code · simulator · registration · validation
· composed pipeline.

Planned: analytic surface detection (a cylinder should unroll to one exact
rectangle, not facets) · voxelize mode · decimate mode for very dense meshes ·
DXF export · nesting beyond shelf packing.

## License

Dual-licensed: **free for noncommercial use** under the
[PolyForm Noncommercial License 1.0.0](LICENSE-NONCOMMERCIAL.md); **commercial
use requires a paid license** — contact geekatplay@gmail.com. Details in
[LICENSE.md](LICENSE.md).
