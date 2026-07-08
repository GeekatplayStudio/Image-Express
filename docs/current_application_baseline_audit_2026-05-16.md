# Current Application Baseline Audit (2026-05-16)

Status: Active baseline audit  
Primary scope: Web application  
Secondary scope: Electron desktop shell and mobile companion appendices  
Repository: Image-Express

## 1. Executive Summary

Image Express is already a broad creative application, not a thin prototype. The current build has a production-grade core around dashboard entry, editor shell, layered canvas editing, export, asset management, server-backed persistence, multi-provider AI generation, local Ollama critique/generation foundations, Comfy workflow discovery, and 3D generation.

The strongest delivered areas today are:
- dashboard to editor entry, save/load, and export flows,
- core editor foundations: layers, properties, gradients, text, paint, retouch, masking, adjustment layers, and selection tools,
- asset library operations and bundle import/export,
- provider-routed 2D and 3D generation,
- first-pass local AI support through Ollama and local Comfy workflows,
- media overlay export phases A1/A2/A3 plus B1 frame-to-variant bridge,
- first-pass theme customization and desktop shell support.

The highest-value unfinished work clusters into four areas:
- reliability and operational hardening: lint/test health, installer completion, key-vault phase 2, and actionable job management,
- core creative workflow completion: Campaign Workspace B2, critique quality, Ollama quality tuning, channels advanced workflows, and Comfy model/bundle management,
- UX simplification: modal ownership, toolbar/context control consolidation, panel complexity reduction, and docking/persistence cleanup,
- documentation alignment: some roadmap rows are stale relative to tracker and code-backed delivered slices.

This audit is intended to answer four questions quickly:
- what exists now,
- how users move through it,
- what is still incomplete or risky,
- what should be implemented next in priority order.

## 2. Scope And Source-Of-Truth Documents

This audit synthesizes the current application state from the following sources:
- `docs/master_future_implementation_roadmap.md`: canonical future sequencing and initiative acceptance criteria.
- `docs/unified_progress_status.md`: canonical delivery history and current execution state.
- `docs/feature_implementation_tracker.md`: per-feature implementation table and validation notes.
- `docs/functionality_reference.md`: editor and properties QA baseline.
- `docs/component_responsibility_map.md`: runtime ownership map.
- `docs/imageprocessingui_upgrade_gap_and_integration_plan.md`: earlier UX-gap framing.
- `docs/left_toolbar_parity_map_2026-02-25.md`: left-rail and cursor parity gap source.
- `docs/media_export_overlay_phase_b_checklist.md`: current status of media-overlay to campaign-variant work.
- `README.md`: broad user-facing capability summary.
- runtime surfaces including `src/app/page.tsx`, `src/components/Editor/EditorView.tsx`, `src/components/Editor/EditorViewOverlays.tsx`, `src/components/Toolbar.tsx`, `src/components/PropertiesPanel.tsx`, `src/components/SettingsModal.tsx`, and `src/components/SetupWizardModal.tsx`.
- repo-health artifacts including `lint_output.txt`, `test_failures.txt`, `tsc_test_output.txt`, and current editor diagnostics.

Interpretation rules used in this audit:
- roadmap rows are treated as future intent, not automatically as current reality,
- tracker rows and unified-progress entries outrank older roadmap assumptions when they describe delivered work,
- runtime files and tests are used to resolve documentation conflicts,
- desktop and mobile are documented here, but the main priority order is web-first.

## 3. Current Application Feature Inventory

### 3.1 Access, Identity, And Onboarding

Current state: Broadly implemented, with security and installer completion still in progress.

Implemented capabilities:
- email/password login and registration,
- Google sign-in against the existing auth route,
- user approval and role-aware access behavior,
- user profile modal with password-change flow for eligible accounts,
- reset-password and change-password flows,
- desktop-local mode that bypasses standard hosted login flow,
- 30-minute inactivity timeout for non-desktop active sessions,
- admin area entry from the main shell for admin users,
- setup wizard entry on first run or on explicit reopen,
- encrypted filesystem-backed user key vault phase 1 for `/api/user/keys`.

