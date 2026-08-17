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

## One-click origami unfold

For a model that is already on the canvas, the complete fast path is:

1. Right-click the 3D model.
2. Choose **Unfold**.

No export dialog or material setup is required. Image Express automatically
simplifies dense meshes to a practical paper-model face count, unfolds adjacent
triangles without face overlap, splits the result into islands when necessary,
packs those islands onto A4 sheets, and places the editable vector result on the
current canvas. Solid black lines are cuts, dashed blue lines are folds, dotted
violet lines mark glue-tab folds, and face numbers help assembly. The generated
SVG geometry uses millimetre dimensions.

Before packing, a local classical-AI planner evaluates eight candidate unfold
orders. It prefers fewer islands and seams, then lower bounding-box waste. A
fold-back predictor compares the selected net with the source 3D mesh using
surface coverage, edge-length preservation, face-area preservation, topology,
watertightness, and generated mountain/valley fold angles. The completion notice
reports the resulting fold-back confidence, and the SVG stores the confidence,
strategy, fold direction, and target angle as machine-readable attributes.
This is deterministic local search—not a hidden cloud model—so it needs no API
key, account, prompt, or additional model download.

The zero-setup defaults are an 80-face working mesh, 180 mm finished model size,
210 × 297 mm sheets, 10 mm margins, and 5 mm glue tabs. These defaults are
automatic; Cricut Studio remains available when exact stock, scale, slicing,
registration, or nesting controls are needed.

Unfold works best with closed, manifold GLB/GLTF models. Curved or very dense
surfaces become a low-poly triangular paper model, so this is an origami-style
approximation rather than stretchable-surface flattening. Open, degenerate, or
disconnected meshes may create extra islands, and invalid triangle geometry
reports a concise error instead of producing an unsafe cut sheet.

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
- `src/lib/papercraft/` — mesh simplification, overlap-safe unfolding, sheet
  packing, multi-candidate planning, 3D fold-back prediction, glue tabs, and
  dimensioned SVG serialization.

All new production modules are kept below 500 lines. Focused tests cover the
registry, right-click and circular navigation, inventory persistence/CSV, modal
behavior, tracing, layered planning, nesting, and SVG output.
Papercraft coverage additionally verifies fold topology, tabs, physical SVG
dimensions, pointer-targeted context menus, and the dedicated one-click action.
