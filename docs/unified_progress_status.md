# Unified Progress Status (Canonical)

Last updated: 2026-02-26  
Repository: https://github.com/GeekatplayStudio/Image-Express.git  
Branch: main  
HEAD: 4dcd759

## Purpose
This is the single source of truth for implementation progress across:
- upgrade checklist planning,
- implementation tracking,
- continuation handoff notes.

Use this file first for: what is done, what is pending, and what to do next.

---

## Latest Delivery (2026-02-25 to 2026-02-26)

- Completed right-panel color workflow parity: embedded wheel interaction, editable RGB/HSB/CMYK/Lab channel cards, and profile-context display modes (sRGB/Adobe RGB/CMYK print preview).
- Completed harmony management in color tooling: named save/load/delete, inline rename, import/export JSON, plus compact collapsible list behavior.
- Completed grouped swatch management in Swatches panel: create/select/remove groups and add/remove swatches within the panel, persisted via local storage.
- Completed adjustment layer workflow alignment: adjustment creation stays in left rail `Adjustment Layers`, added missing types (`brightness-contrast`, `color-balance`, `light-and-color`, `solid-color`), and creation now auto-focuses new adjustment properties.
- Completed properties/text UX updates: multiline text editing in properties and text-on-path render safety to reduce clipping.
- Completed shape library expansion in the left rail shape tool: cloud, thought bubble, hexagon, and diamond.

Validation notes:
- Build passed after latest round (`npm run build`).
- Lint/build were rerun after syntax regression fixes during swatch panel refactor.

---

## Verified Implemented (Checked + Working)

Verification method used:
- Mapped each checked checklist item to code in `TopToolOptionsBar` + `EditorView`
- Confirmed coverage in component/integration tests
- Re-ran validation gates:
  - `npm test -- TopToolOptionsBar.test.tsx EditorView.test.tsx`
  - `npm run lint`
  - `npm run build`

### C1. Platform Setup
- [x] Top tool options bar component created and mounted under header.
- [x] Bound to active tool and live selection/object state.

### C2. Select/Move Family
- [x] Auto-select toggle
- [x] Selection mode toggle (Layer/Group)
- [x] Transform controls toggle
- [x] Feather / anti-alias controls

### C3. Brush/Paint Family
- [x] Brush preset
- [x] Size
- [x] Hardness
- [x] Opacity
- [x] Flow
- [x] Smoothing
- [x] Blend mode
- [x] Fabric paint brush wiring in editor
- [x] Shared raster engine utility for brush presets (`Pencil`/`Spray`/`Oil`/`Watercolor`)

### C4. Pen/Path Family
- [x] Path/Shape mode toggle
- [x] Add/Subtract/Intersect path operations
- [x] Auto add/delete toggle
- [x] Rubber band toggle

### C5. Text Family (partially complete section)
- [x] Font family selector
- [x] Font style selector
- [x] Size control
- [x] Bold/Italic/Underline toggles
- [x] Alignment controls (left/center/right/justify)
- [x] Color shortcut

---

## Pending Work (Upgrade Program)

### Next Active Step (Approved Direction)
- [ ] Implement **Media Export Overlay (Phase A2)**:
  - Add multiple overlay frames in one design.
  - Add include/exclude toggles per frame for batch export.
  - Export selected/all frames as ZIP outputs.
  - Keep current single-canvas workflow and reuse existing export pipeline.

### Media Export Overlay Roadmap (new)
- [x] A1: single frame export from overlay bounds.
- [ ] A2: multi-frame management + batch ZIP export.
- [ ] A3: safe-area guides + naming templates.
- [ ] B: optional bridge "convert frame to variant" for future campaign workspace.

### A) Pre-Implementation Safety Gates
- [ ] Baseline visual + UX parity snapshots captured
- [ ] Current editor interactions smoke-tested against checklist
- [ ] Rollback points and guardrails explicitly signed off

