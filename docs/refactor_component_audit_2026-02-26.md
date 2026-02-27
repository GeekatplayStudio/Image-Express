# Refactor Component Audit (2026-02-26)

## Saved checkpoints
- `30b3873` Fix media overlay frame bounds, layering, and export alignment.
- `bf2c363` Refactor editor menu toggle and close logic.

## Component Inventory (priority order)

| Priority | Component | Lines | Signals | Refactor Target |
|---|---|---:|---|---|
| P0 | `src/components/Editor/EditorView.tsx` | 1337 | 80+ `useState`, high `useEffect`/`useCallback` density, mixed UI + canvas + export + AI jobs | Continue splitting into feature hooks + service modules |
| P0 | `src/components/PropertiesPanel.tsx` | 3272 | broad UI/control orchestration in one file | Split into panel controller + section containers |
| P0 | `src/components/Toolbar.tsx` | 2536 | tool config + behavior + UI tied together | Move tool definitions/commands into registry modules |
| P1 | `src/components/ThreeDGenerator.tsx` | 1484 | provider workflow + polling + UI coupling | Shared async job hook + provider adapters |
| P1 | `src/components/AssetLibrary.tsx` | 1463 | direct API calls in UI layer | Use centralized asset data service/hooks |
| P1 | `src/components/properties/PanelUtilityViews.tsx` | 1319 | 8 panel views in one file | Split by panel into separate files |
| P1 | `src/components/AI/StabilityGenerator.tsx` | 1128 | API workflow duplication with other generators | Shared request/polling pipeline |
| P1 | `src/components/SettingsModal.tsx` | 1061 | settings concerns mixed (auth, storage, prefs) | Split by settings domain + settings store |
| P2 | `src/components/Editor/TopToolOptionsBar.tsx` | 949 | many control modes in one render tree | Config-driven section rendering |
| P2 | `src/components/DesignCanvas.tsx` | 924 | canvas init + artboard + input event plumbing in one file | Extract canvas lifecycle/event hooks |

## Cross-cutting duplication to centralize

1. Menu state management
- Started in `EditorView` (`closeEditorMenus`, `toggleEditorMenu`, `openEditorMenu`).
- Next: move into `useEditorMenus` hook and share between top-nav/actions/popovers.

2. Async API calls in components
- Multiple components call `/api/*` directly (`EditorView`, `AssetLibrary`, `SettingsModal`, `ThreeDGenerator`, `StabilityGenerator`, `ImageGeneratorModal`, `LoginModal`).
- Introduce `src/lib/api/client.ts` + domain modules (`assetsApi`, `designsApi`, `aiJobsApi`, `authApi`).

3. Background job orchestration
- Job state/polling logic split across editor and generator components.
- Create `useBackgroundJobs` + provider adapters (`stability`, `tripo`, `meshy`, `hitems`).

4. Canvas event wiring
- Heavy `canvas.on/off` effect blocks concentrated in `EditorView` and `DesignCanvas`.
- Extract hook families:
  - `useCanvasSelectionSync`
  - `useCanvasKeyboardShortcuts`
  - `useCanvasOverlayFrame`
  - `useCanvasExport`

5. Large panel composition
- `PropertiesPanel` and `PanelUtilityViews` mix state selection + rendering.
- Move data selection/derivation into hooks; keep presentational components stateless.

## Proposed extraction plan

