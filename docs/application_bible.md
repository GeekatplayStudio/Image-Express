# Image Express Application Bible

Status: Canonical internal reference (engineering + product + QA)  
Last audited against code: 2026-04-03  
Repository root: `Image-Express`  
Primary runtime branch observed: `main`

## 1. Purpose and Authority
This document is the authoritative technical and functional reference for Image Express.

It defines:
- what the application does today,
- how each major capability works,
- where behavior lives in code,
- what is persistent vs ephemeral,
- what is partially complete,
- what should be built next, including expected user experience and UI placement.

When this document conflicts with older tracker or handoff docs, this document should be treated as the single source of truth until superseded.

## 2. Product Definition
Image Express is a Next.js + Fabric.js design studio combining:
- 2D canvas design and layered editing,
- image generation and AI-assisted edit pipelines,
- 3D generation and placement workflows,
- export pipelines for static assets and bundles,
- local/hybrid/cloud asset library storage,
- user auth/admin workflows.

### 2.1 Main Product Surfaces
- Dashboard/Hub (`src/app/page.tsx`, `src/components/Dashboard.tsx`)
- Editor (`src/components/Editor/EditorView.tsx` + modular hooks/shell components)
- Asset Library (`src/components/AssetLibrary.tsx`)
- Settings (`src/components/SettingsModal.tsx`)
- Setup Wizard (`src/components/SetupWizardModal.tsx`)
- Auth/User/Admin modals (`LoginModal`, `UserProfileModal`, `AdminAreaModal`)

### 2.2 Runtime Modes
- Web mode:
  - authentication flow enabled,
  - inactivity auto-logout (30 minutes),
  - role-aware admin access.
- Desktop mode (Electron bridge):
  - local desktop user context (`Local Desktop`),
  - login modal bypassed,
  - desktop update check/install actions in Settings.

## 3. Architecture Overview

### 3.1 App Shell Composition
- Global layout: `src/app/layout.tsx`
  - mounts `DialogProvider`, `ToastProvider`, `RangeResetListener`.
  - injects runtime performance shim script before interactive render.
- Main app entry: `src/app/page.tsx`
  - controls dashboard/editor switching,
  - controls session/user state,
  - controls setup wizard auto-open logic,
  - opens top-level modals (settings/admin/docs/profile/login).

### 3.2 Editor Architecture
Editor runtime is intentionally modularized around `EditorView` orchestration.

Core orchestration file:
- `src/components/Editor/EditorView.tsx`

Major extracted hook domains include:
- persistence/save/load/back safety (`useEditorPersistence`)
- export/share/quality modal (`useEditorExport`)
- history/undo/redo/duplicate (`useEditorHistory`)
- menu command logic (`useEditorMenuActions`)
- keyboard shortcuts (`useEditorKeyboardShortcuts`)
- media overlay state and conversion (`useMediaOverlay`)
- background job persistence + polling (`useBackgroundJobsStore`, `useBackgroundJobPolling`)
- selection and retouch interaction pipelines (`useEditorCanvasSelectionInteractions`, `useEditorCanvasRetouchInteractions`)
- top tool controls and utility overlays (`useEditorTopCanvasControls`, `useEditorShapeGradientControls`, etc.)

### 3.3 Server/API Architecture
API is route-based under `src/app/api/*` and uses mixed persistence backends:
- filesystem-backed JSON/assets for designs/templates/jobs/logs/users/metadata,
- third-party provider pass-through/proxy routes,
- encrypted filesystem-backed key vault route for user API key sync (`/api/user/keys`).

### 3.4 Persistence Layers (Durability Matrix)
- Durable (filesystem):
  - designs (`public/assets/designs`)
  - templates (`public/assets/templates`)
  - uploaded/generated server assets + metadata index (`public/assets/*`, `public/assets/asset-index.json`)
  - user auth store (`data/users.json`)
  - AI jobs/revisions (`data/ai-jobs`, `data/ai-revisions`)
  - logs (`logs/*`)
