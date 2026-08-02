# Component Responsibility Map

## Purpose
This document is the living ownership map for runtime files.
Use it before adding features/refactoring so changes go to the correct module.

## Update Rule (Required)
- Any refactor that moves logic between files must update this map in the same PR.
- Any new runtime file must be added here with a one-line responsibility.
- Test-only files are intentionally excluded from this map.

## App Shell
| File | Responsibility |
|---|---|
| `src/app/layout.tsx` | Global app layout, providers mounting point, shared page shell. |
| `src/app/page.tsx` | Main page composition and top-level app entry UI. |
| `src/app/globals.css` | Global CSS foundation and utility-level defaults. |
| `src/app/ui-theme.css` | Theme tokens/variables and theme utility styling. |
| `src/app/icon.svg`, `src/app/favicon.ico` | Browser/app icon assets. |

## Providers
| File | Responsibility |
|---|---|
| `src/providers/DialogProvider.tsx` | Central confirm/prompt/alert dialog API and modal rendering. |
| `src/providers/ToastProvider.tsx` | Global toast API and toast stack rendering. |

## Editor Domain (Primary Runtime)
| File | Responsibility |
|---|---|
| `src/components/Editor/EditorView.tsx` | Main editor integration shell: composes canvas, menus, panels, toolbars, and feature hooks. |
| `src/components/Editor/TopToolOptionsBar.tsx` | Top contextual controls host for active tool options. |
| `src/components/Editor/TopToolOptionsBar.types.ts` | Shared types/contracts for top tool options bar props. |
| `src/components/Editor/TextQuickBar.tsx` | Floating quick text controls near active text object. |
| `src/components/Editor/ToolsDropdownMenu.tsx` | Secondary tools dropdown command surface. |
| `src/components/Editor/EditorExportQualityModal.tsx` | Export quality modal UI (PNG/JPG quality + background toggle). |
| `src/components/Editor/EditorHeaderPrimary.tsx` | Header primary cluster UI (brand/title rename, hub action, top-menu toggle) extracted from `EditorView`. |
| `src/components/Editor/EditorHeaderMenus.tsx` | Top header menu cluster UI (`File/Edit/Image/Layer/Select/Filter/View/Window/Settings/Help`) extracted from `EditorView`. |
| `src/components/Editor/EditorHeaderActions.tsx` | Header action cluster UI (active palette, grid/share/export menus, profile trigger) extracted from `EditorView`. |
| `src/components/Editor/EditorViewOverlays.tsx` | Overlay/modal composition block (grid/gradient overlays, profile modal, missing-assets flow, media preview, export quality modal) extracted from `EditorView`. |
| `src/components/Editor/EditorTopToolOptionsBridge.tsx` | Bridge adapter that groups `EditorView` state/handlers and normalizes top tool options wiring into `TopToolOptionsBar`. |
| `src/components/Editor/EditorPropertiesPanels.tsx` | Properties panel shell that owns docked/collapsed/floating panel chrome and shared `PropertiesPanel` wiring extracted from `EditorView`. |
| `src/components/Editor/EditorCanvasWorkspace.tsx` | Main canvas workspace shell: drag/drop stage, 3D overlays, text quick bar, lock badges, cursor preview, and bottom-right utility cluster extracted from `EditorView`. |
| `src/components/Editor/EditorWorkspaceShell.tsx` | Outer editor workspace shell: left tool rail, before/after panel slots, job footer, and context menu composition extracted from `EditorView`. |
| `src/components/Editor/useEditorExport.ts` | Export/share orchestration (PNG/JPG/SVG/PDF/JSON/HTML + batch ZIP). |
| `src/components/Editor/useEditorPersistence.ts` | Save/load/back navigation guard + template missing-assets workflow. |
| `src/components/Editor/useEditorDesignTitle.ts` | Design title rename draft/edit workflow and server rename sync. |
| `src/components/Editor/useEditorThreeDWorkspace.ts` | 3D workspace state and handler orchestration: generator/editor launch, layer preview options, and canvas insertion flows. |
| `src/components/Editor/useMediaOverlay.ts` | Media overlay frame lifecycle, persistence, selection, and batch-target resolution. |
| `src/components/Editor/useEditorMenuActions.ts` | Menu command handlers (layer ops incl. lock/delete/reorder state+actions, panel mode, shortcuts/about actions). |
| `src/components/Editor/useEditorMediaPreview.ts` | Media preview actions (video frame capture to canvas). |
| `src/components/Editor/useEditorKeyboardShortcuts.ts` | Global editor keyboard bindings (undo/redo/duplicate, tool aliases, Escape close). |
| `src/components/Editor/useEditorMenus.ts` | Menu open/close/toggle state utilities. |
| `src/components/Editor/useEditorTextControls.ts` | Text top-bar + quick-bar state, canvas selection sync, and text mutation handlers. |
| `src/components/Editor/useEditorHistory.ts` | Editor history stack management (snapshots, undo/redo, duplicate, history readiness state). |
| `src/components/Editor/useEditorPanelState.ts` | Docked/floating panel mode and sizing/position state management. |
| `src/components/Editor/useEditorCanvasAssetActions.ts` | Canvas-facing asset actions: library insert, desktop drop upload/insert, canvas-modified dirty/history sync, and right-click menu open. |
| `src/components/Editor/useEditorCanvasOverlayState.ts` | Canvas overlay state/orchestration: context menu, lock badges, cursor preview, and lock-toggle interactions extracted from `EditorView`. |
| `src/components/Editor/useEditorCanvasSelectionInteractions.ts` | Marquee/Lasso/Wand/Quick Select/Selection Brush → content pixel mask; Space-pan coexistence. |
| `src/components/Editor/contentSelectionCommit.ts` | Commit helpers for marquee/lasso/wand content masks. |
| `src/components/Editor/contentSelectionBrushPaint.ts` | Selection Brush / Quick Select stamp into the document mask. |
| `src/components/Editor/useSelectionMaskOverlay.ts` | Tint + ants overlay synced to document selection mask. |
| `src/lib/selection/documentSelectionMask.ts` | Artboard alpha mask model (feather, morph, luminance export). |
| `src/lib/selection/selectionMaskRasterize.ts` | Rect/polygon writers into the mask. |
| `src/lib/selection/selectionWandFloodFill.ts` | Contiguous color flood-fill + color-range union into the mask. |
| `src/lib/selection/selectionBrushStamp.ts` | Soft brush stamp + Quick Select color-grow into the mask. |
| `src/lib/selection/selectionLayerCapture.ts` | Target layer resolve + artboard-aligned pixel capture. |
| `src/lib/selection/documentSelectionStore.ts` | Canvas-attached selection mask state + subscribers. |
| `src/components/Editor/selectionBrushPaint.ts` | Legacy brush↔AABB helpers (object-paint era; prefer `selectionBrushStamp`). |
| `src/components/Editor/useEditorCanvasRetouchInteractions.ts` | Retouch canvas orchestration: retouch-layer bootstrap/reuse plus healing/clone/history/blur/sharpen/dodge stroke interactions extracted from `EditorView`. |
| `src/components/Editor/useEditorCanvasExportSupport.ts` | Canvas export support helpers: background-color resolution, viewport reset wrapper, and resilient `toDataURL` fallback logic extracted from `EditorView`. |
| `src/components/Editor/useEditorShellEffects.ts` | Editor shell side-effects: initial-tool hydration, export-menu outside click, zoom/hand mode sync, media-preview escape handling, UI preference sync, and canvas selection/control display effects extracted from `EditorView`. |
| `src/components/Editor/useEditorTopCanvasControls.ts` | Top utility control state/effects: crop apply flow, eyedropper sampling, zoom controls, and viewport/utility canvas size sync. |
| `src/components/Editor/useEditorShapeGradientControls.ts` | Shape and gradient top-control orchestration: state sync from active object plus apply/update handlers for top-bar mutations. |
| `src/components/Editor/useEditorSelectionModify.ts` | Expand/contract morph of the document content selection mask (top-bar modify radius). |
| `src/components/Editor/useEditorCanvasInteractionEffects.ts` | Editor canvas effect wiring helper module for interaction side-effects. |
| `src/components/Editor/useEditorCanvasToolInteractions.ts` | Tool-specific canvas interaction wiring helper module. |
| `src/components/Editor/useBackgroundJobsStore.ts` | Background AI/3D job state store utilities for editor runtime. |
| `src/components/Editor/useBackgroundJobPolling.ts` | Background job polling side-effect logic and status synchronization. |
| `src/components/Editor/editorView.types.ts` | Shared EditorView data/type contracts. |
| `src/components/Editor/editorViewConfig.ts` | Editor config constants/presets (menus, overlays, tool options). |
| `src/components/Editor/editorViewGeometry.ts` | Geometry helpers for frame bounds and overlay-related calculations. |
| `src/components/Editor/editorViewLayout.ts` | Layout utility math/helpers for editor view sizing/positions. |
| `src/components/Editor/editorColorSampling.ts` | Canvas color sampling utilities used by eyedropper/selection workflows. |
| `src/components/Editor/editorExportOverlays.ts` | Reusable export overlay rendering pipeline (profile + AI notice). |
| `src/components/Editor/editorHtmlExport.ts` | HTML bundle export builder and asset packaging logic. |

