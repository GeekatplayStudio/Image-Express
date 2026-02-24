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
- [x] Add `File` menu shell.
- [ ] Add `New` action mapping.
- [ ] Add `Open` action mapping.
- [ ] Add `Open Recent` submenu wiring.
- [ ] Add `Close` / `Close All` behavior or hide until supported.
- [ ] Add `Save` and `Save As` mapping.
- [x] Add `Export As` mapping to existing export flow.
- [ ] Add `Export for Web` mapping or hide until supported.
- [ ] Add `Exit` behavior for desktop mode only (or hide on web).

## B2. Edit Menu
- [x] Add `Edit` menu shell.
- [x] Wire `Undo`.
- [x] Wire `Redo`.
- [ ] Wire `Cut/Copy/Paste` only where object clipboard behavior is valid.
- [ ] Wire `Free Transform` / `Transform` to existing selection transform workflows.
- [x] Add `Preferences` mapping to Settings.

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
- [x] Add `View` menu shell.
- [x] Wire `Fit to Screen`, `Zoom In`, `Zoom Out`.
- [x] Wire `Show Grid` to current GridOverlay system.
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
- [x] Shape/Path/Pixels mode toggles.
- [x] Fill and stroke shortcuts.
- [x] Stroke width control.
- [x] Fixed size toggle.

## C7. Gradient Family
- [x] Gradient type mode (Linear/Radial/Angle).
- [x] Blend mode.
- [x] Opacity.
- [x] Reverse and Dither toggles.

## C8. Crop/Eyedropper/Zoom/Hand
- [x] Crop ratio presets and crop options.
- [x] Eyedropper sample size/source options.
- [x] Zoom in/out mode toggles and fit behavior.
- [x] Hand tool alias and behavior indicator.

---

## D) Properties + Panel Organization Upgrade

## D1. Right Icon Rail
- [x] Add compact right icon rail for panel switching (Layers/Properties first slice).
- [x] Add icons: Layers, Properties, History, Color, Swatches, Brushes, Channels, Adjustments, Navigator, Info.
- [x] Keep existing dock/floating/collapse panel behavior intact.

## D2. Color System
- [x] Add RGB/HSB/CMYK/Lab tabs in color workflow UI.
- [x] Preserve existing palette harmony + saved palettes.
- [x] Ensure color changes apply to selected object through existing mutation pipeline.

## D3. Adjustment Layers Discoverability
- [x] Add categorized adjustment launcher (matching reference naming).
- [x] Keep current adjustment engine (`AdjustmentControls`, filter application, clipping logic).
- [x] Add top quick controls when adjustment layer is selected.

## D4. Layer/History/Info/Navigator Organization
- [x] Move selected-layer lock/clip/delete to compact top action strip (phase 1 cleanup).
- [x] Reduce persistent per-row action density; keep compact row visibility + settings affordance.
- [x] Add selected-layer properties inspector toggle from row settings icon.
- [x] Add dedicated layer properties mini-surface (X/Y/W/H) for selected layer.
- [x] Add explicit Arrange Layers mode toggle and gate drag-sort to that mode.
- [x] Add panel-level shortcuts and visibility state persistence.
- [x] Ensure history panel reflects true undo stack (not mock list).
- [x] Ensure navigator/info panels map to real canvas state if exposed.

---

## E) Missing Tools Program (Phased)

## E1. Alias/Identity First (No New Engine)
- [x] Add Move naming alias over Select.
- [x] Add Hand tool alias over pan behavior.
- [x] Add Zoom tool alias over existing zoom system.
- [x] Add Path Selection alias where useful.

## E1.5 Raster Brush Engine Consolidation
- [x] Add shared raster engine utility as single brush source of truth.
- [x] Keep left-rail `Pen` as vector curves/path tool (separate from raster brushes).
- [x] Keep `Oil` and `Watercolor` presets on the same raster engine path.

## E2. New Selection Tools (Require Raster Selection Engine)
- [x] Rectangular Marquee.
- [x] Lasso.
- [x] Magic Wand.
- [x] Selection modify operations (expand/contract/feather etc.).

## E3. Advanced Raster Retouch Tools (Deferred)
- [x] Bootstrap identities for Healing Brush + Clone Stamp (safe fallback behavior + clone source scaffolding).
- [ ] Healing Brush.
- [ ] Clone Stamp.
- [ ] History Brush.
- [ ] Blur Tool.
- [ ] Dodge Tool.

---

## F) Bottom-Right Utility Upgrade

- [x] Move or duplicate zoom controls to bottom-right utility cluster.
- [x] Keep current zoom logic as single source of truth.
- [x] Add compact status chips (zoom %, canvas size, grid state).
- [x] Ensure no overlap with floating properties panel.
- [x] Ensure no overlap with context menu and job status UI.

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
- [x] Phase 2 complete (Right icon rail)
- [x] Phase 3 complete (Bottom-right utilities)
- [ ] Phase 4 complete (Menu taxonomy shell)
- [x] Phase 5 complete (Color/Adjustment organization enhancements)
- [x] Phase 6 complete (Missing-tools phase 1 aliases)
- [ ] Phase 7+ complete (advanced raster tools roadmap)