Known gaps:
- Facebook auth is not started,
- key-vault phase 2 hardening remains open: stronger authz controls, key rotation path, and richer audit/admin surfaces,
- setup wizard and installer runtime still need stronger long-running execution UX and deeper auto-fix/readiness coverage.

Primary surfaces:
- `src/app/page.tsx`
- `src/components/LoginModal.tsx`
- `src/components/UserProfileModal.tsx`
- `src/components/AdminAreaModal.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/SetupWizardModal.tsx`
- `src/lib/server/user-key-vault.ts`
- `src/app/api/user/auth/*`

### 3.2 Dashboard, Templates, And Project Lifecycle

Current state: Production-capable.

Implemented capabilities:
- dashboard landing with new-design entry points,
- template-based entry for common formats,
- recent design grid with restored preview handling,
- design open flow into the editor,
- design rename support from the editor shell,
- server-backed design save/list/delete/rename routes,
- dashboard-level access to documentation, settings, admin, and profile,
- hub status chips that reflect connected 2D and 3D services.

Known gaps:
- baseline visual parity snapshots and formal UX smoke gates are not captured as an ongoing program,
- cross-design organizational workflows remain basic compared with the depth of the editor itself.

Primary surfaces:
- `src/app/page.tsx`
- `src/components/Dashboard.tsx`
- `src/components/TemplateLibrary.tsx`
- `src/app/api/designs/*`

### 3.3 Editor Shell, Navigation, And Command Surfaces

Current state: Powerful but increasingly dense.

Implemented capabilities:
- modular editor shell with header menus, primary actions, canvas workspace, and right-side property surfaces,
- menu taxonomy for File, Edit, Image, Layer, Select, Filter, View, Window, Settings, and Help,
- top contextual controls through `TopToolOptionsBar` and related extracted modules,
- left rail for selection, retouch, text, shapes, pen, brushes, fill/gradient, gallery, templates, AI zone, and AI 3D,
- right properties system with icon-rail mode switching,
- bottom utility cluster and context menu workflows,
- documentation, settings, admin, profile, export quality, and other overlay surfaces,
- docked, floating, and collapsed panel modes.

Known gaps:
- modal and overlay ownership is fragmented between page-level state and editor-level overlay composition,
- tool settings are still split across the toolbar, top options, and properties surfaces,
- right-panel mode count is high relative to task grouping,
- utility tools such as Crop, Eyedropper, Zoom, and Hand still carry parity debt relative to a persistent reference-style left rail,
- panel docking/floating behavior needs stronger persistence and off-screen recovery.

Primary surfaces:
- `src/components/Editor/EditorView.tsx`
- `src/components/Editor/EditorViewOverlays.tsx`
- `src/components/Editor/TopToolOptionsBar.tsx`
- `src/components/Toolbar.tsx`
- `src/components/PropertiesPanel.tsx`
- `src/components/properties/PanelModeRail.tsx`
- `src/components/ui/DraggableResizablePanel.tsx`

### 3.4 Canvas Editing, Layers, And Creative Tooling

Current state: One of the most complete parts of the product.

Implemented capabilities:
- locked non-selectable artboard at the bottom of the layer stack,
- layer visibility, lock, reorder, folder grouping, duplicate, selected-layer mini inspector, and arrange mode,
- on-canvas lock badges and grouped-child lock handling,
- transform controls for position, size, rotation, skew, and pseudo-3D presentation,
- text editing, curved text, text effects pack, and safer text-on-path handling,
- shape system with expanded primitives,
- gradients with top-bar controls and editing helpers,
- paint engine consolidation across brush presets,
- retouch engine with healing, clone, history, blur, sharpen, dodge, burn, sponge, and related tool identities,
- selection stack including marquee, lasso, wand, selection modification, and path-select aliases,
- adjustment layers, masks, mask gradients, layer effects, swatches, color-wheel harmony workflows, and expanded color modes,
- channels MVP with live thumbnails, isolate/invert/mask actions, opacity, composite masks, and direct value editing for eligible layers.

