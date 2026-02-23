# Feature Implementation Tracker

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
| 23 | Fix Inconsistent Layer Locking/Visibility (Eye/Lock icons) | Done | src/components/PropertiesPanel.tsx | - | - | Fixed `obj.group.dirty` flag to ensure UI updates during visibility toggles. |
| 24 | ability to duplicate layers on the canvas | Done | src/components/Editor/EditorView.tsx, src/components/properties/LayersView.tsx, src/components/PropertiesPanel.tsx | Warnings | Pass | Added Ctrl+D shortcut and Duplicate button in Layers panel |
| 25 | add new guide to the guide list, that size of the canvas, like border, that overlay on top | Done | src/components/GridOverlay.tsx, src/components/Editor/EditorView.tsx | Warnings | Pass | Added 'Canvas Border' grid option |
| 26 | when exporting image give options on what compression quality it should be, as jpg , png. | Done | src/components/Editor/EditorView.tsx | Warnings | Pass | Prompt for quality (1-100) before export for PNG/JPG |
| 27 | allow drag and drop assets from computer desktop to the canvas and auto upload them and use | Done | src/components/Editor/EditorView.tsx, src/types.ts | Warnings | Pass | Drag & Drop files (img/model) to canvas triggers upload & add |
| 28 | Pen Options Squeeshed on Toolbar | Done | src/components/Toolbar.tsx | - | - | Removed embedded Pen options from Left Toolbar (Already present in Right Sidebar) |
| 29 | Reference design upgrade program (menus/submenus/properties/tools) | In Progress (Phase 1 MVP + C2/C3 complete) | src/components/Editor/TopToolOptionsBar.tsx, src/components/Editor/EditorView.tsx, src/components/Editor/__tests__/TopToolOptionsBar.test.tsx, src/components/Editor/__tests__/EditorView.test.tsx, docs/imageprocessingui_upgrade_execution_checklist.md | Pass | Pass | Added TopToolOptionsBar MVP command layer, implemented C2 select controls, and implemented C3 brush/paint quick controls (preset, size, hardness, opacity, flow, smoothing, blend mode) with Fabric brush wiring and updated tests. Also scoped lint/build to ignore `Imageprocessingui/**` reference repo via eslint/tsconfig. |


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
