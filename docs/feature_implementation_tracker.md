# Feature Implementation Tracker

Canonical progress file: [docs/unified_progress_status.md](docs/unified_progress_status.md)

**Purpose:** Track requested features, verify existing functionality before each change, and record lint/build results per feature.

## Process Checklist (Do this before each feature)
1. Review current functionality: [docs/functionality_reference.md](docs/functionality_reference.md)
2. Review refactoring notes: [docs/refactoring_tracking.md](docs/refactoring_tracking.md)
3. Identify files impacted by the feature
4. Implement feature
5. Run `npm run lint`
6. Run `npm run build`
7. Update this tracker with results

---

## Requested Features

| # | Feature | Status | Primary Files | Lint | Build | Notes |
|---|---------|--------|---------------|------|-------|-------|
| 1 | User profile modal (image upload, scale/resize, email, display name, info embed, embed toggle) | Done | src/components/UserProfileModal.tsx, src/components/Editor/EditorView.tsx, src/components/Toolbar.tsx, src/lib/profile-utils.ts | Warnings | Pass | Avatar button opens modal; embed info applied in exports/templates |
| 2 | Layer Grouping (Drag into Folder, Drag out of Folder) | Done | src/components/PropertiesPanel.tsx, src/components/properties/LayersView.tsx, src/lib/fabric-utils.ts | Warnings | Pass | Implemented recursive `handleReorder` and `handleAddToFolder`. |
| 3 | Curves Adjustment UI Fix | Done | src/components/properties/AdjustmentControls.tsx | Warnings | Pass | Added numeric inputs for point coordinates and fixed channel handling. |
| 4 | Fix Shapes Border Clipping & 3D Generation Flow | Done | src/components/PropertiesPanel.tsx, src/components/Editor/EditorView.tsx, src/types.ts | Warnings | Pass | Disabled objectCaching for borders; Auto-capture selection for 3D Gen. Fixed `clipped` type error. |
| 2 | Mark exports if generative AI used | Done | src/components/Editor/EditorView.tsx, src/components/ImageGeneratorModal.tsx, src/components/Toolbar.tsx, src/types.ts | Warnings | Pass | Adds export overlay text when AI-generated content present |
| 3 | Canvas always bottom layer, non-selectable; size/aspect only | Done | src/components/DesignCanvas.tsx, src/components/PropertiesPanel.tsx | Warnings | Pass | Artboard excluded from layers and locked to back |
| 4 | Painter tool rework: single layer per session; reuse when reselected | Done | src/components/properties/PaintProperties.tsx | Warnings | Pass | Paint Layer created per session; selected Paint Layer reused |
| 5 | Undo/Redo | Done | src/components/Editor/EditorView.tsx | DONE  | - | History stack with keyboard shortcuts + header buttons |
| 6 | Video preview + frame grab as image | Done | src/components/Editor/EditorView.tsx | DONE | - | Media preview modal now captures current video frame to canvas |
| 7 | Image clipping (Photoshop-style; top clipped to below) | Done | src/components/PropertiesPanel.tsx, src/components/properties/SelectionProperties.tsx | - | Need implement | Parenting, adjustment layer only effect one layer bellow, when they linked |
| 8 | More primitives (arrow, speech bubble) | Done | src/components/Toolbar.tsx | DONE | - | Added Arrow + Speech Bubble shapes |
| 9 | Vector masks (draw shape, use as mask/clip, fill/gradient) | Done | src/components/Toolbar.tsx, src/components/PropertiesPanel.tsx | Pass | Pass | Pen Tool creates layers; Auto-close on start point click; Masking uses any shape |
| 10 | Gradient masks per layer | Not started | src/components/PropertiesPanel.tsx, src/components/properties/LayerEffectsProperties.tsx | - | - | |
| 11 | More text effects | Not started | src/components/properties/TextProperties.tsx | - | - | |
| 11.1 | Text effects pack (shadow, stroke, glow, highlight, gradient, sticker, texture, readability) | Done | src/components/properties/TextEffectsProperties.tsx, src/components/properties/SelectionProperties.tsx, src/components/PropertiesPanel.tsx | Warnings | Pass | Refactored UI to Vertical stack with individual toggles and inline configuration panels, matching Shadow/Stroke UI style. |
| 12 | Send canvas to AI for processing | Done | src/components/AI/StabilityGenerator.tsx | Warnings | Pass | Added "Use Full Canvas" option in Img2Img tab (Also supports resize property window) |
| 13 | Local AI support (Ollama) | Not started | src/app/api/ai/*, src/components/SettingsModal.tsx | - | - | |
| 14 | AI critique of image/canvas | Not started | src/app/api/ai/*, src/components/Toolbar.tsx | - | - | |
| 15 | Social media posting | Not started | src/components/SettingsModal.tsx, src/app/api/* | - | - | |
| 16 | User registration | Not started | src/components/LoginModal.tsx, src/app/api/user/* | - | - | |
| 17 | Reset password + change password in profile | Not started | src/components/LoginModal.tsx, src/components/UserProfileModal.tsx, src/app/api/user/* | - | - | |
| 18 | Import/export asset library | Not started | src/components/AssetLibrary.tsx, src/app/api/assets/* | - | - | |
| 19 | Online storage integration | Not started | src/components/SettingsModal.tsx, src/app/api/* | - | - | |
| 20 | Curves window scalable; must affect layers below or clipped | Done | src/components/properties/AdjustmentControls.tsx, src/components/PropertiesPanel.tsx | Pass | Pass | Scalable UI; Clipped/Global application logic. Added `clipped` metadata in `handleCreateClip`. |
| 21 | Warning on unsaved changes | Done | src/components/Editor/EditorView.tsx | Warnings | Pass | Restored native "BeforeUnload" + Custom In-App dialog |
| 22 | Canvas sizes presets (2:3, 3:2, etc) | Done | src/components/properties/CanvasSettingsPanel.tsx | Warnings | Pass | Added requested presets + manual entry |
| 23 | Fix Inconsistent Layer Locking/Visibility (Eye/Lock icons) | Done | src/components/PropertiesPanel.tsx, src/components/Editor/EditorView.tsx, src/components/Editor/__tests__/EditorView.test.tsx | Pass | Pass | Fixed `obj.group.dirty` visibility refresh path and added on-canvas lock badge unlock workflow (including grouped child-layer lock badges + hover outline feedback). |
| 24 | ability to duplicate layers on the canvas | Done | src/components/Editor/EditorView.tsx, src/components/properties/LayersView.tsx, src/components/PropertiesPanel.tsx | Warnings | Pass | Added Ctrl+D shortcut and Duplicate button in Layers panel |
| 25 | add new guide to the guide list, that size of the canvas, like border, that overlay on top | Done | src/components/GridOverlay.tsx, src/components/Editor/EditorView.tsx | Warnings | Pass | Added 'Canvas Border' grid option |
| 26 | when exporting image give options on what compression quality it should be, as jpg , png. | Done | src/components/Editor/EditorView.tsx | Warnings | Pass | Prompt for quality (1-100) before export for PNG/JPG |
| 27 | allow drag and drop assets from computer desktop to the canvas and auto upload them and use | Done | src/components/Editor/EditorView.tsx, src/types.ts | Warnings | Pass | Drag & Drop files (img/model) to canvas triggers upload & add |
| 28 | Pen Options Squeeshed on Toolbar | Done | src/components/Toolbar.tsx | - | - | Pen controls are consolidated to the left/tool side; right-rail Pen duplication removed. |
| 29 | Reference design upgrade program (menus/submenus/properties/tools) | In Progress (Phase 1 MVP + C2/C3/C4/C5/C6/C7/C8 complete + D1/D2/D3/D4 complete + E1 aliases complete + E2 selection stack complete (marquee/lasso/wand/selection modify) + E3 healing/clone bootstrap slice complete + F utility cluster complete + B1/B2/B7/B8 menu shells complete) | src/components/Editor/TopToolOptionsBar.tsx, src/components/Editor/EditorView.tsx, src/components/Toolbar.tsx, src/components/DesignCanvas.tsx, src/components/CircularContextMenu.tsx, src/components/DocumentationModal.tsx, src/components/PropertiesPanel.tsx, src/components/properties/LayersView.tsx, src/components/properties/SelectionProperties.tsx, src/components/properties/PanelModeRail.tsx, src/components/properties/PanelUtilityViews.tsx, src/components/__tests__/PropertiesPanel.test.tsx, src/components/__tests__/Toolbar.test.tsx, src/components/properties/__tests__/LayersView.test.tsx, src/components/properties/__tests__/SelectionProperties.test.tsx, src/components/properties/__tests__/PanelModeRail.test.tsx, src/components/Editor/__tests__/TopToolOptionsBar.test.tsx, src/components/Editor/__tests__/EditorView.test.tsx | Pass | Pass | Added TopToolOptionsBar MVP command layer and completed C2/C3/C4/C5 controls. Completed C6 shape/rectangle controls in top options: Shape/Path/Pixels mode toggles, fill/stroke shortcuts, stroke-width control, fixed-size toggle, and wiring through shape config event + active object mutation paths. Completed C7 gradient family controls in top options: type switching (Linear/Radial/Angle), blend/opacity/reverse/dither wiring, angle fallback via metadata hint, and gradient drag behavior updates that honor top settings safely. Completed C8 utility controls: crop ratio/options apply flow, eyedropper sample size/source with safe sampling fallback, zoom mode/step + fit/reset controls, and hand pan-lock behavior wiring. Completed D1 rail taxonomy expansion with persisted panel-mode state: added `color`/`swatches`/`brushes`/`channels`/`adjustments` rail modes, implemented a real `brushes` controls panel wired to editor paint state, and kept unsupported surfaces explicit. Added D2 color-system tabs (RGB/HSB/CMYK/Lab) in selection Fill workflow while preserving existing `ColorPicker` palette/harmony behavior and fill mutation pipeline. Added D3 categorized adjustment launcher with reference-style naming, wired through existing `adjustment:create` path, and selected-adjustment quick type controls while keeping `AdjustmentControls` + filter/clipping logic as single mutation path. Completed D4 panel organization follow-through: added panel shortcuts for `history`/`navigator`/`info` with persisted rail mode, wired History to live undo/redo stack counts + actions, and wired Navigator/Info to real canvas/editor state (zoom, dimensions, object/selection/tool stats). Completed E1 alias identity pass: Move naming alias over Select, Path Select alias routing, and keyboard alias wiring (`V`/`A`) with docs updates. Completed F bottom-right utility upgrade: moved zoom controls to a bottom-right utility cluster, added zoom/canvas/grid status chips with overlap-aware placement, removed duplicate right-side pen panel routing (`activeTool === 'pen'`), and removed right-rail `paths` mode so pen remains left-side only. Completed B1/B2/B7 initial menu-shell pass: File/Edit/View dropdowns wired to existing save/export/history/preferences/zoom/grid actions with no placeholder commands. Added E2 rectangular marquee slice: left-rail marquee tool, tools-menu + keyboard alias (`M`), and drag-box selection commit (Layer/Group modes) in editor. Added E2 lasso slice: left-rail lasso tool, tools-menu + keyboard alias (`L`), polygon capture with commit/cancel flow, and lasso selection commit (Layer/Group modes). Added E2 magic wand bootstrap slice: left-rail wand tool, `W` alias, threshold top-option control, and safe fallback target selection when direct hit/color matching is unavailable. Added E2 selection modify slice: top-bar modify radius + expand/contract controls with selection-bounds mutation logic and guarded contraction fallback. Added E3 healing/clone bootstrap slice: left-rail tool identities, tool-menu entries + keyboard aliases (`J`/`S`), top-option scaffolding, clone source-point capture (`Option`-click), and safe no-op fallback behavior while raster retouch mutation path is pending. Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`. |
| 30 | Raster brush engine consolidation (Pencil/Oil/Watercolor in one engine) | Done | src/lib/raster-engine.ts, src/components/Editor/EditorView.tsx, src/components/Toolbar.tsx, src/components/PropertiesPanel.tsx, src/components/properties/PanelUtilityViews.tsx, src/components/Editor/TopToolOptionsBar.tsx, src/components/__tests__/Toolbar.test.tsx, src/components/__tests__/PropertiesPanel.test.tsx, src/components/Editor/__tests__/TopToolOptionsBar.test.tsx, src/components/Editor/__tests__/EditorView.test.tsx | Pass | Pass | Added dedicated shared raster engine utility for brush creation/drawing-mode setup and unified `Pencil`/`Spray`/`Oil`/`Watercolor` presets through that engine. Restored left-rail `Pen` as the vector curves/path tool (with top pen path options + `pen:config:set` event flow), and kept `Pencil` strictly as a brush preset. Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/__tests__/PropertiesPanel.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`. |
| 31 | E3 History Brush bootstrap identity + safe fallback | Done | src/components/Editor/top-tool-options/RetouchControls.tsx, src/components/Editor/TopToolOptionsBar.tsx, src/components/Editor/EditorView.tsx, src/components/Editor/ToolsDropdownMenu.tsx, src/components/Toolbar.tsx, src/components/Editor/__tests__/TopToolOptionsBar.test.tsx, src/components/Editor/__tests__/EditorView.test.tsx, src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx, src/components/__tests__/Toolbar.test.tsx, docs/unified_progress_status.md | Pass | Pass | Added `history-brush` across left rail, tools menu, and keyboard alias (`Y`), added top-option controls (size/hardness/sample), and wired safe no-op canvas behavior while raster history replay engine work remains pending. Validation rerun: `npm test -- src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx src/components/__tests__/Toolbar.test.tsx --watch=false`, `npm run lint`, `npm run build`. |
| 32 | E3 Blur + Dodge bootstrap identities + safe fallback | Done | src/components/Editor/top-tool-options/RetouchControls.tsx, src/components/Editor/TopToolOptionsBar.tsx, src/components/Editor/EditorView.tsx, src/components/Editor/ToolsDropdownMenu.tsx, src/components/Toolbar.tsx, src/components/Editor/__tests__/TopToolOptionsBar.test.tsx, src/components/Editor/__tests__/EditorView.test.tsx, src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx, src/components/__tests__/Toolbar.test.tsx, docs/unified_progress_status.md | Pass | Pass | Added `blur` and `dodge` tool identities across left rail/tools menu/keyboard aliases (`B`/`O`), added top-option scaffolding (blur: size/strength/sample; dodge: size/exposure/protect tones), and wired safe no-op canvas behavior while real raster mutation integration remains pending. Validation rerun: `npm test -- src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx src/components/__tests__/Toolbar.test.tsx --watch=false`, `npm run lint`, `npm run build`. |
| 33 | E3 first-pass real raster retouch mutation engine | Done | src/lib/retouch-engine.ts, src/lib/__tests__/retouch-engine.test.ts, src/components/Editor/EditorView.tsx, src/components/Editor/__tests__/EditorView.test.tsx, src/types.ts, docs/unified_progress_status.md | Pass | Pass | Added dedicated retouch-layer mutation flow (clone/healing/history/blur/dodge) with interpolated stroke stamping, soft mask brushes, clone source alignment support, and history-source capture for restoration strokes. Added custom serialization support for retouch-layer identity and regression tests for retouch-layer creation/reuse + unavailable-context behavior, plus unit coverage for retouch utility math/helpers. Validation rerun: `npm test -- src/lib/__tests__/retouch-engine.test.ts src/components/Editor/__tests__/EditorView.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx src/components/__tests__/Toolbar.test.tsx --watch=false`, `npm run lint`, `npm run build`. |


---

## Current Requirements Summary (for continuity after crashes)

The following items were explicitly requested and are tracked above. Use this section as the canonical reminder list for future sessions:

### Implemented
- **User profile modal** with image upload, scale/resize, email, display name, personal info, and embed toggle.
- **AI usage label** on exports when generative AI assets are used.
- **Canvas artboard** locked to bottom layer, non-selectable, size/aspect only.
- **Painter tool** rework: single paint layer per session; reuse when reselected.
- **Undo/Redo** with history stack, header buttons, and keyboard shortcuts.
- **More primitives**: Arrow and Speech Bubble shapes in Shapes menu.
- **Video preview + frame grab**: capture current video frame to canvas from preview modal.
- **Photoshop-style clipping**: Clip action (top clipped to below) for 2-object selection.

### Not Yet Implemented
- Vector masks (draw shape, use as mask/clip, fill/gradient).
- Gradient masks per layer.
- More text effects.
- Send canvas to AI for processing.
- Local AI support (Ollama).
- AI critique of image/canvas.
- Social media posting.
- User registration.
- Reset password + change password in profile.
- Import/export asset library.
- Online storage integration.
- Curves window scalable and must affect layers below or clipped.


## Notes
- Track per-feature lint/build results in the table above.
- If a feature requires API keys or external services, document the config changes here.