Known gaps:
- saved channels, channel-to-selection loading, and deeper raster-channel workflows are still missing,
- some reference-style left-rail parity remains unfinished for tool identity and discoverability,
- test coverage around some advanced editor slices is currently unstable and needs to be restored to a dependable baseline.

Primary surfaces:
- `src/components/DesignCanvas.tsx`
- `src/components/Editor/EditorCanvasWorkspace.tsx`
- `src/components/PropertiesPanel.tsx`
- `src/components/properties/*`
- `src/lib/fabric-utils.ts`
- `src/lib/raster-engine.ts`
- `src/lib/retouch-engine.ts`

### 3.5 AI Image Generation, Critique, And Edit Workflows

Current state: Broad feature coverage, with quality and manageability gaps still open.

Implemented capabilities:
- shared image-generation path across Stability, OpenAI, Google Gemini, Banana, and local/runtime-aware providers,
- local Ollama generation support through saved runtime/model preferences,
- local Ollama critique modal for selected layer or full canvas,
- provider-aware runtime checks and inline setup/error messaging,
- Comfy workflow library support: server-template discovery, workflow-folder scanning, managed repo inspection, and same-origin proxying,
- custom workflow folder support with relative child paths under install roots,
- local Comfy request snapshot persistence for debugging and prompt inspection,
- blank-source detection for image-based local Comfy tasks,
- AI Edit Notes beta with reference-layer creation, note placement/editing, undoable note removal, flattened metadata layer save, and long-run abort support.

Known gaps:
- critique quality program is only in a first-pass state and still needs structured profiles, more actionable output, and stronger prompt quality,
- Ollama local quality tuning remains unfinished: quality profiles, documented model matrix, and clearer behavior decisions by workflow,
- provider QA hardening is still missing as a formal release gate even though multiple provider runtimes are already live,
- bundled Comfy custom node/workflow integration is not complete,
- Comfy model catalog/upload/compatibility UX is not started,
- AI Edit Notes still lacks the full two-layer export package and richer direct authoring tools described by the unified spec.

Primary surfaces:
- `src/components/ImageGeneratorModal.tsx`
- `src/components/AICritiqueModal.tsx`
- `src/app/api/ai/generate-image/route.ts`
- `src/app/api/ai/ollama/*`
- `src/app/api/ai/comfy/*`
- `src/lib/localAiPreferences.ts`
- `src/lib/ollama.ts`
- `src/lib/comfyui/*`
- `docs/ai_edit_notes_v2_unified_implementation_spec.md`

### 3.6 3D Generation And 3D Workspace

Current state: Feature-rich, but still needs validation and maintenance hardening.

Implemented capabilities:
- 3D generation through Meshy, Tripo, and Hitem3D/Hy3D pathways,
- background polling for long-running generation jobs,
- interactive 3D layer editor and preview handling,
- front/back preview and related Hitem3D control recovery,
- enforced textured/PBR-oriented generation expectations in the product story.

Known gaps:
- there is still no unified jobs control center across AI image and 3D work,
- current repo-health artifacts show a lint blocker in `ThreeDLayerEditor.tsx`, so the 3D slice needs maintenance attention even where functionality exists.

Primary surfaces:
- `src/components/ThreeDGenerator.tsx`
- `src/components/ThreeDLayerEditor.tsx`
- `src/app/api/ai/meshy/route.ts`
- `src/app/api/ai/tripo/*`
- `src/app/api/ai/hitems/*`

### 3.7 Assets, Storage, And Portability

Current state: Strong local and hybrid foundation; cloud ecosystem still partial.

Implemented capabilities:
- asset upload, list, rename, delete, visibility control, and canvas insertion,
- 3D asset preview behavior,
- AI-generated outputs saved through the active storage mode,
- asset library bundle export and import with deterministic dedupe and inline summaries,
- Google Drive backup and cloud asset storage as the only fully live provider,
- provider abstraction groundwork for future additional storage adapters.

