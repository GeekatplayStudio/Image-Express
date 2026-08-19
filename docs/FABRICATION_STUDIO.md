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

## Code ownership

- `src/components/toolbar/toolRegistry.ts` — shared tool and group definitions.
- `src/components/fabrication/FabricationLibraryModal.tsx` — library/planner UI.
- `src/features/fabrication/domain/` — workflow, material, and BOM data.
- `src/features/fabrication/application/inventoryState.ts` — persistence and CSV.
- `src/lib/cricut/` — tracing, slicing, nesting, and SVG serialization.
- `src/lib/foamcut/` + `packages/foldcraft/` — the low-poly unfold pipeline:
  faceting, segmentation, groove planning, sheet packing, G-code, simulation,
  validation, and stage-progress previews.

All new production modules are kept below 500 lines. Focused tests cover the
registry, right-click and circular navigation, inventory persistence/CSV, modal
behavior, tracing, layered planning, nesting, and SVG output. Foldcraft carries
its own 93-test suite covering fold correctness, grooves, machine simulation,
and the progress previews.