- Durable (browser local):
  - local asset store (IndexedDB `image-express-local-assets`)
  - user preferences, API keys, setup state, panel state, overlay state, job store (localStorage/sessionStorage)
- Cloud (user-owned):
  - Google Drive folders and file metadata via OAuth client-side flow.
- Semi-durable security-sensitive:
  - `/api/user/keys` now uses encrypted filesystem vault persistence (`data/user-key-vault.json`) with read/write audit metadata.
  - Phase-2 hardening remains open for stronger authz boundaries, rotation policy, and centralized key-management controls.

## 4. Session, User, and Role Model

### 4.1 Session Types
- Guest (web, unauthenticated)
- Authenticated web user
- Local desktop pseudo-user

### 4.2 Auth and Approval Model
- Email/password register creates `pending` user, requires admin approval.
- Google sign-in can auto-map existing approved user; otherwise creates pending request.
- Status-gated login outcomes:
  - `pending`, `rejected`, `disabled`, `approved`.

### 4.3 Role/Rights
- Admin rights include user approval/management rights.
- Default member seeded with creator role/right set.
- Admin routes verify requester is admin before listing/updating users.

### 4.4 Password Recovery
- request-reset generates one-time token (30 min), logs/sends via Resend if configured.
- reset-password validates token and rotates hash.
- change-password requires current password and approved/non-disabled status.

## 5. End-to-End Product Flows

### 5.1 Startup and Setup Wizard
- On app load, shell determines desktop/web behavior.
- Setup wizard auto-opens unless completion is marked for scope or existing setup config detected.
- Setup completion is scoped (`completedByScope`), with migration from legacy global completion marker.

### 5.2 Dashboard to Editor
Dashboard supports:
- new custom-size design,
- upload-media start action,
- 3D-generation start action,
- image-generation start action,
- template open,
- recent design open/delete.

`page.tsx` passes pending design/template/size/tool context into editor initialization.

### 5.3 Design Save Lifecycle
`useEditorPersistence` save flow:
- prompts for name when untitled,
- serializes canvas with custom history props,
- captures thumbnail data URL (with fallback path if initial export fails),
- POST `/api/designs/save`,
- updates design id/name in shell,
- clears dirty state,
- optionally mirrors JSON backup to Google Drive if enabled.

### 5.4 Unsaved Change Protection
- beforeunload warning in browser,
- in-app back confirmation when dirty.

## 6. Editor Functional Bible

### 6.1 Canvas Model and Workspace
`DesignCanvas` establishes:
- full-size Fabric canvas tied to container resize observer,
- explicit artboard rect (`Artboard`) as non-selectable base layer,
- workspace background color and pattern,
- fit/center viewport behavior,
- panning and zooming interactions.

Guaranteed behaviors:
- artboard kept at bottom of object stack,
- artboard excluded from normal selection/deletion flows,
- object selection dimension overlay shown while active.

### 6.2 Navigation and Interaction Conventions
- Space + drag pans canvas.
- Hand mode lock also pans.
- Wheel zooms around pointer.
- Double-click empty canvas recenters artboard to click location.
- Delete/backspace guarded to avoid deleting while typing/editing text input contexts.

### 6.3 Layer Duplication
- Alt/Option + drag on selectable target duplicates selection at pointer-down (`mouse:down:before`) with zero-offset clone start.
- History duplicate command uses `duplicateActiveCanvasSelection` with default +20/+20 offset.

Implementation lives in:
- `src/components/Editor/duplicateCanvasSelection.ts`
- `src/components/Editor/useEditorHistory.ts`
- `src/components/DesignCanvas.tsx`

### 6.4 Tooling Model (Left Rail + Top Options)
Tool identities include selection, drawing, retouch, transform, text, shape, utility families.

