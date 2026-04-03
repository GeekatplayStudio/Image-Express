# Unified Progress Status (Canonical)

Last updated: 2026-04-02  
Repository: https://github.com/GeekatplayStudio/Image-Express.git  
Branch: main  
Reference commit at last full audit: 9b54543

## Purpose
This is the single source of truth for implementation progress across:
- upgrade checklist planning,
- implementation tracking,
- continuation handoff notes.

Use this file first for: what is done, what is pending, and what to do next.


---

## Latest Delivery (2026-04-02)

- Added a front/back pseudo-backside preset in the Properties panel so selected layers can flip to a backside presentation without introducing extra perspective skew.
- Stored the original horizontal flip state as `backsideBaseFlipX` and added regression coverage for the new preset controls in `PropertiesPanel.test.tsx` and `SelectionProperties.test.tsx`.
- Fixed local Comfy image-source export by hiding the visible AI zone overlay during capture, restoring visibility afterward, and moving the export logic into `imageGeneratorModalUtils.ts`.
- Added blank-source inspection for local Comfy image-based tasks so nearly all-white captures fail fast with a corrective message instead of being uploaded as a bad img2img/inpaint source.
- Standard local Comfy runs now persist the last prepared request snapshot in browser localStorage under `image-express-comfy-last-request`, including prepared positive/negative prompt text plus workflow/model metadata.
- Local Comfy request params now forward the shared UI negative prompt into prepared workflow bindings.
- Comfy local folder resolution now accepts relative child paths under the configured install path for `custom_nodes` and workflow-library scanning.
- Server-side Ollama fetches now retry transient network failures/timeouts before falling back between `host.docker.internal` and `localhost`.
- Added focused regression coverage in `imageGeneratorModalUtils.test.ts`, `ollamaServer.test.ts`, and `registry.test.ts`.

Validation notes (2026-04-02):
- Focused tests passed:
  - `npm test -- --runInBand src/components/__tests__/imageGeneratorModalUtils.test.ts src/lib/__tests__/ollamaServer.test.ts src/lib/comfyui/__tests__/registry.test.ts src/components/__tests__/PropertiesPanel.test.tsx src/components/properties/__tests__/SelectionProperties.test.tsx`
- Production build passed:
  - `npm run build`
- Local Docker deployment was refreshed successfully:
  - rebuilt the `image-express` image
  - replaced the `image-express-app` container
  - verified HTTP 200 on port 3000

---

## Latest Delivery (2026-04-01)

- Fixed the AI remove-background selection trap: opening the AI modal now forces the editor canvas back into selectable mode instead of leaving brush/drawing state active, so the prompt to pick a layer is actionable again.
- Updated `StabilityGenerator` to hydrate the current active canvas selection immediately, so remove-background recognizes an already-selected image without requiring the user to reselect it.
- Added regression coverage for the selection-mode reset and immediate-selection hydration in `ImageGeneratorModal.test.tsx` and `StabilityGenerator.test.tsx`.
- Started the Local AI support (Ollama) track with persisted local runtime preferences, a new `/api/ai/ollama/status` probe route, and a Settings-panel health check for base URL/model availability.
- Added regression coverage for the new Ollama settings workflow in `SettingsModal.test.tsx`.
- Started AI critique of image/canvas with a new toolbar-triggered local critique panel that can review either the selected layer or the full canvas using the saved Ollama runtime/model settings.
- Added `/api/ai/ollama/critique` plus shared Ollama helpers for URL normalization, model-list messaging, image payload extraction, and critique prompt construction.
- Added regression coverage for the critique modal and Ollama helpers in `AICritiqueModal.test.tsx`, `Toolbar.test.tsx`, and `ollama.test.ts`.
- Added Comfy workflow library support through `/api/ai/comfy/library`, including server-template discovery, custom workflow-folder scanning, managed repo inspection, and update/install helpers for configured Comfy folders.
- Added same-origin Comfy proxying via `/api/ai/comfy/proxy` with loopback-to-`host.docker.internal` fallback candidates for mixed Docker/host setups.
- Added `ComfyWorkflowLibraryPanel` to surface runnable server/custom workflows directly in the UI.
- Added non-destructive mask gradient utilities and regression coverage so clip masks can use editable linear/radial opacity fades.
- Fixed safe-area media-overlay variant conversion geometry to use the logical frame box rather than the stroked outline, eliminating the 2 px frame inflation that was breaking the editor regression test.