Known gaps:
- only Google Drive is fully live today,
- additional provider adapters remain open,
- richer bundle workflows for teams and broader metadata portability could still expand beyond the first delivered version.

Primary surfaces:
- `src/components/AssetLibrary.tsx`
- `src/lib/assetLibraryBundle.ts`
- `src/lib/assetStorageSettings.ts`
- `src/lib/assetPersistence.ts`
- `src/lib/googleDrive.ts`
- `src/app/api/assets/*`

### 3.8 Export, Delivery, And Media Adaptation

Current state: Strong standard export support with campaign-style work still partial.

Implemented capabilities:
- export to PNG, JPG, SVG, PDF, JSON, and self-contained HTML bundles,
- export quality modal with image-quality controls,
- AI usage labelling in exports when relevant,
- media overlay export phases A1, A2, and A3,
- B1 frame-to-variant bridge inside the current editor model,
- browser-level QA coverage for overlay-aware export flows,
- manual export-and-open flow for social posting.

Known gaps:
- campaign workspace B2 is not complete: no first-class variant list/workspace shell, no variant management panel, and no export-current/export-all-variants user flow,
- deterministic adaptation actions are not yet complete across the full variant model,
- direct social posting connectors are not implemented.

Primary surfaces:
- `src/components/Editor/useEditorExport.ts`
- `src/components/Editor/useMediaOverlay.ts`
- `src/components/Editor/EditorHeaderActions.tsx`
- `src/components/Editor/EditorExportQualityModal.tsx`
- `docs/media_export_overlay_phase_b_checklist.md`

### 3.9 Settings, Themes, Admin, And Operational Controls

Current state: Capable, but operational UX still trails feature depth.

Implemented capabilities:
- settings for API keys, provider configuration, local AI runtime preferences, Comfy settings, Google Drive backup, theme mode, accent palette, audit log access, and installer/runtime status,
- theme system with persisted `system`, `dark`, and `light` modes and four accent palettes,
- dashboard and editor entry points into docs, settings, admin, and profile,
- background job footer and polling infrastructure,
- setup-wizard reopen path and runtime-health checks.

Known gaps:
- no actionable background jobs control center yet,
- modal compliance and resize behavior are still mixed across overlays,
- theme customization is only a first pass and does not yet extend across all JS-driven surfaces,
- setup, settings, and runtime operations still create a lot of user navigation surface area for one connected story.

Primary surfaces:
- `src/components/SettingsModal.tsx`
- `src/components/SetupWizardModal.tsx`
- `src/components/JobStatusFooter.tsx`
- `src/components/ThemePreferenceSync.tsx`
- `src/lib/themePreferences.ts`
- `src/components/Editor/useBackgroundJobsStore.ts`
- `src/components/Editor/useBackgroundJobPolling.ts`

## 4. End-To-End Workflow Map

### 4.1 First-Run Setup And Runtime Readiness

Status: Partial, usable, not complete.

Current flow:
1. User opens the app and can be prompted into `SetupWizardModal`.
2. User configures core services, storage, and related runtime settings.
3. Existing users can reopen the same surface from Settings.
4. Installer/runtime APIs can run guided setup actions and report readiness gaps.

Current strengths:
- setup is no longer only implied through documentation,
- runtime readiness checks exist,
- installer scaffolding and run/status APIs are in place.

Current seams:
- long-running execution UX is not yet strong enough,
- progress/log streaming and resumable jobs are still missing,
- trust/pinning and richer diagnostics still need completion.

### 4.2 Authentication, Profile, And Session Management

Status: Production-capable.

Current flow:
1. Hosted users log in or register through `LoginModal`; desktop users can enter a local-admin mode.
2. Approved users continue into dashboard or editor flows.
3. User profile, password change, logout, and inactivity timeout are enforced through the main shell.
4. Admin users can open admin controls from the header.

