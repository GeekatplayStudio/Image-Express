# Imageprocessingui Upgrade — Execution Checklist (Menus, Properties, Submenus, Missing Tools)

Canonical progress file: [docs/unified_progress_status.md](docs/unified_progress_status.md)

Purpose: This is the implementation tracking checklist to execute the reference-design upgrade safely in Image Express.

How to use:
- Mark each checkbox only when implemented and verified in app.
- Keep deferred items unchecked until technical prerequisites are available.
- For each completed section, run lint/build and update [docs/feature_implementation_tracker.md](docs/feature_implementation_tracker.md).

---

## A) Pre-Implementation Safety Gates

- [ ] Confirm no placeholder/no-op command is exposed to users.
- [ ] Confirm all new UI controls route through existing Image Express state/actions.
- [ ] Confirm no duplicate property ownership between TopToolOptionsBar and PropertiesPanel.
- [ ] Confirm keyboard shortcuts do not conflict with existing shortcuts.
- [ ] Confirm docked/floating properties panel behavior remains intact.
- [ ] Confirm all new UI is covered by at least smoke-level tests.

---

## B) Menu Bar Upgrade Path (Reference Taxonomy)

## B1. File Menu
- [ ] Add `File` menu shell.
- [ ] Add `New` action mapping.
- [ ] Add `Open` action mapping.
- [ ] Add `Open Recent` submenu wiring.
- [ ] Add `Close` / `Close All` behavior or hide until supported.
- [ ] Add `Save` and `Save As` mapping.
- [ ] Add `Export As` mapping to existing export flow.
- [ ] Add `Export for Web` mapping or hide until supported.
- [ ] Add `Exit` behavior for desktop mode only (or hide on web).

## B2. Edit Menu
- [ ] Add `Edit` menu shell.
- [ ] Wire `Undo`.
- [ ] Wire `Redo`.
- [ ] Wire `Cut/Copy/Paste` only where object clipboard behavior is valid.
- [ ] Wire `Free Transform` / `Transform` to existing selection transform workflows.
- [ ] Add `Preferences` mapping to Settings.

## B3. Image Menu
- [ ] Add `Image` menu shell.
- [ ] Add `Adjustments` submenu launcher (Brightness/Contrast, Levels, Curves, Exposure, Hue/Saturation, etc.).
- [ ] Map `Image Size` and `Canvas Size` to existing canvas/document settings.
- [ ] Add `Image Rotation` submenu (rotate/flip actions).
- [ ] Add `Crop` command mapping.
- [ ] Hide unsupported commands (`Auto Tone/Contrast/Color`, `Trim`) until implemented.

## B4. Layer Menu
- [ ] Add `Layer` menu shell.
- [ ] Add `New Layer`, `Group`, `Group from Layers` actions.
- [ ] Add `Duplicate Layer` and `Delete Layer` mappings.
- [ ] Add `Layer Style` submenu launcher (Blending options etc.) as available.
- [ ] Add `New Fill Layer` / `New Adjustment Layer` actions.
- [ ] Add `Merge Layers` / `Flatten Image` only if behavior is fully defined.

## B5. Select Menu
- [ ] Add `Select` menu shell.
- [ ] Add `All / Deselect / Reselect / Inverse` where selection model supports it.
- [ ] Add `Color Range` and `Subject` only if implemented.
- [ ] Add `Modify` submenu (`Border`, `Smooth`, `Expand`, `Contract`, `Feather`) only when selection engine supports it.
- [ ] Add `Save Selection` / `Load Selection` only after selection serialization support exists.

## B6. Filter Menu
- [ ] Add `Filter` menu shell.
- [ ] Add `Blur` submenu launcher (Gaussian first; others deferred).
- [ ] Add `Sharpen`, `Distort`, `Pixelate`, `Render`, `Stylize`, `Noise`, `Other` groups as category shells.
- [ ] Expose only implemented filters; hide all placeholder commands.

## B7. View Menu
- [ ] Add `View` menu shell.
- [ ] Wire `Fit to Screen`, `Zoom In`, `Zoom Out`.
- [ ] Wire `Show Grid` to current GridOverlay system.
- [ ] Add `Show Rulers/Guides/Snap/Lock Guides` only if implemented.

## B8. Window Menu
- [ ] Add `Window` menu shell.
- [ ] Add panel toggles for Layers, Properties, History, Color, Swatches, Brushes, Navigator, Info.
- [ ] Ensure toggles reflect actual panel visibility state.

## B9. Help Menu
- [ ] Add `Help` menu shell.
- [ ] Map `Help Contents` to existing documentation modal.
- [ ] Add `Keyboard Shortcuts` view.
- [ ] Add `About` dialog.

---

## C) Second Top Tool Options Bar (Critical)

## C1. Platform Setup
- [x] Create `TopToolOptionsBar` component.
- [x] Mount below existing editor header.
- [x] Bind to `activeTool` and selected object snapshot.
- [x] Ensure control state reflects current object/tool values in real time.

