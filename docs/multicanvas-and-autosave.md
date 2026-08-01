# Multi-Canvas Projects, 3D Stack View & Autosave

> **Terminology note:** the code names below predate our canonical vocabulary
> ([GLOSSARY.md](GLOSSARY.md)). In canonical terms this hierarchy is
> **Library → Bookshelf → Album → Page**: a code *Bookshelf* is a **Bookshelf**,
> a code *Project* is an **Album**, and a code *Canvas* is a **Page**. The code
> names are kept in this document because they match the identifiers in
> `lib/multicanvas/projectStore.ts`.

## Concepts

The code hierarchy is **Bookshelves → Projects → Canvases → Layers**
(canonical: **Bookshelf → Album → Page → Layers**):

- A **Bookshelf** is a collection of projects and a **hard resource
  boundary**: shared layers never link or sync across shelves, the
  "Share with other albums" picker only offers albums on the same shelf,
  and the album lattice in the 3D view only shows the active shelf.
  Deleting a shelf deletes the albums on it (confirmed when any hold
  artwork); the last shelf — and a shelf's last album — cannot be deleted.
- **Bookshelves and Albums render on the same 3D lattice** (`gridPose`):
  an axis-aligned grid of wireframe boxes that stays flat up to six boxes
  and then grows *upward* into a true 3D matrix instead of sprawling
  outward. Each box shows its contents as glass slices (albums in a shelf,
  pages in an album). Albums that share linked layers are connected by
  glowing channels; shelves deliberately never are — the absence of
  channels at the shelf level is the resource boundary made visible.
- A **Project** holds any number of canvases. The whole workspace persists
  to IndexedDB (`image-express` / `projects-state`), with automatic
  migration from the older localStorage formats and from pre-bookshelf
  workspaces (everything lands on one default shelf). Starting a new design
  creates its own project — unless an untouched project already exists *on
  the active shelf*, in which case it's reused.
- Each **Canvas** is a full artboard with its own layer stack. Only the active
  canvas lives inside the Fabric editor; the rest are kept as serialized
  snapshots.
- **Layers** can be marked *shared*. Sharing broadcasts a linked copy into
  every other canvas of the project, and shared layers can also be linked
  across other projects **on the same bookshelf**: adjustment and appearance
  changes (adjustment settings, filters, opacity, visibility, fill) propagate
  to every instance with the same `sharedLayerId` on that shelf. Geometry
  (position/scale) stays per-canvas. Duplicating a shared layer keeps the
  link; duplicating a whole bookshelf copies its internal links without
  reaching back into the source shelf.

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
  - **Three zoom levels**: pages (stack) → albums (lattice) → bookshelves
    (lattice). Scrolling out past a threshold rises a level; scrolling in
    dives back down. The toolbar buttons jump levels directly.
  - Drag to orbit · **Space**/Shift/middle-drag to pan (Space works
    mid-drag) · scroll to zoom · **Alt+scroll** to dolly through the scene
    in depth · double-click a box to dive into it.
  - ↑/↓ (or ←/→) cycle the selection at every level (albums cycle within
    the current shelf), Enter dives, Esc steps back down toward the pages
    and closes from there.
  - Hovering a lattice box gently parts its neighbours (inverse-square
    repulsion; the hovered box never moves). Deleting a box plays a
    wind-up: it shrinks, swells past full size, then bursts into debris
    and hot spark streaks at its own screen position.
  - Click a plane/box to select it; double-click (or **Open**) to load it
    in the editor. Rename/duplicate/delete/add from the control strip at
    every level.

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
  for uncropped images to keep storage usage bounded), and each
  snapshot refreshes the stored canvas width/height so 3D plane ratios stay
  correct after artboard resizes.
- **Share with other projects** (globe icon next to Share, canvas tabs bar):
  pick which other projects **on the same bookshelf** should also link to
  the selected layer. Linked copies land in each target project's active
  canvas and stay synchronized the same way as same-project sharing.
  Cross-shelf targets are never offered, and the store refuses them even if
  a caller passes one.
- If storage fills up (IndexedDB quota, or the localStorage fallback), saves
  fall back to dropping thumbnails (they're regenerable) before giving up; a
  one-time toast warns if a save still can't be persisted so work isn't
  silently lost.
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