Current seams:
- Facebook auth is missing,
- key vault hardening is incomplete,
- some auth/configuration messaging still lives across multiple surfaces.

### 4.3 Dashboard To Editor Entry

Status: Production-capable.

Current flow:
1. User creates a new design, chooses a template, or opens an existing design from the dashboard.
2. `page.tsx` switches into the editor and seeds pending design/template/tool context.
3. The editor loads the relevant snapshot, template JSON, or empty artboard.

Current seams:
- dashboard organization is still lighter than the editor depth,
- more formal project-management workflows are still absent.

### 4.4 Core Edit Session

Status: Production-capable, but dense.

Current flow:
1. User selects tools from the left rail.
2. User edits via canvas gestures, top options, and right-side properties.
3. Layer and history changes are captured through editor state and save/dirty flows.
4. User can save, rename, duplicate, export, or return to hub.

Current seams:
- tool settings are split between three major command surfaces,
- panel navigation requires high context retention,
- modal overlap and floating panel behavior increase friction.

### 4.5 Asset Import, Reuse, And Portability

Status: Production-capable.

Current flow:
1. User uploads assets through the library or drags them directly from desktop onto the canvas.
2. Assets are stored according to active storage settings.
3. User inserts assets into the canvas or manages them in the library.
4. User can export/import asset bundles for portability.

Current seams:
- only one cloud provider is fully live,
- richer library-management workflows remain possible.

### 4.6 Shared 2D AI Image Generation

Status: Production-capable with provider-specific maturity differences.

Current flow:
1. User opens the image generator from the editor.
2. User chooses provider, prompt, model/runtime settings, and context such as zone or source image.
3. Provider-specific route logic prepares and runs the generation request.
4. Result is inserted into the canvas and/or persisted through the active asset flow.

Current seams:
- local Ollama quality is not yet predictable enough,
- provider QA is not formalized as a release gate,
- Comfy bundle/model management is still missing.

### 4.7 Local Critique Workflow

Status: In progress.

Current flow:
1. User opens critique from the toolbar.
2. User critiques either the selected layer or the full canvas using saved Ollama settings.
3. The modal preflights the runtime/model and returns critique output.

Current seams:
- critique output structure and actionability need improvement,
- critique-history and stronger apply-in-editor loops are still open.

### 4.8 Comfy Workflow Management

Status: Partial.

Current flow:
1. User configures Comfy install and optional workflow locations in Settings.
2. The app scans templates/workflows and can inspect managed repositories.
3. The image generator can run discovered local workflows through the shared UI.

Current seams:
- bundled install/update management is not complete,
- missing dependency messaging can improve further,
- model selection and compatibility guidance are not yet first-class.

### 4.9 3D Generation And Placement

Status: Production-capable with operations follow-through still needed.

Current flow:
1. User opens the 3D generator.
2. User selects provider and submits a job.
3. Background polling tracks progress.
4. User previews and inserts the 3D result into the design workspace.

Current seams:
- job control is passive instead of actionable,
- 3D maintenance validation needs attention.

### 4.10 Media Overlay And Variant Bridge Workflow

Status: Partial.

Current flow:
1. User defines overlay/export frames and uses crop-style batch export behavior.
2. User can batch-export using A1/A2/A3 behavior.
3. Advanced users can convert the active frame to a variant draft inside the current editor model.

Current seams:
- variant workspace shell is not first-class,
- export-current/export-all-variants is not complete,
- mainstream users still face a complex mental model if variant language is surfaced too early.

### 4.11 Save, Export, And Share

Status: Production-capable for save/export, partial for publishing.

Current flow:
1. User saves the active design to the server-backed design store.
2. User exports via the quality modal into the supported formats.
3. If needed, the user follows the manual social-posting flow.

Current seams:
- direct posting connectors remain unimplemented,
- campaign-variant export is not fully first-class.

### 4.12 Admin Governance

Status: Production-capable.

Current flow:
1. Admin user opens the admin area from the main shell.
2. User management and approval operations occur through the existing admin surfaces and auth store.