### B) Menu Bar Upgrade Path
- [x] File menu shell + mapped existing actions (`Save`, `Export As` launcher)
- [x] Edit menu shell + mapped existing actions (`Undo`, `Redo`, `Duplicate`, `Preferences`)
- [x] Image menu shell + mapped actions
- [x] Layer menu shell + mapped actions
- [x] Select menu shell + mapped actions
- [x] Filter menu shell + mapped actions
- [x] View menu shell + mapped existing actions (`Fit`, `Zoom In/Out`, `Show Grid`)
- [x] Window menu shell + mapped actions
- [x] Help menu shell + mapped actions

### C) Top Tool Options Bar Remaining
- [x] C6: Shape/Rectangle family (all)
- [x] C7: Gradient family (all)
- [x] C8: Crop/Eyedropper/Zoom/Hand family (all)

Completed in this pass (C6 shape/rectangle family):
- [x] Added Shape/Path/Pixels mode toggles in `TopToolOptionsBar` when `activeTool === 'shapes'`.
- [x] Added Fill/Stroke color shortcuts and stroke width controls.
- [x] Added fixed-size toggle wired to object scaling locks.
- [x] Wired shape config through existing canvas mutation/event paths (`shape:config:set` + active object `set` updates).
- [x] Added/updated Top options and editor integration tests for C6 controls.

Completed in this pass (C7 gradient family):
- [x] Added gradient top controls wiring in `EditorView` for type/blend/opacity/reverse/dither.
- [x] Applied gradient config to active object with safe fallback behavior: `angle` preserved via `gradientTypeHint` while rendered as linear, and `dither` persisted as metadata where engine support is partial.
- [x] Updated gradient drag workflow to honor current top settings and preserve/flip color stops safely.
- [x] Added focused tests for gradient control wiring in `TopToolOptionsBar` and `EditorView`.

Completed in this pass (C8 crop/eyedropper/zoom/hand family):
- [x] Added crop top controls (ratio presets, artboard-bounds option, delete-outside option, apply action) and wired apply to artboard crop bounds with safe object-prune behavior.
- [x] Added eyedropper top controls (sample size/source + sample action) and wired sampling through active-object/canvas fallback with color propagation to live top color state.
- [x] Added zoom top controls (in/out mode, step presets, apply, fit-to-screen, reset) wired to existing zoom/fit behavior.
- [x] Added hand top controls with explicit pan-lock alias and connected hand-mode state through canvas event wiring.
- [x] Added focused tests for C8 wiring in `TopToolOptionsBar` and `EditorView`; re-ran lint/build gates.

### D) Properties + Panel Organization
- [x] Right icon rail taxonomy expansion with persisted mode state (Layers/Properties/History/Color/Swatches/Brushes/Channels/Adjustments/Navigator/Info)
- [x] Color system tabs (RGB/HSB/CMYK/Lab) with safe fallback messaging
- [x] Adjustment discoverability launcher (categorized actions + selected-adjustment quick controls)
- [x] Layer/History/Info/Navigator organization updates

Completed in this pass (layer cleanliness phase 1):
- [x] Moved selected-layer lock/clip/delete actions to a compact top action strip.
- [x] Simplified layer row controls to reduce persistent icon clutter.
- [x] Added selected-layer settings/overflow affordance on the right side of row.

Completed in this pass (layer cleanliness phase 2/3):
- [x] Added selected-layer properties inspector toggle and dedicated layer properties surface (X/Y/W/H).
- [x] Added explicit Arrange Layers mode toggle and gated drag-sort behavior behind arrange mode.
- [x] Added component tests for new layer inspector and arrange mode behaviors.

Completed in this pass (panel rail + color workflow slice):
- [x] Added dedicated `PanelModeRail` component and integrated it into `PropertiesPanel`.
- [x] Added persisted panel mode state (`layers`/`properties`) via localStorage with safe fallback to `properties`.
- [x] Added `PropertiesPanel` + `PanelModeRail` tests for rail switching/persistence behavior.
- [x] Added color mode tabs (RGB/HSB/CMYK/Lab) in selection Fill workflow and preserved existing `ColorPicker` pipeline.

Completed in this pass (adjustment discoverability slice):
- [x] Added categorized adjustment launcher in selection workflow with reference-style naming groups.
- [x] Wired launcher actions through existing `adjustment:create` canvas event path (no duplicate adjustment state ownership).
- [x] Added selected-adjustment quick controls for fast adjustment-type switching and preserved existing `AdjustmentControls` mutation flow.