## Top Tool Option Subcomponents
| File | Responsibility |
|---|---|
| `src/components/Editor/top-tool-options/AdvancedToolControls.tsx` | Advanced utility controls cluster for top bar actions. |
| `src/components/Editor/top-tool-options/SelectionControls.tsx` | Top-bar selection family chips (Move/Marquee/Lasso/Wand/Quick/Brush), Layer/Group, wand threshold, brush size readout, anti-alias/modify. Path Select omitted (Move alias). Fake feather UI removed. |
| `src/components/Editor/top-tool-options/PaintControls.tsx` | Top-bar paint brush controls. |
| `src/components/Editor/top-tool-options/RetouchControls.tsx` | Top-bar retouch tool controls (healing/clone/blur/sharpen/dodge/history). |
| `src/components/Editor/top-tool-options/GradientControls.tsx` | Top-bar gradient controls and parameter UI. |

## Core Editor-Adjacent Components
| File | Responsibility |
|---|---|
| `src/components/DesignCanvas.tsx` | Fabric canvas host, canvas lifecycle bootstrap, base canvas events. |
| `src/components/Toolbar.tsx` | Left rail tools, tool grouping, trigger API to editor. |
| `src/components/PropertiesPanel.tsx` | Right-side properties container/composer for object/tool properties. |
| `src/components/CircularContextMenu.tsx` | Canvas context radial menu and layer-order quick actions. |
| `src/components/GridOverlay.tsx` | On-canvas grid/guide overlays rendering. |
| `src/components/GradientControls.tsx` | In-canvas gradient manipulation helpers (legacy/aux controls). |
| `src/components/JobStatusFooter.tsx` | Background job status footer and running job feedback. |
| `src/components/UserProfileModal.tsx` | Profile editing and export metadata embed settings. |
| `src/components/MissingAssetsModal.tsx` | Missing template-assets resolution modal flow. |
| `src/components/AssetLibrary.tsx` | Asset browser/listing/upload/select UI and actions. |
| `src/components/ThreeDGenerator.tsx` | 3D generation workflow shell and provider integration. |
| `src/components/ThreeDLayerEditor.tsx` | Existing 3D layer editing UI/workflow. |
| `src/components/ColorWheelTool.tsx` | Advanced color wheel + harmony/swatch workflows (classic). |
| `src/components/ColorConstellation/ColorPickerModeHost.tsx` | Classic vs Color Constellation mode host (shared hex/harmony APIs). |
| `src/components/ColorConstellation/ColorConstellationPicker.tsx` | 3D OKLCH Color Constellation picker shell. |
| `src/features/color-constellation/` | OKLCH math, harmony geometry, shared palette storage. |
| `src/components/DocumentationModal.tsx` | In-app docs/modal viewer. |
| `src/components/SettingsModal.tsx` | App settings panel (providers, keys, feature toggles). |
| `src/components/TemplateLibrary.tsx` | Template browsing/selection surface. |
| `src/components/Dashboard.tsx` | Dashboard/hub screen composition. |
| `src/components/LoginModal.tsx` | Authentication UI flow. |
| `src/components/AdminAreaModal.tsx` | Admin area modal and user/admin operations UI. |
| `src/components/ImageGeneratorModal.tsx` | Image generation modal/workflow controls. |
| `src/components/Asset3DPreview.tsx` | 3D asset preview display module. |
| `src/components/InputModal.tsx` | Generic input modal component. |
| `src/components/SetupWizardModal.tsx` | Initial setup wizard flow. |
| `src/components/HelpPopup.tsx` | Inline help/quick-help popup surface. |
| `src/components/BrandIcon.tsx` | Brand mark/logo UI component. |

