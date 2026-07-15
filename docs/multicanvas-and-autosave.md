# Multi-Canvas Projects, 3D Stack View & Autosave

## Concepts

The workspace hierarchy is **Project → Canvases → Layers**:

- A **Project** holds any number of canvases and is persisted locally
  (`image-express-project` in localStorage).
- Each **Canvas** is a full artboard with its own layer stack. Only the active
  canvas lives inside the Fabric editor; the rest are kept as serialized
  snapshots.
- **Layers** can be marked *shared* across the project. Shared layers are
  linked: adjustment and appearance changes (adjustment settings, filters,
  opacity, visibility, fill) propagate to every canvas that contains a layer
  with the same `sharedLayerId`. Geometry (position/scale) stays per-canvas.

## Using it

- **Canvas tabs bar** (above the workspace): click a tab to switch canvases,
  `+` to create a new canvas, **Stack** to open the 3D stack view, **Share**
  to toggle sharing for the selected layer.
- **3D Stack view**: every canvas renders as a plane in a 3D stack
  (adapted from the LogiTensor dimension-stack viewer). The selected canvas
  slides out of the stack and renders fully; the rest render in x-ray.
  Shared layers are connected by animated node-style paths between planes.
  - Drag to orbit, Shift+drag to pan, scroll to zoom.
  - Click a plane to select it; double-click (or **Open**) to load it in the
    editor. Rename/duplicate/delete/add from the control strip.

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