Validation notes (2026-04-01):
- Focused tests passed:
  - `npm test -- --runInBand src/components/__tests__/ImageGeneratorModal.test.tsx src/components/AI/__tests__/StabilityGenerator.test.tsx src/components/__tests__/SettingsModal.test.tsx`
- Focused lint passed:
  - `npm run lint -- src/components/ImageGeneratorModal.tsx src/components/AI/StabilityGenerator.tsx src/components/__tests__/ImageGeneratorModal.test.tsx src/components/AI/__tests__/StabilityGenerator.test.tsx src/components/SettingsModal.tsx src/components/__tests__/SettingsModal.test.tsx src/lib/localAiPreferences.ts src/app/api/ai/ollama/status/route.ts`
- Production build passed:
  - `npm run build`
- Additional critique validation passed:
  - `npm test -- --runInBand src/components/__tests__/AICritiqueModal.test.tsx src/components/__tests__/Toolbar.test.tsx src/lib/__tests__/ollama.test.ts`
  - `npm run lint -- src/components/AICritiqueModal.tsx src/components/Toolbar.tsx src/components/__tests__/AICritiqueModal.test.tsx src/components/__tests__/Toolbar.test.tsx src/lib/ollama.ts src/lib/__tests__/ollama.test.ts src/app/api/ai/ollama/critique/route.ts`
  - `npm run build`
- Full repository validation passed:
  - `npm.cmd test -- --runInBand --ci` -> 57/57 suites passed, 405 tests passed
  - `npm.cmd run build` -> passed
  - `npm.cmd run lint -- .` -> passed with existing warnings only

---

## Latest Delivery (2026-03-01)

- Completed Phase 4 Left-Toolbar Parity: Retouch Group. Added Spot Healing, Remove, Burn, and Sponge tool identities.
- Extended `retouch-engine.ts` base typings and dummy/fallback calibration for new modes.
- Integrated new tools into `Toolbar.tsx`, `CircularContextMenu.tsx`, and `ToolsDropdownMenu.tsx` with proper icons.
- Updated tool checks and UI state handling in `TopToolOptionsBar.tsx`, `RetouchControls.tsx`, `useEditorCanvasRetouchInteractions.ts`, and `editorRetouchUtils.ts` via aliasing to existing logic (dodge/healing base templates).
- Wired top header filter menu shortcuts in `EditorHeaderMenus.tsx` and updated interaction logic to recognize the new modes natively.

- Stabilized canvas initialization in `DesignCanvas`: switched canvas-ready/modified/right-click handlers to ref-backed callbacks and narrowed init-effect dependencies to canvas size inputs, preventing re-init loops and max-update-depth flicker.
- Hardened Google Drive asset listing auth flow: passive `AssetLibrary` fetch now uses non-interactive Drive session refresh and gracefully falls back to local/server assets when user interaction is required.
- Updated `googleDrive` listing default to non-interactive auth for safety, preventing unintended popup-based token requests from background effects.
- Reduced noisy console churn for expected blocked-popup/passive-auth cases during cloud listing attempts in background fetch paths.
- Continued editor modular refactor slices (menu-shell extraction + top-tool-options bridge prop composition) to keep integration files on track for <=500-line goals.

