# Refactor Component Audit (2026-02-26)

## Saved checkpoints
- `30b3873` Fix media overlay frame bounds, layering, and export alignment.
- `bf2c363` Refactor editor menu toggle and close logic.

## Component Inventory (priority order)

| Priority | Component | Lines | Signals | Refactor Target |
|---|---|---:|---|---|
| P0 | `src/components/Editor/EditorView.tsx` | 8935 | 86 `useState`, 48 `useEffect`, 76 `useCallback`, mixed UI + canvas + export + AI jobs | Split into feature hooks + service modules |
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
  - `useMediaOverlayFrame` (current frame logic)
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

