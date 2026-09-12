# Fabrication Studio

Fabrication Studio is the unified entry point for Image Express workflows that
turn digital artwork and 3D assets into physical parts. It combines the former
standalone 3D tool with model access, Cricut preparation, material guidance,
and CNC planning without duplicating the underlying editors.

## Opening the studio

- Click **Fabrication** on the left tool rail to open the workflow library.
- Right-click the same tool to choose **Generate & edit 3D**, **3D Model
  Library**, **Cricut Studio**, or **CNC Planner** directly.
- Right-click an empty part of the workspace and choose **Fabrication Studio**
  from the circular tool selector.
- The compact Tools menu exposes the same unified entry point.

The preferred subtool is remembered for the current toolbar session. Existing
3D generation and editing behavior is unchanged; only its navigation is now
grouped with related fabrication workflows.

## One-click low-poly unfold

For a model that is already on the canvas, the complete fast path is:

1. Right-click the 3D model.
2. Choose **Low-poly unfold**.

It runs the Foldcraft pipeline ([FOLDCRAFT.md](FOLDCRAFT.md)): the model is
faceted into genuinely flat panels, segmented with cuts on sharp edges, given
per-fold V-grooves sized for 6 mm EVA foam at costume scale (280 mm), packed
onto 600 × 600 mm sheets, simulated against the reference ultrasonic cutter,
and validated. The press downloads one SVG and one G-code file per sheet and
places a preview on the canvas. Files are only produced when validation and
simulation pass — a failing plan explains itself instead of exporting.

While the pipeline runs, a step monitor docked at the bottom of the editor
shows all six stages — read model, convert to low poly, unfold flat, plan
fold grooves, lay out sheets, check the plan — with live numbers per stage
and thumbnails of the model as read, the faceted low-poly conversion, and
the unfolded flat pieces. Dense generated meshes are decimated and panelled
automatically; the monitor reports what was done.

The earlier paper **Unfold** action was removed on 2026-08-18: it produced
incorrect nets and Foldcraft supersedes it.

## Libraries

The Workflows tab routes to the existing 3D generator, the Asset Vault filtered
to 3D models, the Cricut export workspace, or the CNC planner. The Materials tab
contains starter presets for cardstock, vinyl, chipboard, EVA, EPS, XPS, EPP,
and polyurethane foam. These values are starting points, not machine settings:
always run a test cut against the actual stock and tool.

## Five-axis CNC foam-cutter inventory

The CNC Hardware tab records the concept-level bill of materials for a
cantilever five-axis oscillating-knife foam cutter:

- 80 × 160 mm cantilever beam and 20-series stationary-bed extrusion;
- X/Y profile rails, carriages, timing belts, pulleys, and a T8 Z lead screw;
- NEMA 23/17 linear-axis motors and two compact geared rotary-axis actuators;
- guarded oscillating-knife drive, eccentric cam, rotary bearings, retract
  mechanism, and foam-cutting blades;
- five-axis LinuxCNC- or GRBLHAL-compatible control, matched drivers, 24/48 V
  supply, shielded flexible cable, limits, emergency stop, probe, and drag chain;
- M3/M4/M5 fasteners, T-nuts, brackets, joining plates, and leveling feet.

Search by component or specification, filter by subsystem and axis, and record
acquired quantities. Progress is saved locally in the browser under
`image-express-cnc-foam-cutter-inventory-v1`. **Export CSV** produces a portable
procurement checklist with required/acquired counts and safety-critical flags.

This inventory is not a certified machine design. Beam deflection, drive torque,
blade dynamics, guarding, electrical protection, emergency-stop category, fire
and dust controls, and applicable local regulations require qualified engineering
review before construction or operation.

## Cricut workflow

Cricut Studio captures the active artboard and opens the same dimensionally
accurate export pipeline available from Export → Cricut. It performs monochrome
thresholding, closed-contour tracing, node simplification, rotation-aware sheet
nesting, stacked-profile planning from target depth and stock thickness, and
registration-mark generation. See [CRICUT_EXPORT.md](CRICUT_EXPORT.md) for file
format details and current geometry limitations.

## 3D Stamp Studio

3D Stamp Studio turns artwork into a printable press stamp or wax seal: an
extruded relief die, a backing podium, and a turned handle, exported as a
single solid for slicing.

Open it from the **Fabrication** tool group (the **3D Stamp** entry in the
workflow library, or `3d-stamp` on the tool rail). If the canvas has visible
layers they are captured and loaded as the artwork automatically; otherwise the
studio starts in text mode.

### Artwork to relief

Artwork arrives as text, an uploaded image, a preset, or a capture of the
current canvas, and is rasterised to a heightmap that drives the extrusion:

1. Text is typeset straight or along a circular arc. Arc text advances each
   glyph by its own measured width, so letter spacing stays even regardless of
   the string.
2. Photoshop-style **Levels** (black point, white point, gamma), optional
   bit-depth quantisation, and thresholding map luminance to relief height.
3. A signed-distance-field pass de-speckles the mask and reconstructs smooth
   vector contours, removing the staircase artefacts a raw threshold leaves on
   diagonals and curves.