Completed in this pass (panel organization follow-through slice):
- [x] Added persisted panel shortcuts beyond Layers/Properties (`history`, `navigator`, `info`) via the right rail.
- [x] Wired History panel to live undo/redo stack counts and actions (no mock history list).
- [x] Wired Navigator/Info panels to real editor state (zoom, canvas size, object count, selection count, active tool).
- [x] Upgraded Navigator with a compact minimap preview and click-to-center viewport navigation.

Completed in this pass (D1 rail taxonomy expansion slice):
- [x] Expanded right rail with remaining reference icons (`color`, `swatches`, `brushes`, `channels`, `adjustments`).
- [x] Mapped `color`/`swatches`/`adjustments` to concrete panel surfaces tied to existing mutation pipelines.
- [x] Mapped `brushes` to a real dedicated controls surface wired to editor paint state (preset/size/hardness/opacity/flow/smoothing/blend + activate paint action).
- [x] Kept `channels` as explicit coming-soon surface with clear affordance copy.
- [x] Extended rail persistence + hydration tests for new modes.
- [x] Added `PropertiesPanel` test coverage for brushes mode control wiring.

Completed in this pass (layer lock canvas interaction slice):
- [x] Added direct on-canvas lock badges for locked layers with click-to-unlock behavior.
- [x] Added pale hover outline feedback for locked layers to reduce accidental drag attempts.
- [x] Extended lock-badge hit-testing to nested locked child layers inside groups (while preventing duplicate child badges when parent group is locked).
- [x] Added `EditorView` regression coverage for lock badge unlock flow (top-level and grouped child layers).
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

### E) Missing Tools Program
- [x] Alias/identity first phase (Move/Hand/Zoom/Path select aliases)
- [x] Raster selection tools (marquee/lasso/wand/selection modify complete)
- [ ] Advanced retouch tools (healing/clone bootstrap complete; full raster retouch behavior pending)

Completed in this pass (E1 alias/identity first phase):
- [x] Added Move naming alias over Select across toolbar/tool surfaces while preserving underlying `select` behavior.
- [x] Added Path Select alias entry in tool switching surfaces and normalized alias routing to existing select engine.
- [x] Added keyboard alias wiring (`V` => Move/Select, `A` => Path Select alias) and aligned docs copy.
- [x] Added/updated tests for alias routing and tool-surface labels.