Keyboard aliases include:
- `V` select
- `M` marquee
- `L` lasso
- `W` quick select / `Shift+W` wand
- `A` path select
- `J` healing
- `S` clone stamp
- `Y` history brush
- `B` paint
- `R` blur
- `O` dodge
- `T` text
- `U` shapes
- `P` pen
- `G` gradient
- `I` eyedropper
- `C` crop
- `H` hand
- `Z` zoom

History shortcuts:
- undo: `Cmd/Ctrl+Z` (+ `Alt+Z` path)
- redo: `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y`
- duplicate selection: `Cmd/Ctrl+J`
- deselect: `Cmd/Ctrl+D`
- escape closes quality modal/menus.

### 6.5 Selection Engines
`useEditorCanvasSelectionInteractions` supports:
- rectangular marquee,
- polygon lasso,
- wand/quick-select color-threshold matching with fallback to hit target,
- layer/group selection mode commit semantics.

Selection excludes helper/anchor/retouch/artboard objects.

### 6.6 Retouch Engine
`useEditorCanvasRetouchInteractions` + `retouch-engine`:
- creates/reuses dedicated retouch layer canvas object,
- supports healing, clone stamp, history brush, blur, sharpen, dodge/burn/sponge aliases,
- interpolates stroke points and soft brush masks,
- handles clone source capture and aligned mode behavior,
- commits history and dirty state when mutation occurs.

### 6.7 Properties + Panels
Primary panel modes (`PanelModeRail`):
- layers
- properties
- history
- color
- swatches
- brushes
- channels
- adjustments
- navigator
- info

Panel system supports docked/collapsed/floating modes with persisted behavior.

### 6.8 Layers and Object Operations
Capabilities include:
- reorder, lock/unlock, hide/show, delete
- grouping/folder workflows and arrange mode
- clipping/masking pathways
- selected-layer mini inspector and compact action strip

Menu actions guard artboard and invalid selection states.

### 6.9 Color/Swatches/Adjustments
Implemented color system includes:
- RGB/HSB/CMYK/Lab editing modes,
- color wheel integration and harmony workflows,
- grouped swatch CRUD + persistence,
- adjustment layer launcher and quick type switching.

Adjustment layer types include:
- curves
- levels
- hue/saturation
- exposure
- saturation/vibrance
- black & white
- brightness/contrast
- color balance
- light and color
- solid color

### 6.10 Channels Panel
Current channel MVP+ state:
- channel rows: Composite, R, G, B, Alpha, Luminosity
- channel previews per row
- per-channel opacity and mask toggles
- mode actions: isolate, invert, mask
- reset-to-composite for image filter workflows
- direct channel value editing for color/fill targets

Implementation:
- `ChannelsPanelView.tsx`
- `channelEditing.ts`

### 6.11 Text and Warp Notes
- Text effects and curved text workflows are available in properties.
- Text-to-warp conversion controls exist in `DesignCanvas`, but conversion path is currently disabled via early return due to instability.

### 6.12 Export System
Export formats:
- PNG / JPG (with quality modal + size estimate)
- SVG
- PDF
- JSON
- HTML bundle

Export pipeline behaviors:
- overlay rendering (`profile` and AI usage labels) via `runWithExportOverlays`
- viewport-safe capture wrappers and resilient `toDataURL` fallbacks
- crop bounds resolved from logical artboard/export geometry

Share behavior:
- current "share" is export + open Facebook/Instagram website for manual upload.
- direct posting APIs are not implemented.

### 6.13 Media Export Overlay System
`useMediaOverlay` supports:
- frame presets and frame collections,
- active-frame selection,
- include/exclude flags for batch export,
- safe area presets,
- naming templates,
- batch ZIP exports (selected/all),
- active-frame to variant conversion in `fill` / `fit` / `safe-area` mode.

Current state:
- frame-to-variant conversion works in-editor and resets overlay frame state for new draft workflow.
- full campaign workspace model is not fully productized in runtime yet.
- `useMediaOverlayCampaignVariants` exists but is not currently wired into production editor flow (appears in tests/helpers only).