## Properties Subsystem
| File | Responsibility |
|---|---|
| `src/components/properties/PanelModeRail.tsx` | Panel mode selector rail and mode switch surface. |
| `src/components/properties/PanelUtilityViews.tsx` | Utility panel bodies (history/navigator/info/color/swatches/etc). |
| `src/components/properties/LayersView.tsx` | Layer tree rendering/reorder/group actions. |
| `src/components/properties/SortableLayerItem.tsx` | Sortable layer row item behavior and rendering. |
| `src/components/properties/SelectionProperties.tsx` | Selected-object property editing orchestration. |
| `src/components/properties/TransformProperties.tsx` | Position/size/rotation/transform controls. |
| `src/components/properties/TextProperties.tsx` | Text content/style controls. |
| `src/components/properties/TextEffectsProperties.tsx` | Text effects (shadow/stroke/glow/etc) controls. |
| `src/components/properties/ShadowStrokeProperties.tsx` | Shared shadow/stroke control blocks. |
| `src/components/properties/SkewTaperProperties.tsx` | Skew/taper controls and object mutation UI. |
| `src/components/properties/PaintProperties.tsx` | Paint tool/session-specific controls. |
| `src/components/properties/PenProperties.tsx` | Pen/path editing controls. |
| `src/components/properties/ImageFilterProperties.tsx` | Filter controls for image layers. |
| `src/components/properties/LayerEffectsProperties.tsx` | Layer effects panel controls. |
| `src/components/properties/AdjustmentControls.tsx` | Adjustment layer controls and parameter editing. |
| `src/components/properties/LayoutProperties.tsx` | Layout/alignment properties for selected objects. |
| `src/components/properties/CanvasSettingsPanel.tsx` | Canvas/artboard size and canvas-level settings. |
| `src/components/properties/ColorPicker.tsx` | Reusable color picker control component. |