Completed in this pass (E2 rectangular marquee slice):
- [x] Added left-rail `Marquee` tool and menu/keyboard entry (`M`) wired through existing tool routing.
- [x] Implemented rectangular drag-selection state in `EditorView` with helper overlay and scene-space hit testing.
- [x] Integrated selection-mode behavior for marquee commits (`Layer` picks top-most hit, `Group` builds active multi-selection).
- [x] Reused existing top select controls for marquee tool mode (no duplicate ownership).
- [x] Added focused test coverage for marquee activation + drag selection flow.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E2 lasso slice):
- [x] Added left-rail `Lasso` tool and menu/keyboard entry (`L`) wired through existing tool routing.
- [x] Implemented lasso path capture + commit flow in `EditorView` with polygon-based object inclusion and selection-mode-aware commit behavior.
- [x] Added explicit cancel flow for in-progress lasso capture via `Escape`.
- [x] Reused existing top select controls for lasso tool mode (no duplicate ownership).
- [x] Added focused test coverage for lasso activation + keyboard alias + drag selection flow.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E2 magic wand bootstrap slice):
- [x] Added left-rail `Magic Wand` tool identity and toolbar routing/cursor behavior.
- [x] Added `W` keyboard alias and tools-menu entry wiring for wand activation.
- [x] Implemented wand threshold bootstrap selection in `EditorView` with safe fallback: direct target if present, otherwise pointer-hit bounding-box target, and single-target fallback when color matching is unavailable.
- [x] Added wand threshold top-option control wiring and selection tests for threshold matching + fallback path.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E2 selection modify slice):
- [x] Added top select-family controls for selection modify radius and expand/contract actions.
- [x] Implemented selection modify operations in `EditorView` over current selection bounds with safe fallback behavior for degenerate contraction.
- [x] Wired modify operations to current selection mode commit path and existing selectable-object filters.
- [x] Added focused tests for selection modify top-controls wiring and expand/contract behavior.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E3 retouch bootstrap slice):
- [x] Added left-rail tool identities for `Healing Brush` and `Clone Stamp` with cursor/tool routing.
- [x] Added tool-menu entries and keyboard aliases (`J` for Healing, `S` for Clone Stamp).
- [x] Added top option control surfaces for healing/clone bootstrap settings (size/hardness/sample/alignment/source state).
- [x] Added clone source-point scaffolding (`Option`-click sets source).
- [x] Added focused tests for healing/clone top controls, keyboard alias routing, toolbar activation, and clone source scaffolding behavior.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.
- [x] Added left-rail `History Brush` bootstrap identity with cursor/tool routing.
- [x] Added tools-menu entry and keyboard alias (`Y`) for history brush activation.
- [x] Added top option control surface for history brush bootstrap settings (size/hardness/sample state).
- [x] Added focused tests for history brush top controls, toolbar activation, tools-menu routing, and keyboard alias handling.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx src/components/__tests__/Toolbar.test.tsx --watch=false`, `npm run lint`, `npm run build`.
- [x] Added left-rail `Blur Tool` and `Dodge Tool` bootstrap identities with cursor/tool routing.
- [x] Added tools-menu entries and keyboard aliases (`B` for Blur, `O` for Dodge).
- [x] Added top option control surfaces for blur/dodge bootstrap settings (size/strength/sample and size/exposure/protect tones).
- [x] Added focused tests for blur/dodge top controls, toolbar activation, tools-menu routing, and keyboard alias handling.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx src/components/__tests__/Toolbar.test.tsx --watch=false`, `npm run lint`, `npm run build`.
- [x] Added first-pass dedicated raster retouch layer engine and wired live stroke mutations for clone/healing/history/blur/dodge.
- [x] Added retouch utility module (`src/lib/retouch-engine.ts`) for soft masks, stroke interpolation, and sampled/dodge dab stamping.
- [x] Added clone aligned-flow continuation and history-source snapshot capture for retouch strokes.
- [x] Preserved safe warning behavior only when source pixels are unavailable, instead of unconditional no-op.
- [x] Added regression tests for retouch-layer creation/reuse and unavailable-context handling in `EditorView` plus retouch utility unit tests.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/EditorView.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx src/components/__tests__/Toolbar.test.tsx --watch=false`, `npm run lint`, `npm run build`.

### F) Bottom-Right Utility Upgrade
- [x] Utility cluster placement and overlap-safe status chips

Completed in this pass (F bottom-right utility upgrade + right-panel dedup):
- [x] Moved zoom controls from bottom-center to a bottom-right utility cluster.
- [x] Kept zoom actions wired to existing zoom handlers as single source of truth.
- [x] Added compact utility status chips for zoom %, canvas size, and grid state.
- [x] Added adaptive utility placement offsets to avoid overlap with floating properties panel, context menu, and job status footer.
- [x] Removed duplicate right-side Pen surface behavior by eliminating the extra `activeTool === 'pen'` override.
- [x] Removed right-rail `paths` panel mode so Pen exists on the left/tool surface only.

Completed in this pass (Phase 7 raster engine slice):
- [x] Added `src/lib/raster-engine.ts` for shared brush construction + drawing-mode helpers.
- [x] Unified `Pencil`/`Spray`/`Oil`/`Watercolor` preset typing across top options and brushes panel.
- [x] Restored left-rail `Pen` as vector curves/path tool with top pen config wiring (`pen:config:set`).
- [x] Removed duplicate/legacy paint ownership override in `PropertiesPanel` by auto-routing paint/pen context to `brushes` panel mode.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/__tests__/PropertiesPanel.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (B1/B2/B7 menu-shell first increment):
- [x] Added `File`, `Edit`, and `View` dropdown shells in the header using existing command paths only.
- [x] Wired `File` menu to existing save/export flow (`Save`, `Export As...` launcher to current export menu).
- [x] Wired `Edit` menu to existing history/settings flows (`Undo`, `Redo`, `Duplicate`, `Preferences...`).
- [x] Wired `View` menu to existing viewport/grid flows (`Fit to Screen`, `Zoom In`, `Zoom Out`, `Show/Hide Grid`).
- [x] Added smoke test coverage for menu action wiring and keyboard coexistence in `EditorView`.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (B8 window menu panel wiring):
- [x] Added `Window` dropdown shell in editor header.
- [x] Added panel toggles for Layers/Properties/History/Color/Swatches/Brushes/Channels/Adjustments/Navigator/Info.
- [x] Wired toggles to real shared panel-mode state (EditorView <-> PropertiesPanel) with persisted mode hydration.
- [x] Added panel visibility + dock-mode toggles (show/hide, dock left/right, float) that reflect live panel state.
- [x] Added/updated `EditorView` integration test coverage for window menu toggle state reflection.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/EditorView.test.tsx src/components/__tests__/PropertiesPanel.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (tool rail hover-label discoverability slice):
- [x] Added left toolbar hover-expand behavior to reveal tool names while keeping default icon-first compact layout.
- [x] Added right panel rail hover-expand behavior to reveal panel labels with the same interaction model.
- [x] Added a persisted configuration toggle in `Settings` to enable/disable hover expansion (`Expand side tool rails on hover`).
- [x] Wired editor runtime to rehydrate/apply preference changes via shared UI-preferences storage/event.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/properties/__tests__/PanelModeRail.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E3 retouch fidelity + regression slice):
- [x] Added safer all-layers retouch source fallback when `toCanvasElement` snapshot export is unavailable (including tainted/cross-origin snapshot failure scenarios) by sampling from runtime lower canvas with viewport-aware crop mapping.
- [x] Extracted clone aligned source-point continuation into shared helper logic and added dedicated regression unit coverage.
- [x] Added `EditorView` regression coverage for:
  - lower-canvas fallback source sampling path,
  - history-brush per-stroke source snapshot restore semantics.
- [x] Validation rerun: `npm test -- src/lib/__tests__/retouch-engine.test.ts src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E3 retouch blend/softness calibration slice):
- [x] Expanded retouch brush profiles with mode-aware compositing metadata and optional secondary-pass blending.
- [x] Tuned healing/blur/sharpen/dodge calibration curves for opacity, hardness, spacing, and effect strength to reduce haloing/smearing at extreme sizes/strengths.
- [x] Added healing two-pass stamping (`source-over` base + `soft-light` detail pass) for smoother blend fidelity.
- [x] Added focused unit coverage for profile calibration behavior across healing/blur/sharpen/dodge modes.
- [x] Validation rerun: `npm test -- --runInBand src/lib/__tests__/retouch-engine.test.ts src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (Phase 4 left-toolbar utility + cursor foundation slice):
- [x] Added persistent left-rail utility tools (`Crop`, `Eyedropper`, `Zoom`, `Hand`) so they are no longer dropdown-only.
- [x] Added bottom utility FG/BG/swap cluster in the left rail with canvas sync event (`toolbar:color:change`) for downstream consumers.
- [x] Replaced ad-hoc cursor conditionals with a centralized cursor resolver and added zoom cursor mode parity (`zoom-in`/`zoom-out`) from top options.
- [x] Wired toolbar zoom cursor mode from `EditorView` (`zoomTopMode`) into toolbar cursor handling.
- [x] Added/updated toolbar regression coverage for persistent utility controls, zoom-out cursor mode, and color swap sync event.
- [x] Validation rerun: `npm test -- --runInBand src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (Phase 4 cursor realism + test-coverage audit slice):
- [x] Added real on-canvas tool cursor previews in workspace:
  - brush-size ring for paint/retouch family tools,
  - target-style cursor for eyedropper.