- Completed Media Export Overlay Phase A3: per-frame safe-area guide presets in Export menu, persisted safe-area metadata per frame, and active-frame safe-area guide rendering on canvas overlay.
- Added frame ZIP naming templates (`Frame + Preset`, `Design + Frame + Preset`, `Design + Preset + Date + Frame`) with persisted template preference and template-driven batch export filenames.
- Completed Media Export Overlay Phase A2 in `EditorView`: multi-frame frame-list management, active-frame switching, per-frame include/exclude toggles, and persisted frame collections (`frames` + `activeFrameId`) in local storage.
- Added batch frame export actions in Export menu: `ZIP Selected Frames` and `ZIP All Frames`, reusing existing crop/export pipeline and generating PNG ZIP archives.
- Refactored media overlay orchestration out of `EditorView` into dedicated hook `src/components/Editor/useMediaOverlay.ts` to reduce integration-file bloat and centralize overlay behavior.
- Added focused export regression coverage in `src/components/Editor/__tests__/EditorView.test.tsx` for batch ZIP export flow.
- Completed gradient masks per layer: masked layers now expose linear/radial fade controls in Appearance so clip-path masks can be softened non-destructively without releasing the mask.
- Added refactor slice: extracted crop/eyedropper/zoom top utility state and effects from `EditorView` into `src/components/Editor/useEditorTopCanvasControls.ts`.
- Moved viewport-size and utility-canvas-size synchronization effects into `useEditorTopCanvasControls` and rewired top-bar callbacks to hook handlers.
- Adopted existing `src/components/Editor/useEditorCanvasInteractionEffects.ts` from `EditorView` for gradient drag handlers and media/3D double-click interaction effects.
- Added refactor slice: extracted shape/gradient top-control state-sync and apply handlers from `EditorView` into `src/components/Editor/useEditorShapeGradientControls.ts`.
- Added refactor slice: extracted selection expand/contract top-control handler from `EditorView` into `src/components/Editor/useEditorSelectionModify.ts`.
- Adopted existing `src/components/Editor/useBackgroundJobsStore.ts` + `src/components/Editor/useBackgroundJobPolling.ts` from `EditorView` and removed in-file background-job storage/polling orchestration.
- Added refactor slice: extracted marquee/lasso/wand plus quick-select and selection-brush canvas selection interactions from `EditorView` into `src/components/Editor/useEditorCanvasSelectionInteractions.ts`.
- Added refactor slice: extracted retouch-layer bootstrap/reuse plus healing/clone/history/blur/sharpen/dodge stroke interactions from `EditorView` into `src/components/Editor/useEditorCanvasRetouchInteractions.ts`.
- Added refactor slice: extracted export background detection, viewport reset, and resilient `toDataURL` fallback helpers from `EditorView` into `src/components/Editor/useEditorCanvasExportSupport.ts`.
- Replaced two effect-driven derived states in `EditorView` (`profileSettings`, `apiKeys`) with direct derivation to satisfy current hook lint rules and trim the integration shell further.
- Added refactor slice: extracted shell-level side effects (initial tool, canvas selection/control sync, export outside-click, zoom/hand sync, preview escape, UI preferences) from `EditorView` into `src/components/Editor/useEditorShellEffects.ts`.
- Reduced `src/components/Editor/EditorView.tsx` from 5764 lines to 1337 lines across these refactor slices.

Validation notes (2026-03-01):
- Unit/Integration tests updated to cover dropdown selection checks and top-tool layout validation for new tools.
- Validation rerun: `npm test`, `npm run lint`, and `npm run build` executed successfully tracking zero fatal issues or test failures.

Validation notes (2026-02-27):
- Build passed after latest stability/auth fixes:
  - `npm.cmd run build`
- Focused A3 export tests passed:
  - `npm test -- --runInBand src/components/Editor/__tests__/EditorView.test.tsx -t "exports batch ZIP from media overlay menu|applies media overlay naming template and active-frame safe area controls"`