### Phase 1 (low-risk, immediate)
- Extract from `EditorView`:
  - `useEditorMenus`
  - `useExportQualityModal`
  - `useMediaOverlay` (A2 multi-frame overlay + persistence + frame lifecycle) ✅ Completed 2026-02-27
  - `useEditorExport` + `EditorExportQualityModal` (export/share/batch ZIP handlers + quality modal UI extraction) ✅ Completed 2026-02-27
  - `useEditorPersistence` (save/back guard/template load + missing-asset resolution extraction) ✅ Completed 2026-02-27
  - Adopted existing `useEditorMenuActions` + `useEditorMediaPreview` hooks in `EditorView` (menu actions + media frame-capture extraction) ✅ Completed 2026-02-27
  - `useEditorKeyboardShortcuts` + `useEditorDesignTitle` (keyboard effect cluster + design-title rename workflow extraction) ✅ Completed 2026-02-27
  - Adopted `useEditorMenus` in `EditorView` (menu state/setters/open-close handlers extraction) ✅ Completed 2026-02-27
  - Extended `useEditorMenuActions` for layer reorder state/action extraction from `EditorView` ✅ Completed 2026-02-27
  - `useEditorTextControls` (text top-bar/quick-bar state + selection sync + text mutation handlers) ✅ Completed 2026-02-27
  - `useEditorHistory` (history stack/undo/redo/duplicate + history-ready ref) ✅ Completed 2026-02-27
  - Adopted `useEditorPanelState` for panel dock/float/collapse/resize state and handlers ✅ Completed 2026-02-27
  - `useEditorCanvasAssetActions` (asset select/drop + canvas modified/right-click handlers) ✅ Completed 2026-02-27
  - `useEditorTopCanvasControls` (crop/eyedropper/zoom + viewport/utility-canvas sizing effects) ✅ Completed 2026-02-27
  - Adopted existing `useEditorCanvasInteractionEffects` (gradient-drag + media/3D double-click canvas interactions) ✅ Completed 2026-02-27
  - `useEditorShapeGradientControls` (shape/gradient top-control state sync + mutation handlers) ✅ Completed 2026-02-27
  - `useEditorSelectionModify` (selection expand/contract top-control logic extraction) ✅ Completed 2026-02-27
  - Adopted existing `useBackgroundJobsStore` + `useBackgroundJobPolling` to remove in-file background job persistence/polling effects ✅ Completed 2026-02-27
  - `EditorHeaderActions` (header action cluster extraction: palette/grid/share/export/profile menus) ✅ Completed 2026-02-27
  - `EditorViewOverlays` (overlay/modal composition extraction: grid/gradient/profile/missing-assets/media-preview/export-quality) ✅ Completed 2026-02-27
  - `EditorHeaderMenus` (top-nav menus extraction: File/Edit/Image/Layer/Select/Filter/View/Window/Settings/Help) ✅ Completed 2026-02-27
  - `EditorHeaderPrimary` (brand/title+hub+top-menu-toggle extraction) ✅ Completed 2026-02-27
  - `EditorTopToolOptionsBridge` (grouped top-bar prop bridge + normalization/event wiring for `TopToolOptionsBar`) ✅ Completed 2026-02-27
  - `EditorPropertiesPanels` (docked/collapsed/floating panel shell + shared `PropertiesPanel` composition) ✅ Completed 2026-02-27
  - `EditorCanvasWorkspace` (main workspace render extraction: canvas stage, 3D overlays, cursor/lock overlays, utility cluster) ✅ Completed 2026-02-27
  - `EditorWorkspaceShell` (outer workspace shell extraction: tool rail, footer, context menu, panel slots) ✅ Completed 2026-02-27
  - `useEditorThreeDWorkspace` (3D state + generator/editor handler extraction) ✅ Completed 2026-02-27
  - `useEditorCanvasOverlayState` (context menu + lock overlays + cursor preview extraction) ✅ Completed 2026-02-27
  - `useEditorCanvasSelectionInteractions` (marquee/lasso/wand/quick-select/selection-brush canvas selection interaction extraction) ✅ Completed 2026-02-27
  - `useEditorCanvasRetouchInteractions` (retouch-layer bootstrap/reuse + healing/clone/history/blur/sharpen/dodge stroke interaction extraction) ✅ Completed 2026-02-27
  - `useEditorCanvasExportSupport` (export background detection + viewport reset + resilient `toDataURL` fallback extraction) ✅ Completed 2026-02-27
  - `useEditorShellEffects` (initial-tool + canvas-shell effect cluster extraction) ✅ Completed 2026-02-27
- Split `PanelUtilityViews.tsx` into one file per panel view.
- Add `src/lib/api/client.ts` (`requestJson`, typed error handling).

### Phase 2 (medium-risk)
- Move direct API calls from `AssetLibrary`, `SettingsModal`, `StabilityGenerator`, `ThreeDGenerator` to domain API modules.
- Introduce `useAiJobPipeline` shared by generator components.

### Phase 3 (higher-risk)
- Break `EditorView` into container + hooks + sub-layout components:
  - `EditorHeader`
  - `EditorCanvasArea`
  - `EditorRightPanels`
  - `EditorModals`
- Keep `EditorView` as integration shell only.

## Definition of done per extraction
- No behavior changes.
- Existing tests pass; add focused tests where behavior was untested.
- New modules expose typed interfaces and avoid component-level `fetch`/`localStorage` directly.
- Reduced file size and effect count in target file after each phase.
