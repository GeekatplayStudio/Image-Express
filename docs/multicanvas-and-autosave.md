# Multi-Canvas Projects, 3D Stack View & Autosave

> **Terminology note:** the code names below predate our canonical vocabulary
> ([GLOSSARY.md](GLOSSARY.md)). In canonical terms this hierarchy is
> **Library → Album → Page**: a code *Project* is an **Album**, a code *Canvas*
> is a **Page**, and the *Federation* level is the **Library**. The code names
> are kept in this document because they match the identifiers in
> `lib/multicanvas/projectStore.ts`.

## Concepts

The code hierarchy is **Projects → Canvases → Layers** (canonical: **Album →
Page → Layers**):

- **Projects** is the whole local workspace: every project you have. In the
  3D view, zooming all the way out (or the **Projects** button) shows each
  project as a wireframe cube with its canvases as glass slices; projects
  that share linked layers are connected by glowing channels. Arrow keys
  move between cubes, Enter/double-click dives into a project's stack.
- A **Project** holds any number of canvases. All projects are persisted
  locally (`image-express-projects` in localStorage; the older single-project
  storage migrates automatically). Starting a new design creates its own
  project — unless the current project is still empty (untouched), in which
  case it's reused instead of piling up blank projects.
- Each **Canvas** is a full artboard with its own layer stack. Only the active
  canvas lives inside the Fabric editor; the rest are kept as serialized
  snapshots.
- **Layers** can be marked *shared*. Sharing broadcasts a linked copy into
  every other canvas of the project, and shared layers can also be linked
  across OTHER projects: adjustment and appearance changes (adjustment
  settings, filters, opacity, visibility, fill) propagate to every instance
  with the same `sharedLayerId` anywhere in the workspace. Geometry
  (position/scale) stays per-canvas. Duplicating a shared layer keeps the
  link, so copies stay synchronized.

## Using it

- **Canvas bar** (above the workspace): a dropdown lists all canvases with
  the newest on top — pick one to open it. `+` creates a new canvas,
  **Stack** opens the 3D stack view, **Share** toggles sharing for the
  selected layer.
- **3D Stack view**: every canvas renders as a plane in a 3D stack
  (adapted from the LogiTensor dimension-stack viewer). Each plane shows the
  canvas's actual rendered content (an artboard thumbnail captured on every
  snapshot). The selected canvas slides out of the stack and renders fully;
  the rest render in x-ray. Layers within a canvas are chained by dashed
  in-plane links in stacking order, and shared layers are connected by
  animated node-style paths between planes (documents).
  - Drag to orbit, Shift+drag to pan, scroll to zoom.
  - ↑/↓ (or ←/→) move the selection between canvases, Enter opens the
    selected canvas, Esc closes the view.
  - Click a plane to select it; double-click (or **Open**) to load it in the
    editor. Rename/duplicate/delete/add from the control strip.

## Shared-layer indicators & dashboard

- Shared layers show a **link badge** at their top-left corner on the canvas
  and a teal share icon in the Layers panel row.
- Clicking **Share** with multiple canvases asks whether to add the linked
  layer to every canvas; declining still marks it shared without copies.
- The **Dashboard** lists every project in the workspace (thumbnail from
  its first canvas). Clicking one opens it in the editor with its content
  restored; every new design started from the dashboard becomes its own
  project automatically.
- Snapshots inline `blob:` image sources as data URLs so images added from
  the asset library survive canvas switches and reloads (capped to 2048px
  for uncropped images to keep localStorage usage bounded), and each
  snapshot refreshes the stored canvas width/height so 3D plane ratios stay
  correct after artboard resizes.
- **Share with other projects** (globe icon next to Share, canvas tabs bar):
  pick which other projects should also link to the selected layer. Linked
  copies land in each target project's active canvas and stay synchronized
  the same way as same-project sharing.
- If localStorage fills up, saves fall back to dropping thumbnails (they're
  regenerable) before giving up; a one-time toast warns if a save still
  can't be persisted so work isn't silently lost.
- Starting a new design from the Dashboard reuses the current project if
  it's still empty (no layers drawn yet) instead of creating a fresh one on
  every click — prevents blank projects from piling up.

## File menu

`File → Open...` lists your saved designs (same source as the Dashboard) and
loads one directly into the current editor. `File → Recent Files` is a quick
submenu of your 5 most recently modified designs.

## Autosave

`File → Autosave` toggles automatic saving. When enabled, dirty work is saved
~5 s after the last change using the normal save pipeline (server save +
optional Google Drive backup). Autosave never opens dialogs, so it only kicks
in after the design has been named/saved once. The preference persists in
`image-express-ui-preferences`.

## Canvas placement stability

New layers (shapes, text, images, 3D placeholders, generated results) are
placed at the **center of the currently visible viewport**, clamped to the
artboard, via `placeAtViewportCenter` (`src/lib/canvas-placement.ts`) —
never at fixed world coordinates. The view no longer re-centers on panel
open/close once the user has interacted with the canvas.

## Key modules

| Module | Purpose |
| --- | --- |
| `src/lib/multicanvas/projectStore.ts` | Pure project/canvas state + persistence + shared-layer sync |
| `src/lib/multicanvas/stack3dMath.ts` | Deterministic 3D camera/projection for the stack view |
| `src/components/Editor/CanvasStackView.tsx` | The 3D stack overlay |
| `src/components/Editor/CanvasTabsBar.tsx` | Canvas tabs + stack/share controls |
| `src/components/Editor/useMultiCanvasProject.ts` | Editor ↔ project glue (snapshot, switch, shared-layer propagation) |
| `src/components/Editor/useEditorAutosave.ts` | Debounced autosave |
| `src/lib/canvas-placement.ts` | Viewport-centered layer placement |
| `src/components/canvas/designCanvasWarp.ts` | Text background patch + warp renderer (extracted) |
| `src/components/canvas/designCanvasInteractions.ts` | Delete hotkeys + pan/zoom navigation (extracted) |

All UI strings introduced by these features are i18n-ready
(`stack.*`, `editor.autosave*` keys in `src/lib/i18n/locales/en.ts`).