- [x] Added viewport-aware pointer mapping for cursor previews with scene-point fallback.
- [x] Added `EditorView` regression tests for brush cursor preview rendering and eyedropper target preview rendering.
- [x] Full suite audit rerun completed: `npm test -- --runInBand` (50 suites / 346 tests), then `npm run lint`, `npm run build`.
- [x] Confirmed intentional placeholder remains only where explicitly marked (e.g. Channels panel coming-soon surface), not in active cursor workflows.

Completed in this pass (Phase 4 selection-group parity slice):
- [x] Added `Quick Selection` and `Selection Brush` identities across tool surfaces (left rail group, tools dropdown, select menu, keyboard aliases).
- [x] Routed `Quick Selection` through the existing wand-selection pipeline and `Selection Brush` through the existing lasso-selection pipeline with safe fallback behavior.
- [x] Added top-options parity for selection subtool switching and wand-threshold behavior in quick-select mode.
- [x] Synced circular right-click tool menu with new selection tools so context actions reflect current tool taxonomy.
- [x] Added/updated regression coverage in:
  - `ToolsDropdownMenu.test.tsx`
  - `Toolbar.test.tsx`
  - `TopToolOptionsBar.test.tsx`
  - `EditorView.test.tsx`
- [x] Validation rerun: `npm test -- --runInBand` (50 suites / 351 tests), `npm run lint`, `npm run build`.