Current seams:
- additional reporting and audit controls could still grow.

## 5. Implementation Status Reconciliation Against Roadmap And Tracker

| ID | Roadmap Snapshot | Evidence As Of 2026-05-16 | Reconciled Status | Notes |
|---|---|---|---|---|
| R-01 | In progress | Unified 2026-04-03 + tracker 44 | In progress | Phase 1 delivered; authz, rotation, and audit/admin hardening remain. |
| R-02 | In progress (B1 done) | Tracker 35 + overlay checklist | In progress | A1/A2/A3 and B1 are delivered; B2 workspace shell is still open. |
| R-03 | In progress | Tracker 14 | In progress | Critique route and modal are live; quality program scope is not complete. |
| R-04 | In progress | Tracker 13 + unified 2026-04-01/04-02 | In progress | First-pass local AI is live; quality profiles and final model/workflow guidance remain open. |
| R-05 | Partial | Tracker 36 + application bible 11.5 | Partial | Channels MVP exists; saved channels and channel-to-selection remain open. |
| R-06 | Planned | Job footer and polling are live | Planned with foundation present | Operational controls remain passive and need an actionable control center. |
| R-07 | Not started | Tracker 18 is Done | Delivered v1; roadmap stale | Asset library import/export bundle is already delivered and should be reclassified in the roadmap. |
| R-08 | Partial | Tracker 19 | Partial | Provider abstraction is in place; Google Drive is the only fully live provider. |
| R-09 | Not started | Tracker 38 | Not started | No evidence of delivery. |
| R-10 | Partial | Tracker 15 | Partial | Manual export-and-open flow exists; direct posting is still open. |
| R-11 | Planned | Tracker 37 + current QA scripts | Planned with runtime foundation present | Provider runtimes are live, but QA hardening as a release gate is still open. |
| R-12 | Partial foundation exists | Tracker 39 says Not started | Partial foundation only | Workflow scanning/proxying exists, but bundle management/install-update UX is still not delivered. |
| R-13 | In progress | Tracker 40 + unified 2026-04-03 | In progress | Script and runtime foundations are in place; background/resumable UX remains open. |
| R-14 | Not started | Tracker 41 | Not started | No first-class model-catalog/upload UX yet. |
| R-15 | Partial | Tracker 42 | Partial | Overflow and some modal behavior improved, but no shared compliance contract across major overlays yet. |
| R-16 | Not started | Unified 2026-04-03 + tracker 43 Partial | Partial; roadmap stale | First-pass mode/accent system is live and should no longer be represented as not started. |

Primary documentation conflicts to correct going forward:
- `R-07` is already delivered at a v1 level and should not remain `Not started` in the roadmap snapshot.
- `R-16` is partially delivered and should not remain `Not started` in the roadmap snapshot.
- `R-12` should be discussed as partial foundation rather than fully not started, because workflow discovery/proxy infrastructure already exists even though bundle management does not.

## 6. Priority-Ordered Implementation Backlog

Execution order for the next planning cycle should be:
1. Bug fixes
2. Urgent missing features
3. Must-have workflow completion
4. Good-to-have expansion and polish
5. Differentiators

### 6.1 Bug Fixes

1. Restore a trustworthy validation baseline.
   Evidence: `lint_output.txt` currently reports blocking lint errors in `src/components/ThreeDLayerEditor.tsx` and `src/components/properties/PanelUtilityViews.tsx`.

2. Stabilize `EditorView` regression coverage.
   Evidence: `test_failures.txt` shows failing editor tests around top-bar expectations, lock-badge interactions, text controls, and retouch/healing coverage, plus noisy console output that obscures true regressions.

3. Fix modal and overlay state fragmentation.
   Evidence: `src/app/page.tsx` and `src/components/Editor/EditorViewOverlays.tsx` both coordinate multiple independent overlays, increasing overlap and dismissal inconsistency risk.