- Focused export/menu tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|exports PNG without canvas background when toggle is off|exports JSON and HTML bundle from export menu|exports batch ZIP from media overlay menu"`
- Focused crop/eyedropper/zoom tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "applies crop using drag-draft bounds from the workspace|wires crop/eyedropper/zoom/hand top utility controls|samples eyedropper color from clicked scene point"`
- Focused gradient/top-utility regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires top gradient controls and applies gradient config with angle fallback|wires crop/eyedropper/zoom/hand top utility controls|applies crop using drag-draft bounds from the workspace|samples eyedropper color from clicked scene point|handles grid selection, context menu tool trigger, and zoom controls"`
- Focused shape+gradient+utility regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires top shape controls and applies shape style to active shape object|wires top gradient controls and applies gradient config with angle fallback|wires crop/eyedropper/zoom/hand top utility controls|applies crop using drag-draft bounds from the workspace|samples eyedropper color from clicked scene point"`
- Focused shape+gradient+selection-modify run status:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "applies selection expand and contract operations from top controls|wires top shape controls and applies shape style to active shape object|wires top gradient controls and applies gradient config with angle fallback"` -> selection-modify test still fails with the existing missing label query (`Selection modify pixels`), while shape/gradient tests pass.
- Focused background-job-adjacent regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "supports admin actions, server rename fallback, and dirty-design back confirmation|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|opens share flow, launches export quality modal, and downloads export"`
- Focused selection interaction regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "uses marquee drag bounds to select the top-most intersecting object|uses lasso path bounds to select the top-most object inside polygon|routes selection brush interactions through the lasso selection pipeline|uses wand threshold matching and falls back to pointer-hit target when direct target is missing|routes quick selection interactions through the wand selection pipeline"`
- Focused retouch interaction regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "captures clone source point on option-click and updates clone source status|creates and reuses a dedicated retouch layer during retouch strokes|shows retouch unavailable warning when canvas 2D context is not available|falls back to lower-canvas sampling when all-layer snapshot export is unavailable|captures a fresh history source snapshot at each history-brush stroke start"`
- Focused export/save regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "saves successfully when canvas toDataURL throws with missing upper ctx|opens share flow, launches export quality modal, and downloads export|exports PNG without canvas background when toggle is off|exports JSON and HTML bundle from export menu|exports batch ZIP from media overlay menu"`
- Focused shell-side-effect regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "wires crop/eyedropper/zoom/hand top utility controls|opens share flow, launches export quality modal, and downloads export"`
- Lint passed for extracted slice:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorTopCanvasControls.ts src/components/Editor/useEditorCanvasInteractionEffects.ts src/components/Editor/useEditorShapeGradientControls.ts src/components/Editor/useEditorSelectionModify.ts src/components/Editor/useBackgroundJobsStore.ts src/components/Editor/useBackgroundJobPolling.ts`
- Lint passed for latest extraction slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasSelectionInteractions.ts`
- Lint passed for latest retouch extraction slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasRetouchInteractions.ts`
- Lint passed for latest export-support extraction slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasExportSupport.ts`
- Lint passed for latest shell-effects extraction slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorShellEffects.ts`
- Lint passed for A3 slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useMediaOverlay.ts src/components/Editor/useEditorExport.ts src/components/Editor/EditorHeaderActions.tsx src/components/Editor/editorViewConfig.ts src/components/Editor/__tests__/EditorView.test.tsx`
- Build passed:
  - `npm run build`

---

## Previous Delivery (2026-02-25 to 2026-02-26)

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
- [ ] Implement **Media Export Overlay (Phase B)**:
  - [x] Add first-pass `convert active frame to variant` bridge action inside the editor.
  - [ ] Decide whether the bridge should remain an in-editor draft flow or hand off into a dedicated Campaign Workspace later.
  - Keep A1/A2/A3 overlay export path as the canonical lightweight adaptation workflow.

### Media Export Overlay Roadmap (new)
- [x] A1: single frame export from overlay bounds.
- [x] A2: multi-frame management + batch ZIP export.
- [x] A3: safe-area guides + naming templates.
- [x] B1: convert active frame to a preset-sized variant draft in the current editor.
- [ ] B2: optional handoff from the bridge into a future Campaign Workspace model.

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
- [x] Reserved `channels` in the right rail so the later real panel could land without changing the rail taxonomy.
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
- [x] Confirmed remaining placeholders are isolated away from active editor cursor workflows; Channels has now moved beyond the old coming-soon stub into a real MVP panel.

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