## C2. Select/Move Family
- [x] Auto-select toggle.
- [x] Selection mode (`Layer`/`Group`) toggle.
- [x] Transform controls toggle.
- [x] Feather and anti-alias controls where relevant.

## C3. Brush/Paint Family
- [x] Brush preset trigger.
- [x] Size control.
- [x] Hardness control.
- [x] Opacity control.
- [x] Flow control.
- [x] Smoothing control.
- [x] Blend mode control.

## C4. Pen/Path Family
- [x] Path/Shape mode toggles.
- [x] Add/Subtract/Intersect path operations.
- [x] Auto add/delete toggle.
- [x] Rubber band toggle.

## C5. Text Family
- [x] Font family selector.
- [x] Font style selector.
- [x] Size slider/input.
- [x] Bold/Italic/Underline toggles.
- [x] Alignment controls.
- [x] Color shortcut.

## C6. Shape/Rectangle Family
- [ ] Shape/Path/Pixels mode toggles.
- [ ] Fill and stroke shortcuts.
- [ ] Stroke width control.
- [ ] Fixed size toggle.

## C7. Gradient Family
- [ ] Gradient type mode (Linear/Radial/Angle).
- [ ] Blend mode.
- [ ] Opacity.
- [ ] Reverse and Dither toggles.

## C8. Crop/Eyedropper/Zoom/Hand
- [ ] Crop ratio presets and crop options.
- [ ] Eyedropper sample size/source options.
- [ ] Zoom in/out mode toggles and fit behavior.
- [ ] Hand tool alias and behavior indicator.

---

## D) Properties + Panel Organization Upgrade

## D1. Right Icon Rail
- [ ] Add compact right icon rail for panel switching.
- [ ] Add icons: Layers, Properties, History, Color, Swatches, Brushes, Channels, Paths, Adjustments, Navigator, Info.
- [ ] Keep existing dock/floating/collapse panel behavior intact.

## D2. Color System
- [ ] Add RGB/HSB/CMYK/Lab tabs in color workflow UI.
- [ ] Preserve existing palette harmony + saved palettes.
- [ ] Ensure color changes apply to selected object through existing mutation pipeline.

## D3. Adjustment Layers Discoverability
- [ ] Add categorized adjustment launcher (matching reference naming).
- [ ] Keep current adjustment engine (`AdjustmentControls`, filter application, clipping logic).
- [ ] Add top quick controls when adjustment layer is selected.

## D4. Layer/History/Info/Navigator Organization
- [x] Move selected-layer lock/clip/delete to compact top action strip (phase 1 cleanup).
- [x] Reduce persistent per-row action density; keep compact row visibility + settings affordance.
- [ ] Add panel-level shortcuts and visibility state persistence.
- [ ] Ensure history panel reflects true undo stack (not mock list).
- [ ] Ensure navigator/info panels map to real canvas state if exposed.

---

## E) Missing Tools Program (Phased)

## E1. Alias/Identity First (No New Engine)
- [ ] Add Move naming alias over Select.
- [ ] Add Hand tool alias over pan behavior.
- [ ] Add Zoom tool alias over existing zoom system.
- [ ] Add Path Selection alias where useful.

## E2. New Selection Tools (Require Raster Selection Engine)
- [ ] Rectangular Marquee.
- [ ] Lasso.
- [ ] Magic Wand.
- [ ] Selection modify operations (expand/contract/feather etc.).

## E3. Advanced Raster Retouch Tools (Deferred)
- [ ] Healing Brush.
- [ ] Clone Stamp.
- [ ] History Brush.
- [ ] Blur Tool.
- [ ] Dodge Tool.

---

## F) Bottom-Right Utility Upgrade

- [ ] Move or duplicate zoom controls to bottom-right utility cluster.
- [ ] Keep current zoom logic as single source of truth.
- [ ] Add compact status chips (zoom %, canvas size, grid state).
- [ ] Ensure no overlap with floating properties panel.
- [ ] Ensure no overlap with context menu and job status UI.

---

## G) Validation Checklist per Phase

For each implemented phase:
- [ ] `npm run lint` passes (or expected pre-existing warnings only).
- [ ] `npm run build` passes.
- [ ] Manual QA: tool switching + properties sync.
- [ ] Manual QA: panel docking/floating/collapse.
- [ ] Manual QA: export/share not regressed.
- [ ] Manual QA: undo/redo integrity.
- [ ] Update [docs/feature_implementation_tracker.md](docs/feature_implementation_tracker.md) with progress notes.

---

## H) Implementation Status Snapshot

- [ ] Phase 0 complete (architecture prep)
- [x] Phase 1 complete (TopToolOptionsBar MVP)
- [ ] Phase 2 complete (Right icon rail)
- [ ] Phase 3 complete (Bottom-right utilities)
- [ ] Phase 4 complete (Menu taxonomy shell)
- [ ] Phase 5 complete (Color/Adjustment organization enhancements)
- [ ] Phase 6 complete (Missing-tools phase 1 aliases)
- [ ] Phase 7+ complete (advanced raster tools roadmap)