4. Normalize floating/docked panel persistence and off-screen recovery.
   Evidence: current panel state lives across `useEditorPanelState`, `EditorPropertiesPanels`, and `DraggableResizablePanel`, while prior UX notes still call out lost/clipped panel behavior.

5. Clean up validation-command ambiguity.
   Evidence: `tsc_test_output.txt` reflects a noisy or misconfigured typecheck path; even if part of that output is command-related rather than runtime-related, it weakens the confidence of the current validation story.

### 6.2 Urgent Missing Features

1. Finish the super-installer/runtime orchestration UX.
   Why now: first-run success is foundational for local AI, Comfy, and model-dependent features.

2. Complete key-vault phase 2 hardening.
   Why now: secure credentials handling is platform infrastructure, not optional polish.

3. Deliver the background jobs control center.
   Why now: long-running AI and 3D workflows already exist and need retry/cancel/reopen behavior.

4. Deliver bundled Comfy workflow/node management.
   Why now: the product already exposes Comfy discovery, so install/update management is the operational missing half.

5. Deliver the Comfy model catalog and compatibility UX.
   Why now: users can discover workflows before they can confidently manage models, which leaves a high-friction gap in the current local-AI story.

### 6.3 Must-Have Workflow Completion

1. Campaign Workspace B2: first-class variant workspace shell.
2. AI critique quality program: structured critique profiles and actionable editor follow-through.
3. Ollama local generation quality track: documented model matrix and explicit quality profiles.
4. Channels advanced workflows: saved channels, load-as-selection, and broader raster parity.
5. Variant export completion: deterministic adaptation actions plus export-current/export-all-variants.

These items matter because they complete workflows users can already see the beginnings of in the current product.

### 6.4 Good-To-Have Expansion And Polish

1. Additional cloud storage providers beyond Google Drive.
2. Facebook auth integration.
3. Direct social posting connectors.
4. Global modal/popup compliance using a shared resize/behavior contract.
5. Interface customization expansion beyond mode plus accent.
6. Broader tablet-friendly responsive editor behavior.

These items improve reach, convenience, and polish, but they are less urgent than completing already-open core flows.

### 6.5 Differentiators

1. AI Edit Notes completion around true two-layer exports and richer direct-on-image authoring.
2. Managed local-AI distribution experience: bundled Comfy repos, model catalog, installer, QA, and auto-fix in one connected system.
3. Campaign workspace tied to critique, channel workflows, and deterministic multi-variant export.
4. Cross-device capture-to-editor bridge between the mobile companion and the main asset pipeline.
5. Creator-facing operations layer: actionable jobs control center plus provider QA release gates.

These are the features most likely to stand above simpler editor-plus-generator competitors because they combine workflow depth with operational usability.

## 7. UI Simplification And Navigation Plan

Principle: all UI simplification should be additive and should preserve the current working engines, mutation pipelines, and save/export flows.