## 7. AI Systems Bible

### 7.1 Shared Image Generation Route (`/api/ai/generate-image`)
Provider behavior:
- `comfy`: queues workflow to Comfy endpoint
- `openai`: DALL-E 3 with aspect bucket mapping
- `ollama`: local SVG-oriented generation with model preflight and retries
- `google`: Gemini image generation server helper
- `banana`: Banana endpoint helper
- fallback/default: Stability text-to-image

### 7.2 Image Generator Modal Runtime
`ImageGeneratorModal` includes:
- provider availability based on configured keys plus local runtimes,
- Comfy connection modes (local/cloud/auto) and diagnostics,
- workflow/model-preset registry integration,
- one-time warmup for Comfy profile combinations,
- request snapshot persistence for debugging,
- canceled prompt tracking to prevent unwanted auto-recovery,
- missing requirement detection and install/update actions,
- optional agentic annotation workflow path.

### 7.3 AI Edit Notes Pipeline
Flow:
- capture source layer/canvas and annotations,
- build overlay/mask/reference artifacts,
- POST `/api/generate` with files + annotation JSON + provider info,
- poll `/api/jobs/[id]`,
- fetch final artifact from `/api/jobs/[id]/result`,
- cleanup upload artifacts and write revision metadata.

Server job engine (`lib/agentic-edit/jobs.ts`):
- persists job files in `data/ai-jobs`,
- writes outputs to `public/assets/generated/images`,
- records revisions in `data/ai-revisions`,
- prunes old terminal jobs (retention window default 6h),
- cleans upload artifacts after terminal state.

### 7.4 Ollama Critique
`AICritiqueModal` + `/api/ai/ollama/critique`:
- target selection: selected layer or full canvas,
- runtime/model status preflight,
- enforced requirement for vision-capable model,
- optional in-flow model installation,
- critique prompt built server-side and submitted with image payload.

## 8. 3D Generation Bible

### 8.1 Providers
- Meshy (`/api/ai/meshy`)
- Tripo (`/api/ai/tripo`, `/api/ai/tripo/[id]`, `/api/ai/tripo/upload`)
- Hitem3D (`/api/ai/hitems`, `/api/ai/hitems/[id]`, `/api/ai/hitems/validate`)

### 8.2 3D Modal Capabilities
`ThreeDGenerator.tsx` supports:
- provider selection and provider-specific parameter forms,
- Hitem single/multi-view source selection,
- Tripo upload flow for image-to-3d,
- Meshy preview-to-refine progression,
- in-modal model preview rendering,
- background job handoff.

### 8.3 Background Job Orchestration
- jobs persisted in localStorage (`image-express-background-jobs`), max count and age gate.
- adaptive polling intervals (2s increasing up to 10s when no progress).
- success path can auto-add generated 3D into canvas and auto-persist model into active asset storage mode.

## 9. Asset, Storage, and Library Bible

### 9.1 Storage Modes
`assetStorageSettings` modes:
- `local` (IndexedDB only)
- `hybrid` (local + optional Drive per upload; optional legacy server listing)
- `cloud` (Drive only)

### 9.2 Asset Library Semantics
`AssetLibrary.tsx`:
- tabs: Uploads, Videos, Audio, 3D, Generated
- scope filters: personal/shared
- visibility filters: all/public/private
- provider load behavior based on storage mode
- dedupe across local/drive/server sources using merge key and provider priority
- supports rename/delete/visibility toggles across linked providers with partial-success warnings
- supports 3D hover preview popup and media playback controls

### 9.3 Google Drive Integration
`googleDrive.ts` handles:
- OAuth token acquisition and refresh behavior,
- folder provisioning hierarchy (`ImageExpress`, `Backups`, `Assets`, `Generated`, `3D Models`, `Templates`, `Fonts`),
- list/upload/download/rename/delete/visibility for Drive assets,
- backup upload path for saved designs.