4. Borders are composited on top, and the heightmap is mirrored so the physical
   impression reads the right way round.

### Structure

| Part | Occupies | Notes |
| --- | --- | --- |
| Die | `y = 0` down to `-(baseplate + relief)` | Backplate at `y = 0`, artwork extruded downwards |
| Podium | `y = 0` to `y = podiumThickness` | Chamfered top and bottom; rectangular podiums carry a tactile orientation notch |
| Handle | `y = podiumThickness` upwards | Eight styles, five of them lathe-turned profiles |

Rectangular dies are built on a Cartesian grid; circular and oval dies are built
on a polar grid so the die outline is a true ellipse matching the podium rather
than a slab whose corners jut out from underneath it. Both keep the flat
backplate as a centre fan — it is a plane, so tessellating it at die-face
density would double the triangle count for no detail.

### Why the letterforms come out clean

Edge quality is set by *where the distance to the artwork edge is measured*, not
by how much the mask is smoothed afterwards:

- **The distance field is computed on the artwork raster, then sampled onto the
  extrusion grid.** Thresholding onto the coarse grid first discards the
  sub-pixel edge position, and nothing downstream can recover it — that is what
  produced stair-stepped outlines. A distance field is smooth and band-limited,
  so it is the thing that downsamples cleanly.
- **The transform is exact, not a chamfer approximation.** A two-pass 3-4
  chamfer sweep is anisotropic: its level sets are octagons, so every curve and
  diagonal picked up faint faceting. The builder uses the linear-time
  Felzenszwalb–Huttenlocher squared-distance transform, run down the columns and
  then across the rows, which is exactly Euclidean.
- **Anti-aliased coverage refines the edge.** Where a sample sits inside the
  transition band, its coverage locates the crossing to a fraction of a pixel —
  far better than the half-pixel guess a binary threshold allows.
- **The tapered wall spans several grid cells.** Cell size is derived from the
  draft run (`reliefDepth × tan(draft)`), because a wall resolved by a single row
  of vertices renders as a staircase no matter how accurate the field is: there
  is nothing between "floor" and "plateau" for the surface to interpolate
  through. A triangle ceiling bounds this so a large die stays sliceable and
  still rebuilds while a slider is being dragged.
- **Vertex colours are interpolated, not bucketed.** Three flat tones quantised
  the letter edges to the grid in the preview: the geometry could be perfectly
  smooth and the artwork would still read as blocky, because the colour boundary
  jumped a whole cell.

### Draft angle

The **Draft Angle** control tapers the relief sidewalls so the stamp releases
cleanly from ink, rubber, and hot wax. It is applied through the distance field:
a point whose signed distance to the artwork edge is `s` mm stays solid down to

```
h = clamp(1 + s / (reliefDepth * tan(draft)), 0, 1)
```

which is exactly the surface swept by a wall leaning back at `draft` degrees
from the contact plateau. At 0° the ramp falls back to a sub-cell width so edges
stay anti-aliased instead of stepped.

### Printable-solid guarantees

Every part is generated as a closed shell wound counter-clockwise as seen from
outside. Orientation is checked as well as closure: a consistently inside-out
shell passes every edge-count test, yet renders hollow in the viewport and is
rejected by slicers. The viewport status bar reports the measured result —
**Watertight** or **Check Mesh** — alongside the modelled height (taken from the
assembled mesh, not summed from the sliders, since some handle styles clamp
their own height) and the solid volume as a material estimate.

### Export

STL (binary or ASCII), OBJ, and GLB, for the complete assembly, the die plate
without the handle, or the handle alone. Binary STL is the slicer default.

## Code ownership

- `src/components/toolbar/toolRegistry.ts` — shared tool and group definitions.
- `src/components/fabrication/FabricationLibraryModal.tsx` — library/planner UI.
- `src/features/fabrication/domain/` — workflow, material, and BOM data.
- `src/features/fabrication/application/inventoryState.ts` — persistence and CSV.
- `src/lib/cricut/` — tracing, slicing, nesting, and SVG serialization.
- `src/lib/foamcut/` + `packages/foldcraft/` — the low-poly unfold pipeline:
  faceting, segmentation, groove planning, sheet packing, G-code, simulation,
  validation, and stage-progress previews.
- `src/features/fabrication/stamp/domain/` — stamp relief extrusion, podium and
  handle geometry, mesh-integrity checks, assembly, and exporters.
- `src/features/fabrication/stamp/ui/` — the studio modal, artwork rasteriser,
  3D viewport, and press/impression previews.

All new production modules are kept below 500 lines. Focused tests cover the
registry, right-click and circular navigation, inventory persistence/CSV, modal
behavior, tracing, layered planning, nesting, and SVG output. Foldcraft carries
its own 93-test suite covering fold correctness, grooves, machine simulation,
and the progress previews. 3D Stamp Studio is covered by 73 tests spanning
draft-angle geometry, contact-plateau flatness, heightmap sampling, mesh
watertightness and outward orientation, and STL/OBJ export validity.