Completed in this pass (EditorView export extraction slice):
- [x] Extracted export/share/batch ZIP orchestration from `EditorView.tsx` into `useEditorExport`.
- [x] Extracted export quality modal JSX into `EditorExportQualityModal`.
- [x] Preserved existing export menu behavior (PNG/JPG modal, SVG/PDF/JSON/HTML, ZIP selected/all frames, share flow).
- [x] Reduced `EditorView.tsx` from `7453` to `7081` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "exports batch ZIP from media overlay menu|exports JSON and HTML bundle from export menu|exports PNG without canvas background when toggle is off|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (EditorView persistence extraction slice):
- [x] Extracted save/back/template logic from `EditorView.tsx` into `useEditorPersistence`.
- [x] Moved missing-assets load/resolve state management into `useEditorPersistence` while keeping existing replacement browser flow in `EditorView`.
- [x] Preserved save + Drive backup behavior, unsaved-change back guard, initial design/template loading, and missing-assets resolution behavior.
- [x] Reduced `EditorView.tsx` from `7081` to `6834` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "supports admin actions, server rename fallback, and dirty-design back confirmation|saves a new design and uploads a Drive backup when Drive is connected|stops save when prompt is cancelled for untitled design|shows save failure message when server save fails|saves successfully when canvas toDataURL throws with missing upper ctx|loads initial design from URL and handles load errors|loads template missing assets, replaces with library selection, and resolves"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "exports batch ZIP from media overlay menu|exports JSON and HTML bundle from export menu|exports PNG without canvas background when toggle is off|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (EditorView menu/media hook adoption slice):
- [x] Replaced in-file menu action handlers with `useEditorMenuActions`.
- [x] Replaced in-file media frame-capture handler with `useEditorMediaPreview`.
- [x] Preserved existing top-menu action wiring, layer lock/delete/select menu commands, and media preview capture behavior.
- [x] Reduced `EditorView.tsx` from `6834` to `6703` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|reorders active layer from context menu move-up and send-to-back actions|handles grid selection, context menu tool trigger, and zoom controls"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "supports admin actions, server rename fallback, and dirty-design back confirmation|saves a new design and uploads a Drive backup when Drive is connected|stops save when prompt is cancelled for untitled design|shows save failure message when server save fails|saves successfully when canvas toDataURL throws with missing upper ctx|loads initial design from URL and handles load errors|loads template missing assets, replaces with library selection, and resolves|exports batch ZIP from media overlay menu|exports JSON and HTML bundle from export menu|exports PNG without canvas background when toggle is off|opens share flow, launches export quality modal, and downloads export"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (Editor architecture map + keyboard/title extraction slice):
- [x] Added `docs/component_responsibility_map.md` as the living ownership map for runtime modules across app shell, editor, properties, shared components, libraries, and API routes.
- [x] Added update rules to require map updates on every refactor/new runtime file.
- [x] Extracted keyboard shortcut effect cluster from `EditorView.tsx` into `useEditorKeyboardShortcuts`.
- [x] Extracted design title rename/draft workflow from `EditorView.tsx` into `useEditorDesignTitle`.
- [x] Reduced `EditorView.tsx` from `6703` to `6549` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "closes open menus on Escape|supports move, wand, quick-select, selection brush, healing, history brush, blur, dodge, clone stamp, marquee, lasso, and path-select keyboard aliases|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|reorders active layer from context menu move-up and send-to-back actions|handles grid selection, context menu tool trigger, and zoom controls|supports admin actions, server rename fallback, and dirty-design back confirmation|supports server-backed rename success flow"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "saves a new design and uploads a Drive backup when Drive is connected|stops save when prompt is cancelled for untitled design|shows save failure message when server save fails|saves successfully when canvas toDataURL throws with missing upper ctx|opens share flow, launches export quality modal, and downloads export|exports PNG without canvas background when toggle is off|exports JSON and HTML bundle from export menu|exports batch ZIP from media overlay menu|loads initial design from URL and handles load errors|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (Editor menu-state hook adoption follow-up):
- [x] Replaced in-file menu boolean state + menu open/close/toggle callbacks in `EditorView.tsx` with `useEditorMenus`.
- [x] Preserved top-nav menu interactions, export/share/grid menu behavior, and Escape close behavior via `useEditorKeyboardShortcuts`.
- [x] Reduced `EditorView.tsx` from `6549` to `6503` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "closes open menus on Escape|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports move, wand, quick-select, selection brush, healing, history brush, blur, dodge, clone stamp, marquee, lasso, and path-select keyboard aliases|supports admin actions, server rename fallback, and dirty-design back confirmation|supports server-backed rename success flow|opens share flow, launches export quality modal, and downloads export"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (Editor layer-order + text-controls extraction slice):
- [x] Moved layer reorder state/action logic out of `EditorView.tsx` into `useEditorMenuActions` (`getActiveLayerOrderState`, `handleLayerOrderAction`).
- [x] Added `useEditorTextControls` and moved text top-bar/quick-bar state, selection sync effects, and text mutation handlers out of `EditorView.tsx`.
- [x] Rewired `EditorView` consumers (`TopToolOptionsBar`, `TextQuickBar`, eyedropper sampled-color sync) to use the new text-controls hook.
- [x] Reduced `EditorView.tsx` from `6503` to `6128` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorMenuActions.ts src/components/Editor/useEditorTextControls.ts`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "reorders active layer from context menu move-up and send-to-back actions|closes open menus on Escape|supports move, wand, quick-select, selection brush, healing, history brush, blur, dodge, clone stamp, marquee, lasso, and path-select keyboard aliases"`
  - `npm run build`
  - Note: full `EditorView.test.tsx` run currently reports 3 unrelated top-control interaction failures (`Select feather`, `Selection modify pixels`, `Text font family`) plus expected jsdom `canvas.getContext` console noise in sampled-color tests.