### 9.4 Server Asset Metadata
`asset-metadata.ts` maintains metadata index at `public/assets/asset-index.json` for:
- owner,
- visibility,
- created/updated timestamps,
- lookup for list/rename/delete/visibility APIs.

## 10. API Catalog (Grouped)

### 10.1 AI and Runtime
- `/api/ai/generate-image`
- `/api/ai/stability/generate`
- `/api/ai/stability/img2img`
- `/api/ai/stability/inpaint`
- `/api/ai/stability/outpaint`
- `/api/ai/stability/remove-bg`
- `/api/ai/stability/upscale`
- `/api/ai/stability/upscale/poll`
- `/api/ai/comfy/proxy`
- `/api/ai/comfy/library`
- `/api/runtime/comfy`
- `/api/ai/ollama/status`
- `/api/ai/ollama/install`
- `/api/ai/ollama/critique`
- `/api/ai/meshy`
- `/api/ai/tripo`
- `/api/ai/tripo/[id]`
- `/api/ai/tripo/upload`
- `/api/ai/hitems`
- `/api/ai/hitems/[id]`
- `/api/ai/hitems/validate`

### 10.2 Agentic Jobs
- `/api/generate`
- `/api/jobs/[id]`
- `/api/jobs/[id]/result`

### 10.3 Assets/Designs/Templates/Export
- `/api/assets/upload`
- `/api/assets/list`
- `/api/assets/delete`
- `/api/assets/rename`
- `/api/assets/visibility`
- `/api/assets/save-url`
- `/api/assets/fetch-url`
- `/api/assets/serve/[...path]`
- `/api/designs/save`
- `/api/designs/list`
- `/api/designs/delete`
- `/api/designs/rename`
- `/api/templates/save`
- `/api/templates/list`
- `/api/templates/delete`
- `/api/export/proxy`

### 10.4 User/Auth/Admin/Logs
- `/api/user/auth/login`
- `/api/user/auth/register`
- `/api/user/auth/google`
- `/api/user/auth/request-reset`
- `/api/user/auth/reset-password`
- `/api/user/auth/change-password`
- `/api/user/admin/users`
- `/api/user/keys` (encrypted filesystem vault backed)
- `/api/logs/login`

## 11. Operational Reality and Constraints

### 11.1 User Key Vault Hardening Remaining
`/api/user/keys` now persists in an encrypted filesystem-backed vault with read/write audit counters, which resolves the original process-memory durability gap.

Remaining production hardening still required:
- stronger authz boundaries around key read/update pathways,
- explicit key rotation/expiry policy,
- optional migration to dedicated external key management service for multi-node deployments.

### 11.2 Filesystem-Backed Scale Limits
Design/template/asset/job/user/log persistence is local filesystem based in current edition. This is straightforward for local/single-node operation but not horizontally scalable without shared storage/database refactor.

### 11.3 Social Posting Scope
In-app share currently launches website targets after export. API-native social posting is not implemented.

### 11.4 Media Overlay Phase-B Incompleteness
Variant conversion exists, but a complete campaign workspace and variant management shell are not fully integrated in runtime.

### 11.5 Channel Workflow Incompleteness
Channels are materially implemented but still missing advanced workflows (saved channels, channel-to-selection loading, deeper raster parity).

## 12. Future Implementation Blueprint

Execution master:
- `docs/master_future_implementation_roadmap.md` is the canonical consolidated roadmap for sequencing, dependencies, and file-level implementation planning.

Each feature below includes product intent, expected UI placement, and technical direction.

### 12.1 Campaign Workspace (Media Overlay Phase B2)
Priority: P1

Current gap:
- frame-to-variant conversion is available, but variant management is not first-class.

Functional target:
- add campaign variant workspace with variant list, rename/duplicate/delete, active variant state, variant history boundaries, and export-current/export-all-variants.