## UI Primitives
| File | Responsibility |
|---|---|
| `src/components/ui/button.tsx` | Button primitive. |
| `src/components/ui/input.tsx` | Input primitive. |
| `src/components/ui/label.tsx` | Label primitive. |
| `src/components/ui/select.tsx` | Select primitive. |
| `src/components/ui/slider.tsx` | Slider primitive. |
| `src/components/ui/switch.tsx` | Switch/toggle primitive. |
| `src/components/ui/tabs.tsx` | Tabs primitive. |
| `src/components/ui/DraggableResizablePanel.tsx` | Draggable/resizable panel shell utility. |
| `src/components/ui/RangeResetListener.tsx` | Range input reset synchronization helper. |

## Hooks (Non-Editor Folder)
| File | Responsibility |
|---|---|
| `src/hooks/useEscapeKey.ts` | Generic Escape-key subscription helper hook. |
| `src/hooks/useGradientControls.ts` | Gradient control state/actions reusable hook. |

## Libraries (Client Runtime)
| File | Responsibility |
|---|---|
| `src/lib/fabric-utils.ts` | Fabric object/canvas helpers and normalization utilities. |
| `src/lib/fabric-filters.ts` | Fabric filter utilities and conversions. |
| `src/lib/raster-engine.ts` | Raster brush engine and drawing mode setup. |
| `src/lib/retouch-engine.ts` | Retouch stroke engine and pixel mutation math/helpers. |
| `src/lib/pen-utils.ts` | Pen/path helper utilities. |
| `src/lib/googleDrive.ts` | Google Drive integration for backups/media operations. |
| `src/lib/profile-utils.ts` | User profile persistence/serialization utilities. |
| `src/lib/generative-preferences.ts` | Generative feature preference persistence. |
| `src/lib/hitemsOptions.ts` | Hitems provider option helpers/serialization. |
| `src/lib/hitem3dAuth.ts` | Hitems/3D auth helper utilities. |
| `src/lib/localAssetStore.ts` | Local asset storage/index persistence utilities. |
| `src/lib/assetStorageSettings.ts` | Asset storage settings persistence and defaults. |
| `src/lib/setupWizard.ts` | Setup wizard persistence/state helpers. |
| `src/lib/ui-preferences.ts` | UI preference storage/events helpers. |
| `src/lib/theme-tokens.ts` | Theme token constants. |
| `src/lib/typography.ts` | Typography constant sets and related helpers. |
| `src/lib/number-drag-hints.ts` | Number-drag UX helper data/logic. |
| `src/lib/apiErrorParsing.ts` | API error normalization/parsing helper. |
| `src/lib/utils.ts` | Shared generic utility helpers. |