Completed in this pass (Editor history hook extraction follow-up):
- [x] Added `useEditorHistory` and moved snapshot/history stack management (`pushHistory`, `resetHistory`, undo/redo, duplicate) out of `EditorView.tsx`.
- [x] Removed in-file history refs/state (`undoStackRef`, `redoStackRef`, `historyReadyRef`, `historyState`) from `EditorView` and rewired consumers to hook outputs.
- [x] Preserved existing keyboard/menu/history command wiring and persistence integration (`useEditorPersistence` continues consuming `resetHistory` + `historyReadyRef`).
- [x] Reduced `EditorView.tsx` from `6128` to `6021` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorMenuActions.ts src/components/Editor/useEditorTextControls.ts src/components/Editor/useEditorHistory.ts`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports move, wand, quick-select, selection brush, healing, history brush, blur, dodge, clone stamp, marquee, lasso, and path-select keyboard aliases|closes open menus on Escape"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx` (still shows the same 3 top-control test failures: `Select feather`, `Selection modify pixels`, `Text font family`, plus expected jsdom `canvas.getContext` console noise in sampled-color flow)
  - `npm run build`

Completed in this pass (Editor panel-state hook adoption slice):
- [x] Replaced in-file panel state/handler block in `EditorView.tsx` with `useEditorPanelState` (`dock`, `collapse`, `float`, `resize`, `window panel toggle`).
- [x] Preserved window menu panel controls, dock-mode switching, floating panel drag behavior, and panel resize interactions.
- [x] Reduced `EditorView.tsx` from `6021` to `5888` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorPanelState.ts`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|closes open menus on Escape|reorders active layer from context menu move-up and send-to-back actions"`
  - `npm run build`

Completed in this pass (Editor asset/canvas action hook adoption slice):
- [x] Added `useEditorCanvasAssetActions` and moved in-file handlers from `EditorView.tsx`:
  - `handleAssetSelect`
  - `handleFileDrop`
  - `handleCanvasModified`
  - `handleRightClick`
- [x] Preserved existing asset library insert behavior, drag-drop upload-to-canvas flow, canvas dirty/history update, and context-menu open behavior.
- [x] Reduced `EditorView.tsx` from `5888` to `5781` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasAssetActions.ts`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|reorders active layer from context menu move-up and send-to-back actions|supports admin actions, server rename fallback, and dirty-design back confirmation|loads template missing assets, replaces with library selection, and resolves|opens share flow, launches export quality modal, and downloads export"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx` (still the same known 3 failures: `Select feather`, `Selection modify pixels`, `Text font family`, plus expected jsdom `canvas.getContext` console noise)
  - `npm run build`

Completed in this pass (Editor menu-open state simplification follow-up):
- [x] Replaced manual `hasOpenMenu` boolean aggregation in `EditorView` with `isAnyEditorMenuOpen` from `useEditorMenus`.
- [x] Removed one unused `showToolsMenu` destructure path in `EditorView`.
- [x] Reduced `EditorView.tsx` from `5781` to `5764` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "closes open menus on Escape|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions"`
  - `npm run build`

Completed in this pass (Editor header actions component extraction slice):
- [x] Added `src/components/Editor/EditorHeaderActions.tsx` to own header action UI concerns previously embedded in `EditorView`:
  - Active palette color chips
  - Grid menu
  - Share menu
  - Export menu + media-overlay frame controls
  - Profile button trigger/avatar
- [x] Replaced in-file header action JSX block in `EditorView.tsx` with `EditorHeaderActions` component wiring.
- [x] Reduced `EditorView.tsx` from `4235` to `4063` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorHeaderActions.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "supports admin actions, server rename fallback, and dirty-design back confirmation|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|opens share flow, launches export quality modal, and downloads export"`
  - `npm run build`

Completed in this pass (Editor overlays/modals component extraction slice):
- [x] Added `src/components/Editor/EditorViewOverlays.tsx` to own overlay/modal composition concerns previously embedded in `EditorView`:
  - `GridOverlay` + `GradientControls`
  - `UserProfileModal`
  - Missing-assets replacement flow (`AssetLibrary` + `MissingAssetsModal`)
  - Media preview player modal
  - `EditorExportQualityModal`