UI placement:
- right-side utility panel/flyout accessible from Export menu and top header actions.
- active variant badge near design title/export controls.

Technical notes:
- use existing single Fabric engine; swap snapshots instead of multi-canvas live render.
- persist variant metadata + thumbnails + linkage to source frame id.

Acceptance:
- users can maintain multiple aspect variants in one design context and export deterministically.

### 12.2 AI Critique Quality Program
Priority: P1

Current gap:
- critique path is operational but prompt quality and review UX can improve.

Functional target:
- critique profiles (composition, typography, brand consistency, conversion-readiness), structured rubric output, actionable edit suggestions tied to tools.

UI placement:
- critique modal: add preset selector + actionable “Apply in editor” links.

Technical notes:
- version critique prompts,
- store critique history per design/session,
- optionally map critique items to quick commands (open panel mode, select tool).

### 12.3 Ollama Local Generation Quality Track
Priority: P1

Current gap:
- local generation works, but output approach remains SVG-first and quality/performance tuning is open.

Functional target:
- finalize supported local model matrix,
- decide SVG-first vs bitmap-first per workflow,
- provide predictable quality profiles and clearer model guidance.

UI placement:
- Image Generator provider details panel and Settings local AI section.

Technical notes:
- unify runtime health + model capability checks,
- keep retry/fallback behavior explicit in UX.

### 12.4 Channels Advanced Workflow Completion
Priority: P1

Current gap:
- missing saved channels and load-channel-as-selection parity.

Functional target:
- save named alpha/luma channels,
- convert channel to active selection,
- non-destructive channel stacks for image layers.

UI placement:
- Channels panel: add channel list section and selection command row.

Technical notes:
- extend channel state model with saved channel definitions,
- integrate with selection engine and history snapshots.

### 12.5 Asset Library Import/Export
Priority: P2

Current gap:
- no packaged library transfer workflow.

Functional target:
- export selected/all assets with metadata manifest,
- import bundle with owner/visibility handling and dedupe.

UI placement:
- Asset Library header actions (“Import Library”, “Export Library”).

Technical notes:
- zip package containing files + metadata JSON,
- source provider normalization during import.

### 12.6 Additional Cloud Storage Providers
Priority: P2

Current gap:
- cloud provider enum currently only supports Google Drive.

Functional target:
- extend cloud provider abstraction to support Dropbox/OneDrive/S3-compatible targets.

UI placement:
- Settings > Storage and Cloud Connections.

Technical notes:
- generalize `AssetCloudProvider` and provider adapters,
- retain hybrid semantics and visibility model parity.

### 12.7 Facebook Authentication Integration
Priority: P2

Current gap:
- login UI exposes Facebook as coming soon.

Functional target:
- OAuth login with same approval/status gating rules used by email/google flows.

UI placement:
- Login modal provider buttons.

Technical notes:
- add `/api/user/auth/facebook` validation route,
- map profile fields to existing user model.

### 12.8 Direct Social Posting
Priority: P3

Current gap:
- share only opens websites after export.

Functional target:
- connected account posting flows for supported platforms with publish metadata (caption, alt text, aspect checks).

UI placement:
- existing Share menu should become platform workflow launcher.

Technical notes:
- separate provider connectors + token storage,
- fallback to current manual flow when not connected.

### 12.9 Durable Encrypted User Key Vault
Priority: P0

Current gap:
- Phase 1 is delivered (encrypted filesystem-backed vault), but phase-2 production hardening remains.

Functional target:
- complete production-grade per-user key storage with encryption-at-rest, auditable update/read semantics, stronger authz, and rotation policy.

UI placement:
- no major UI change required; Settings API-key UX remains, but backend persistence hardens.

Technical notes:
- migrate to DB-backed encrypted storage,
- add key rotation and minimal-access service boundaries,
- preserve local-first behavior where desired.

### 12.10 Background Jobs Control Center
Priority: P2