## Libraries (Server Runtime)
| File | Responsibility |
|---|---|
| `src/lib/server/auth-utils.ts` | Server auth/session helper utilities. |
| `src/lib/server/user-auth-store.ts` | User auth storage/access layer. |
| `src/lib/server/user-notifications.ts` | User notification persistence/access helpers. |
| `src/lib/server/asset-metadata.ts` | Asset metadata persistence and lookup utilities. |

## API Route Ownership
| Route Area | Files | Responsibility |
|---|---|---|
| `ai/generate-image` | `src/app/api/ai/generate-image/route.ts` | Generic image generation proxy endpoint. |
| `ai/hitems` | `src/app/api/ai/hitems/route.ts`, `src/app/api/ai/hitems/[id]/route.ts`, `src/app/api/ai/hitems/validate/route.ts` | Hitems generation lifecycle + validation. |
| `ai/meshy` | `src/app/api/ai/meshy/route.ts` | Meshy provider request endpoint. |
| `ai/stability/*` | `src/app/api/ai/stability/*/route.ts` | Stability generation/editing/upscale/removal endpoints. |
| `ai/tripo` | `src/app/api/ai/tripo/route.ts`, `src/app/api/ai/tripo/[id]/route.ts`, `src/app/api/ai/tripo/upload/route.ts` | Tripo generation, polling, and upload endpoints. |
| `assets/*` | `src/app/api/assets/*/route.ts` | Asset CRUD, upload, serving, rename, visibility endpoints. |
| `designs/*` | `src/app/api/designs/*/route.ts` | Design CRUD, save/list/delete/rename endpoints. |
| `templates/*` | `src/app/api/templates/*/route.ts` | Template CRUD endpoints. |
| `user/auth/*` | `src/app/api/user/auth/*/route.ts` | Login/register/google/reset-password auth endpoints. |
| `user/admin/users` | `src/app/api/user/admin/users/route.ts` | Admin user management endpoint. |
| `user/keys` | `src/app/api/user/keys/route.ts` | User API key storage/retrieval endpoint. |
| `export/proxy` | `src/app/api/export/proxy/route.ts` | Export-time proxy for remote asset bundling. |
| `logs/login` | `src/app/api/logs/login/route.ts` | Login activity logging endpoint. |

## Data Assets
| File | Responsibility |
|---|---|
| `src/data/quotes.json` | Static quote dataset used by UI features. |