- [x] Replaced in-file overlay/modal JSX block in `EditorView.tsx` with `EditorViewOverlays` component wiring.
- [x] Reduced `EditorView.tsx` from `4063` to `3987` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "supports admin actions, server rename fallback, and dirty-design back confirmation|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|opens share flow, launches export quality modal, and downloads export|exports batch ZIP from media overlay menu|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor top-nav menus component extraction slice):
- [x] Added `src/components/Editor/EditorHeaderMenus.tsx` to own top header menu cluster concerns previously embedded in `EditorView`:
  - File, Edit, Image, Layer, Select, Filter, View, Window, Settings, Help menus
  - Window panel dock/float/collapse toggles
  - Existing layer order, selection modify, zoom/view, and settings/help menu commands
- [x] Replaced in-file top-nav menu JSX block in `EditorView.tsx` with `EditorHeaderMenus` component wiring.
- [x] Reduced `EditorView.tsx` from `3987` to `3437` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|exports batch ZIP from media overlay menu|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor header primary component extraction slice):
- [x] Added `src/components/Editor/EditorHeaderPrimary.tsx` to own the remaining left header cluster previously embedded in `EditorView`:
  - Brand mark + editable document title
  - Hub/back action
  - Top-menu expand/collapse toggle button
- [x] Replaced in-file header primary JSX block in `EditorView.tsx` with `EditorHeaderPrimary` component wiring.
- [x] Reduced `EditorView.tsx` from `3437` to `3400` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|exports batch ZIP from media overlay menu|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor top tool options bridge extraction slice):
- [x] Added `src/components/Editor/EditorTopToolOptionsBridge.tsx` to own the large grouped `TopToolOptionsBar` wiring previously embedded in `EditorView`.
- [x] Moved top-bar prop grouping, value normalization, and tool-trigger/event bridging into the new component while preserving the existing `TopToolOptionsBar` render surface.
- [x] Reduced `EditorView.tsx` from `3400` to `3308` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "wires top pen path/shape toggle to pen config events|wires top shape controls and applies shape style to active shape object|wires top gradient controls and applies gradient config with angle fallback|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor properties panels extraction slice):
- [x] Added `src/components/Editor/EditorPropertiesPanels.tsx` to own docked/collapsed/floating panel chrome and shared `PropertiesPanel` composition previously embedded in `EditorView`.
- [x] Replaced the in-file left/right/floating properties panel JSX in `EditorView.tsx` with `EditorPropertiesPanels` placements around the main canvas.
- [x] Reduced `EditorView.tsx` from `3308` to `3190` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorPropertiesPanels.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "wires top pen path/shape toggle to pen config events|wires top shape controls and applies shape style to active shape object|wires top gradient controls and applies gradient config with angle fallback|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor canvas workspace extraction slice):
- [x] Added `src/components/Editor/EditorCanvasWorkspace.tsx` to own the central workspace render tree previously embedded in `EditorView`.
- [x] Moved the main canvas stage, drag/drop dock zones, 3D overlays, text quick bar, lock overlays, cursor preview, and bottom-right utility cluster out of `EditorView.tsx`.
- [x] Kept canvas/3D state ownership in `EditorView` and replaced inline workspace callbacks with named handlers before passing them into `EditorCanvasWorkspace`.
- [x] Reduced `EditorView.tsx` from `3190` to `3101` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorCanvasWorkspace.tsx src/components/Editor/EditorPropertiesPanels.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "handles grid selection, context menu tool trigger, and zoom controls|renders brush cursor preview for paint-size tools and clears on mouse out|renders eyedropper target cursor preview when eyedropper is active|shows a corner lock badge for locked layers and unlocks from canvas|shows only one unlock lock control when selected layer is locked|unlocks a locked child layer inside a group from the canvas lock badge click|opens share flow, launches export quality modal, and downloads export|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor workspace shell + 3D hook extraction slice):
- [x] Added `src/components/Editor/EditorWorkspaceShell.tsx` to own the outer workspace composition previously embedded in `EditorView`:
  - left tool rail
  - before/after workspace panel slots
  - `JobStatusFooter`
  - `CircularContextMenu`