| Priority | User Problem | Additive Plan | Primary Surfaces |
|---|---|---|---|
| P0 | Too many independently managed modals and overlays | Introduce one app-level modal stack/overlay coordinator so editor and page surfaces share consistent open/close, z-order, and escape behavior. | `src/app/page.tsx`, `src/components/Editor/EditorView.tsx`, `src/components/Editor/EditorViewOverlays.tsx`, `src/providers/DialogProvider.tsx` |
| P0 | Tool settings are spread across toolbar popovers, top bar, and right properties | Promote the top tool options bar into the consistent second command row and reduce duplicated tool-popover behavior over time. | `src/components/Editor/TopToolOptionsBar.tsx`, `src/components/Toolbar.tsx`, `src/components/Editor/EditorTopToolOptionsBridge.tsx` |
| P1 | Right-side rail has too many modes with weak task grouping | Group right-panel modes into task families such as Edit, Inspect, and Manage while preserving direct access for power users. | `src/components/properties/PanelModeRail.tsx`, `src/components/properties/PanelUtilityViews.tsx`, `src/components/PropertiesPanel.tsx` |
| P0 | Core utility tools still feel hidden or unevenly placed | Make Crop, Eyedropper, Zoom, and Hand persistent in the left rail and add the FG/BG/swap utility cluster plus centralized cursor behavior. | `src/components/Toolbar.tsx`, `src/components/Editor/ToolsDropdownMenu.tsx`, `src/components/DesignCanvas.tsx`, `docs/left_toolbar_parity_map_2026-02-25.md` |
| P1 | Floating panels can become hard to recover and state is mentally expensive | Add bounded persistence, reset-to-default layout, and off-screen recovery rules for floating/docked panels. | `src/components/Editor/useEditorPanelState.ts`, `src/components/Editor/EditorPropertiesPanels.tsx`, `src/components/ui/DraggableResizablePanel.tsx` |
| P1 | Media overlay and variant language can overwhelm mainstream export users | Keep A1/A2/A3 as the default visible path and hide frame-to-variant conversion behind advanced actions until the B2 workspace shell exists. | `src/components/Editor/useMediaOverlay.ts`, `src/components/Editor/EditorHeaderActions.tsx`, `docs/media_export_overlay_phase_b_checklist.md` |
| P2 | Setup and runtime health information is spread across wizard and settings | Reframe setup surfaces around one story: first run, runtime health, provider keys, storage, and installer actions. | `src/components/SetupWizardModal.tsx`, `src/components/SettingsModal.tsx` |
| P2 | Desktop layout assumptions create friction on tablets or smaller windows | Add a tablet-friendly layout mode that disables complex floating behavior and simplifies panel placement below a width threshold. | `src/components/Editor/EditorWorkspaceShell.tsx`, `src/components/Editor/EditorPropertiesPanels.tsx` |

Recommended UX implementation order:
1. modal stack and overlay ownership,
2. left-rail utility parity plus cursor foundation,
3. permanent second-row tool options,
4. bounded panel persistence,
5. grouped right-side modes,
6. media-overlay simplification,
7. tablet layout follow-through.

## 8. Appendices

### Appendix A: Electron Desktop Shell

Current state:
- Electron is already wired as a first-party shell around the Next.js app.
- `desktop:dev`, `desktop:start`, and `desktop:build` scripts exist.
- desktop update checks and update prompts are surfaced through Settings.
- local desktop mode shortcuts the hosted-login dependency.

Current limitation:
- desktop-specific workflow coverage is present, but the operational/runtime story still depends on the same settings, installer, and validation maturity gaps as the web app.

### Appendix B: Mobile Companion

Current state:
- `mobile-companion/` is a standalone Expo app, not a responsive-web editor.
- It already supports login, Google sign-in, secure session persistence, capture/import of media, local upload queue persistence, recent uploads, and authenticated upload into the main asset pipeline.

Current limitation:
- no resumable upload yet for larger videos,
- richer upload metadata and fuller asset browsing remain open,
- device/runtime validation still depends on real-device or emulator testing with valid Google OAuth setup.

### Appendix C: Repo-Health Notes (As Of 2026-05-16)

Observed issues that should inform the `Bug fixes` bucket:
- `lint_output.txt` reports blocking lint errors in `src/components/ThreeDLayerEditor.tsx` and `src/components/properties/PanelUtilityViews.tsx`.
- `test_failures.txt` shows current failing `EditorView` tests around top-bar expectations, text font handling, lock-badge interactions, and healing-control expectations.
- current editor diagnostics also include several Tailwind simplification suggestions; these are lower priority than behavior and validation failures.
- `tsc_test_output.txt` is noisy enough that the typecheck story should be normalized before it is used as a release-confidence signal.

### Appendix D: Validation References

Relevant current commands from `package.json`:
- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run qa:install`
- `npm run qa:ollama`
- `npm run qa:overlay`
- `npm run desktop:dev`

Recommended validation cadence for future delivery work:
- use focused tests or QA commands for the touched slice first,
- keep `build` as the final integration gate,
- keep the baseline audit and roadmap/progress docs synchronized when status changes.