## Refactor Journal (Keep Updated)
- 2026-02-27: Added initial map and ownership boundaries.
- 2026-02-27: Updated Editor section for extracted hooks (`useEditorExport`, `useEditorPersistence`, `useEditorKeyboardShortcuts`) and hook adoption in `EditorView`.
- 2026-02-27: Added ownership entries for `useEditorDesignTitle` and updated Editor extraction coverage.
- 2026-02-27: Added `useEditorTextControls` ownership and expanded `useEditorMenuActions` scope for layer reorder responsibilities.
- 2026-02-27: Added `useEditorHistory` ownership for history/undo-redo/duplicate extraction from `EditorView`.
- 2026-02-27: Adopted `useEditorPanelState` in `EditorView` and removed in-file panel dock/float/resize state handlers.
- 2026-02-27: Added and adopted `useEditorCanvasAssetActions` for asset insert/drop and basic canvas action handlers from `EditorView`.
- 2026-02-27: Added and adopted `useEditorTopCanvasControls` for crop/eyedropper/zoom handlers and viewport/utility canvas sync from `EditorView`.
- 2026-02-27: Adopted existing `useEditorCanvasInteractionEffects` in `EditorView` for gradient drag + media/3D double-click canvas interactions.
- 2026-02-27: Added and adopted `useEditorShapeGradientControls` for shape/gradient top-control state sync and apply handlers extracted from `EditorView`.
- 2026-02-27: Added and adopted `useEditorSelectionModify` for selection expand/contract top-control logic extracted from `EditorView`.
- 2026-02-27: Adopted existing `useBackgroundJobsStore` + `useBackgroundJobPolling` in `EditorView` and removed in-file background-job storage/polling orchestration.
- 2026-02-27: Added `EditorHeaderActions` and adopted it in `EditorView` to own header action menus (palette/grid/share/export/profile) and reduce `EditorView` surface area.
- 2026-02-27: Added `EditorViewOverlays` and adopted it in `EditorView` to own overlay/modal composition (grid, gradient, profile, missing-assets, media preview, export quality).
- 2026-02-27: Added `EditorHeaderMenus` and adopted it in `EditorView` to own top-nav menu cluster (File/Edit/Image/Layer/Select/Filter/View/Window/Settings/Help).
- 2026-02-27: Added `useEditorCanvasSelectionInteractions` and adopted it in `EditorView` to own marquee/lasso/wand selection interaction wiring and helper overlay lifecycle.
- 2026-02-27: Added `useEditorCanvasRetouchInteractions` and adopted it in `EditorView` to own retouch-layer bootstrap/reuse and stroke interactions for healing/clone/history/blur/sharpen/dodge.
- 2026-02-27: Added `useEditorCanvasExportSupport` and adopted it in `EditorView` to own canvas export background detection, viewport reset, and `toDataURL` fallback behavior.
- 2026-02-27: Added `useEditorShellEffects` and adopted it in `EditorView` to own shell-level side effects (initial tool, canvas UI sync, export outside-click, preview escape, UI preference sync).
- 2026-02-27: Added `EditorHeaderPrimary` and adopted it in `EditorView` to own brand/title+hub+top-menu-toggle header cluster.
- 2026-02-27: Added `EditorTopToolOptionsBridge` and adopted it in `EditorView` to own grouped top-bar prop wiring, normalization, and tool-trigger bridging for `TopToolOptionsBar`.
- 2026-02-27: Added `EditorPropertiesPanels` and adopted it in `EditorView` to own docked/collapsed/floating panel shells plus shared `PropertiesPanel` wiring.
- 2026-02-27: Added `EditorCanvasWorkspace` and adopted it in `EditorView` to own the central workspace render tree (canvas stage, 3D overlays, lock badges, cursor preview, bottom-right utilities).
- 2026-02-27: Added `EditorWorkspaceShell` and adopted it in `EditorView` to own outer workspace chrome (tool rail, footer, context menu, and panel slots).
- 2026-02-27: Added `useEditorThreeDWorkspace` and adopted it in `EditorView` to own 3D state plus generator/editor handlers previously in the main integration file.
- 2026-02-27: Added `useEditorCanvasOverlayState` and adopted it in `EditorView` to own context-menu state, lock-badge overlays, cursor-preview effects, and canvas lock-toggle actions.
- 2026-08-02: Selection family: Quick Select + Selection Brush are first-class paint engines (not wand/lasso aliases); wand prefers seed in Layer mode; feather no longer fakes Fabric Shadow; Path chip removed from top-bar (Move alias).
- 2026-08-02: Content selection v2 — Selection Brush / Quick Select stamp the document alpha mask (Alt contracts); wand Contiguous/Color + picker; expand/contract morph the mask.