- [x] Added `src/components/Editor/useEditorThreeDWorkspace.ts` to own 3D workspace state and handlers previously embedded in `EditorView`:
  - 3D generator/editor launch state
  - serializable layer-preview derivation for 3D source picking
  - insert/save/recover background-job flows
  - toolbar and panel entry handlers for 3D mode
- [x] Rewired `EditorView.tsx` to consume `EditorWorkspaceShell` and `useEditorThreeDWorkspace` while preserving existing panel, menu, lock-badge, and export behavior.
- [x] Reduced `EditorView.tsx` from `3101` to `2934` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorThreeDWorkspace.ts src/components/Editor/EditorWorkspaceShell.tsx src/components/Editor/EditorCanvasWorkspace.tsx src/components/Editor/EditorPropertiesPanels.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "handles grid selection, context menu tool trigger, and zoom controls|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|loads template missing assets, replaces with library selection, and resolves|shows a corner lock badge for locked layers and unlocks from canvas"`
  - `npm run build`

Completed in this pass (Editor canvas overlay hook extraction slice):
- [x] Added `src/components/Editor/useEditorCanvasOverlayState.ts` to own canvas overlay state and effects previously embedded in `EditorView`:
  - context menu open/close state
  - lock-badge overlay state and canvas sync
  - cursor-preview state and pointer tracking
  - canvas lock/unlock mutation helper used by menus and overlays
- [x] Rewired `EditorView.tsx` to consume `useEditorCanvasOverlayState` and removed the in-file context-menu, lock-badge, and cursor-preview state/effect blocks.
- [x] Reduced `EditorView.tsx` from `2934` to `2553` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasOverlayState.ts src/components/Editor/useEditorThreeDWorkspace.ts src/components/Editor/EditorWorkspaceShell.tsx src/components/Editor/EditorCanvasWorkspace.tsx src/components/Editor/EditorPropertiesPanels.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "renders brush cursor preview for paint-size tools and clears on mouse out|renders eyedropper target cursor preview when eyedropper is active|shows a corner lock badge for locked layers and unlocks from canvas|shows only one unlock lock control when selected layer is locked|unlocks a locked child layer inside a group from the canvas lock badge click|handles grid selection, context menu tool trigger, and zoom controls|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions"`
  - `npm run build`

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
- [x] Gradient masks per layer
- [x] Local AI support (Ollama): runtime preferences, status probe, critique route, and first-pass image-generation provider wiring are complete
- [~] AI critique of image/canvas: toolbar modal + local route implemented, with runtime preflight/setup messaging in place; interactive QA still pending
- [ ] Direct social media posting integrations
- [x] In-profile change password
- [ ] Import/export asset library
- [ ] Additional online storage providers
- [~] Channel editing panel MVP (rows/previews/isolate/invert/mask/value edits plus luminosity and per-channel opacity complete; advanced channel workflows still pending)
- [x] Google, Banana.dev, and NanoBanana runtime branches are now wired into the shared generation and agentic edit flows
- [ ] Facebook sign-in/auth integration

---

## Current Recommended Next Step
Proceed with **interactive Ollama QA + Media Overlay follow-through**:
- [~] Route-level Ollama QA is now scripted through `npm run qa:ollama` and verified against the running app.
- [ ] Run an interactive QA pass on the critique modal with at least one vision-capable Ollama model and tune the critique prompt/output shape.
- [ ] Run a hands-on QA pass on the Ollama SVG generation path with the saved local runtime/model settings, then decide whether the local path stays SVG-first or later graduates to a richer local-image orchestration flow.

Media Export Overlay Phase B remains open for QA/decision follow-through:
- [~] Browser export and variant-draft QA are now formalized through `npm run qa:overlay`.
- [ ] Validate the new variant-draft save flow against real design sessions.
- [ ] Decide whether the bridge stays as an in-editor draft flow or expands into a dedicated Campaign Workspace later.

Provider follow-through is now implementation-complete:
- [x] Google Gemini shared generation route
- [x] Banana.dev shared generation route via server-configured Banana endpoint
- [x] NanoBanana agentic edit provider integration
- [ ] Run live QA against a real Banana endpoint deployment once server env is configured

---

## Files This Consolidates
- `docs/imageprocessingui_upgrade_execution_checklist.md` (archived pointer)
- `docs/feature_implementation_tracker.md`
- `docs/chat_continuation_handoff_2026-02-23.md`

These files remain useful for detail/history, but all progress tracking must happen in this file.