Current gap:
- polling + persistence exist, but user controls are limited.

Functional target:
- centralized jobs panel with retry, cancel, reopen result, and filter by provider/type.

UI placement:
- augment `JobStatusFooter` with expandable jobs manager panel.

Technical notes:
- unify AI image and 3D jobs into single normalized timeline model.

### 12.11 Comfy Custom Workflows/Nodes Bundled Integration
Priority: P1

Current gap:
- custom workflow/node repos can be installed manually, but there is no first-party bundled management layer for your curated stack.

Functional target:
- bundle your custom workflow/node repository definitions in app code,
- allow install/update from UI,
- surface version/commit status and compatibility diagnostics.

UI placement:
- Settings > Comfy Workflow Manager + Image Generator workflow diagnostics panel.

Technical notes:
- add bundle definition registries in `lib/comfyui`,
- extend `/api/ai/comfy/library` actions for bundled install/update paths,
- show workflow-node-model compatibility status in generator surfaces.

### 12.12 Super Installer + First-Run Dependency Orchestration
Priority: P0

Current gap:
- setup steps are fragmented; users must manually coordinate installs, updates, and optional model downloads.

Functional target:
- guided selector flow at first-run for:
  - ComfyUI install/update,
  - bundled custom node/workflow install,
  - optional Comfy model downloads,
  - optional Ollama model downloads.
- run post-install validation and attempt safe auto-fix for missing dependencies.

UI placement:
- Setup Wizard primary flow + re-run controls in Settings.

Technical notes:
- add installer orchestration scripts under `scripts/`,
- pull latest sources from configured GitHub repositories with trust/pinning policy,
- emit actionable install logs and subsystem readiness status.

### 12.13 Comfy Model Catalog + Custom Model Upload in UI
Priority: P1

Current gap:
- model selection is limited and does not expose full custom model registration/upload flow in UI.

Functional target:
- provide UI model catalog with multi-model selection per workflow/task,
- allow custom model file/path registration,
- enforce workflow-model compatibility checks before run.

UI placement:
- Settings Comfy section (model catalog management) + Image Generator model picker.

Technical notes:
- add model catalog abstraction in `lib/comfyui`,
- persist preferred model selections per task/workflow,
- validate model availability and type constraints at run-time.

### 12.14 Global Resizable Popup/Modal Compliance
Priority: P2

Current gap:
- some app windows are resizable/draggable while many key modal surfaces remain fixed-size.

Functional target:
- standardize major popup/modal surfaces on a resizable shell with consistent constraints and behavior.

UI placement:
- shared modal shell behavior across settings/auth/profile/docs/export and editor overlays.

Technical notes:
- expand shared resizable shell component usage,
- define min/max size + mobile fallback rules,
- preserve focus, keyboard navigation, and escape/close semantics.

### 12.15 Interface Customization (Themes/Colors/Modes)
Priority: P2

Current gap:
- interface theming is tokenized but user-facing customization controls are limited.

Functional target:
- user-selectable interface modes/themes/colors with persisted preferences and safe contrast guardrails.

UI placement:
- Settings > Appearance (global), applied across dashboard/editor/modals.

Technical notes:
- expand theme token sets and preference persistence,
- apply theme hydration early in app layout,
- validate contrast/readability across core surfaces.

## 13. Suggested QA Gate for Major Releases
- `npm run lint`
- `npm run build`
- targeted editor and properties tests
- `npm run qa:ollama` (local runtime workflows)
- `npm run qa:overlay` (export/media overlay browser verification)
- `npm run qa:install` (first-run installer + dependency readiness verification)
- route smoke tests for auth + assets + jobs.

## 14. Change-Control Rules for This Bible
Update this document in the same PR whenever:
- a new major feature ships,
- an API contract changes,
- persistence behavior changes,
- a limitation in Section 11 is resolved,
- a roadmap item in Section 12 changes status or scope.