Completed in this pass (crop + picker reliability slice):
- [x] Added crop drag-draft bounds directly in workspace canvas for crop tool (drag on canvas, apply from top bar, Enter shortcut).
- [x] Updated crop apply flow to prioritize draft bounds when present, with helper cleanup and success messaging.
- [x] Added true eyedropper point sampling from clicked canvas scene-point (instead of center-only fallback), preserving source/size options.
- [x] Updated left-toolbar picker behavior to open the color wheel while eyedropper is active.
- [x] Refreshed color wheel panel UX with hue ring + SV square interaction, harmony mode swatches (complementary/triadic/tetradic/etc), and saved swatches.
- [x] Added/updated regression coverage in `Toolbar.test.tsx` and `EditorView.test.tsx` for picker-panel open, pointer sampling, and crop draft apply flow.
- [x] Validation rerun: `npm test -- --runInBand` (50 suites / 354 tests), `npm run lint`, `npm run build`.

Completed in this pass (picker interaction hardening + key-stability slice):
- [x] Prevented eyedropper clicks from selecting canvas layers by disabling target-finding while picker mode is active.
- [x] Prevented auto tool-switch fallback (`-> select`) for eyedropper/crop/zoom/hand utility tools when selection events fire.
- [x] Added regression coverage ensuring eyedropper remains active during sampling and does not collapse to layer-select behavior.
- [x] Fixed duplicate React key warnings in color wheel harmony/swatch lists by using stable indexed keys.
- [x] Validation rerun: `npm test -- --runInBand src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`.

### H) Implementation Status Snapshot
- [x] Phase 1 complete
- [x] Phase 2 complete
- [ ] Phase 0 complete
- [x] Phase 3 complete
- [ ] Phase 4 complete
- [x] Phase 5 complete
- [x] Phase 6 complete
- [ ] Phase 7+ complete

---

## Other Product Tracker Snapshot (Non-upgrade items)
From `feature_implementation_tracker.md`:
- [x] Upgrade program is **In Progress** (item 29)
- [ ] Gradient masks per layer
- [ ] More text effects
- [ ] Local AI support (Ollama)
- [ ] AI critique of image/canvas
- [ ] Social media posting
- [ ] User registration
- [ ] Reset/change password
- [ ] Import/export asset library
- [ ] Online storage integration

---

## Current Recommended Next Step
Proceed with **Phase 4 left-toolbar parity completion**:
- [ ] Continue Retouch group parity slice: add `Spot Healing`, `Remove`, `Burn`, and `Sponge` tool identities (engine-safe aliases where behavior is partial).
- [ ] Run reference screenshot parity smoke checks for Select, Retouch, Paint, Shapes, Type, and Add Image groups.

---

## Files This Consolidates
- `docs/imageprocessingui_upgrade_execution_checklist.md` (archived pointer)
- `docs/feature_implementation_tracker.md`
- `docs/chat_continuation_handoff_2026-02-23.md`

These files remain useful for detail/history, but all progress tracking must happen in this file.
