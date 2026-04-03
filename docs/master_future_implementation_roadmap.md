# Image Express Master Future Implementation Roadmap (Canonical)

Status: Active  
Last updated: 2026-04-03  
Repository: `Image-Express`  
Branch baseline: `main`

## 1. Purpose
This is the single master file for future implementation planning and roadmap sequencing.

Use this file to answer:
- what is still not complete,
- what we should build next,
- where each change lives in code,
- how work should be grouped into milestones,
- what acceptance criteria define “done”.

## 2. Canonical Relationship With Other Docs
- `docs/unified_progress_status.md`: canonical delivery history and current execution state.
- `docs/feature_implementation_tracker.md`: per-feature implementation + lint/build validation log.
- `docs/application_bible.md`: product + architecture reference, including high-level future blueprint.

Rule:
- Future scope and sequencing changes must be made here first.
- Delivered work should then be mirrored into `unified_progress_status.md` and `feature_implementation_tracker.md`.

## 3. Consolidated Backlog Snapshot

| ID | Initiative | Priority | Current State | Source Alignment | Target Milestone |
|---|---|---|---|---|---|
| R-01 | Durable encrypted user key vault | P0 | Not started | Bible 12.9 | M0 |
| R-02 | Campaign Workspace (Media Overlay B2) | P1 | In progress (B1 done) | Bible 12.1, Unified pending | M1 |
| R-03 | AI critique quality program | P1 | In progress | Bible 12.2, Tracker #14 | M1 |
| R-04 | Ollama local generation quality track | P1 | In progress | Bible 12.3, Tracker #13/#14 queue | M1 |
| R-05 | Channels advanced workflows | P1 | Partial | Bible 12.4, Tracker #36 | M1 |
| R-06 | Background jobs control center | P2 | Planned | Bible 12.10 | M2 |
| R-07 | Asset library import/export bundle | P2 | Not started | Bible 12.5, Tracker #18 | M2 |
| R-08 | Additional cloud storage providers | P2 | Partial (Drive only) | Bible 12.6, Tracker #19 | M2 |
| R-09 | Facebook auth integration | P2 | Not started | Bible 12.7, Tracker #38 | M3 |
| R-10 | Direct social posting connectors | P3 | Partial (manual flow only) | Bible 12.8, Tracker #15 | M3 |
| R-11 | Provider QA hardening (Banana/NanoBanana + multi-provider) | P2 | Planned | Tracker queue + runtime rollout needs | M2 |
| R-12 | Comfy custom workflows/nodes bundled integration | P1 | Partial foundation exists | Bible 12.11 | M1 |
| R-13 | Super installer and first-run dependency orchestration | P0 | Not started | Bible 12.12 | M0 |
| R-14 | Comfy model catalog + custom model upload in UI | P1 | Not started | Bible 12.13 | M1 |
| R-15 | Global resizable popup/modal compliance | P2 | Partial (mixed) | Bible 12.14 | M2 |
| R-16 | Interface customization (themes/colors/modes) | P2 | Not started | Bible 12.15 | M2 |

## 4. Milestone Sequence

## M0. Security and Durability Foundation
Scope:
- Deliver R-01 first to remove in-memory key persistence risk.
- Deliver R-13 to guarantee first-install readiness with guided dependency install.

Exit criteria:
- API key persistence survives process restart.
- Keys are encrypted at rest.
- Read/write access is role-safe and auditable.
- New users can choose install options and reach a ready-to-run state from a single installer flow.

## M1. Core Creative Workflow Completion
Scope:
- R-02, R-03, R-04, R-05, R-12, R-14

Exit criteria:
- Campaign variants are first-class (not only bridge snapshots).
- AI critique output is structured and actionable.
- Local Ollama generation quality is predictable and documented by profile.
- Channels support saved-channel and channel-to-selection workflows.
- Comfy custom node/workflow packs are installable and discoverable in-app.
- Users can select shipped or custom-uploaded Comfy models from UI.

## M2. Operations and Asset Ecosystem
Scope:
- R-06, R-07, R-08, R-11, R-15, R-16

Exit criteria:
- Users can control/retry/cancel/reopen background jobs from one panel.
- Teams can import/export asset bundles with metadata.
- At least one additional cloud provider adapter is production-ready.
- Provider-specific QA scripts exist and are used in release gates.
- All major popups/modals support resize behavior with consistent UX rules.
- Users can customize interface mode and color themes without regression in contrast/readability.

## M3. Identity and Publishing Expansion
Scope:
- R-09, R-10

Exit criteria:
- Facebook login is production-ready with existing approval/status guardrails.
- Share menu supports connected-account posting with fallback to manual export flow.

## 5. Initiative Specs (Technical)

### R-01: Durable Encrypted User Key Vault (P0)
Goal:
- Replace ephemeral `/api/user/keys` in-memory storage with durable encrypted storage.

Primary current files:
- `src/app/api/user/keys/route.ts`
- `src/components/SettingsModal.tsx`

Primary implementation files (expected):
- `src/lib/server/user-key-vault.ts` (new service)
- `src/lib/server/__tests__/user-key-vault.test.ts` (new)
- `src/app/api/user/keys/route.ts` (migrate to service)
- `src/components/SettingsModal.tsx` (no UX change; error messaging updates only)

Data/persistence direction:
- Use encrypted-at-rest store per user identity.
- Add versioned format to support future key rotation.
- Preserve existing payload shape for UI compatibility.

Acceptance criteria:
- Keys persist across restart/redeploy.
- Keys are never returned in clear text outside authorized read path.
- Rotation/update path and failure cases are covered by tests.

Dependencies:
- None (must run first).

---

### R-02: Campaign Workspace (Media Overlay B2) (P1)
Goal:
- Promote current frame-to-variant bridge into a complete campaign workspace.

Primary current files:
- `src/components/Editor/useMediaOverlay.ts`
- `src/components/Editor/useMediaOverlayCampaignVariants.ts`
- `src/components/Editor/mediaOverlayCampaignVariantUtils.ts`
- `src/components/Editor/EditorHeaderActions.tsx`
- `src/components/Editor/__tests__/useMediaOverlayCampaignVariants.test.tsx`

Primary implementation files (expected):
- `src/components/Editor/EditorWorkspaceShell.tsx`
- `src/components/Editor/EditorPropertiesPanels.tsx`
- `src/components/Editor/useEditorHistory.ts`
- `src/components/Editor/useEditorPersistence.ts`
- `src/components/Editor/useEditorExport.ts`
- `src/components/Editor/__tests__/EditorView.test.tsx`

UI placement:
- Right-side utility panel/flyout opened from Export/menu actions.
- Active variant badge near title/export controls.

Acceptance criteria:
- Variant list supports create/rename/duplicate/delete/select.
- Export current variant and export all variants are deterministic.
- Variant snapshots include metadata + thumbnail linkage.

Dependencies:
- R-06 (jobs) is optional but beneficial for variant-export queues.

---

### R-03: AI Critique Quality Program (P1)
Goal:
- Turn critique into a repeatable scoring workflow with actionable recommendations.

Primary current files:
- `src/components/AICritiqueModal.tsx`
- `src/app/api/ai/ollama/critique/route.ts`
- `src/lib/ollama.ts`
- `src/lib/ollamaRuntimeStatus.ts`

Primary implementation files (expected):
- `src/components/AICritiqueModal.tsx` (profiles + structured output sections)
- `src/lib/ollama.ts` (prompt profile helpers)
- `src/app/api/ai/ollama/critique/route.ts` (rubric response shape)
- `src/components/__tests__/AICritiqueModal.test.tsx`
- `src/app/api/ai/ollama/critique/route.test.ts`

Functional scope:
- Critique profiles: composition, typography, brand consistency, conversion-readiness.
- Structured score + issue list + recommended actions.
- “Apply in editor” jump actions (open panel/tool context).

Acceptance criteria:
- Same image + same profile gives stable structure.
- Response always contains at least one actionable recommendation.
- Runtime/model preflight still blocks unsupported setups clearly.

Dependencies:
- R-04 runtime quality improves stability but is not a hard blocker.

---

### R-04: Ollama Local Generation Quality Track (P1)
Goal:
- Make local generation quality predictable and easier to configure.

Primary current files:
- `src/app/api/ai/generate-image/route.ts`
- `src/components/ImageGeneratorModal.tsx`
- `src/components/SettingsModal.tsx`
- `src/lib/localAiPreferences.ts`
- `src/lib/ollamaServer.ts`
- `scripts/qa-ollama.mjs`

Primary implementation files (expected):
- `src/components/ImageGeneratorModal.tsx` (quality profile UI)
- `src/components/SettingsModal.tsx` (model capability messaging)
- `src/lib/localAiPreferences.ts` (profile persistence)
- `src/app/api/ai/generate-image/route.ts` (profile-aware request mapping)
- `src/lib/ollamaServer.ts` (capability checks/retries)
- `src/lib/__tests__/ollamaServer.test.ts`

Functional scope:
- Define supported local model matrix.
- Decide and enforce SVG-first vs bitmap-first behavior by use case.
- Add quality profiles (`fast`, `balanced`, `quality`) with explicit tradeoffs.

Acceptance criteria:
- User sees clear model capability guidance before run.
- Quality profile selection materially changes generation behavior.
- `npm run qa:ollama` covers status + generation + critique paths.

Dependencies:
- None hard; coordinate with R-03.

---

### R-05: Channels Advanced Workflow Completion (P1)
Goal:
- Complete channels parity for saved channels and channel-to-selection workflows.

Primary current files:
- `src/components/properties/ChannelsPanelView.tsx`
- `src/components/properties/channelEditing.ts`
- `src/components/PropertiesPanel.tsx`

Primary implementation files (expected):
- `src/components/properties/ChannelsPanelView.tsx` (saved channel list + actions)
- `src/components/properties/channelEditing.ts` (saved channel model + conversion helpers)
- `src/components/PropertiesPanel.tsx` (history/state wiring)
- `src/components/properties/__tests__/ChannelsPanelView.test.tsx`
- `src/components/properties/__tests__/channelEditing.test.ts`

Functional scope:
- Save named alpha/luma channels.
- Load channel as active selection.
- Manage channel stack (rename/delete/update).

Acceptance criteria:
- Saved channels persist with design/session lifecycle rules.
- Load-as-selection works with undo/redo and selection tools.
- Existing isolate/invert/mask behavior remains stable.

Dependencies:
- Selection engine/state compatibility in editor shell.

---

### R-06: Background Jobs Control Center (P2)
Goal:
- Upgrade passive job footer into an actionable jobs management panel.

Primary current files:
- `src/components/JobStatusFooter.tsx`
- `src/components/Editor/useBackgroundJobsStore.ts`
- `src/components/Editor/useBackgroundJobPolling.ts`
- `src/components/Editor/EditorWorkspaceShell.tsx`
- `src/app/api/jobs/[id]/route.ts`
- `src/app/api/jobs/[id]/result/route.ts`

Primary implementation files (expected):
- `src/components/Editor/BackgroundJobsPanel.tsx` (new)
- `src/components/JobStatusFooter.tsx` (entrypoint/launcher behavior)
- `src/components/Editor/useBackgroundJobsStore.ts` (job action states)
- `src/components/Editor/useBackgroundJobPolling.ts` (retry/cancel integration)
- `src/components/Editor/__tests__/useBackgroundJobPolling.test.tsx`

Functional scope:
- Retry, cancel, reopen result, filter by provider/type/status.
- Unify AI image and 3D job timeline behavior.

Acceptance criteria:
- User can recover from transient failures without losing context.
- Job state transitions are resilient to refresh/reload.
- Failed jobs expose actionable error reasons.

Dependencies:
- Works best with R-11 QA hardening.

---

### R-07: Asset Library Import/Export Bundle (P2)
Goal:
- Enable portable asset library backup/transfer with metadata fidelity.

Primary current files:
- `src/components/AssetLibrary.tsx`
- `src/app/api/assets/list/route.ts`
- `src/app/api/assets/upload/route.ts`
- `src/app/api/assets/delete/route.ts`
- `src/app/api/assets/rename/route.ts`
- `src/app/api/assets/visibility/route.ts`

Primary implementation files (expected):
- `src/components/AssetLibrary.tsx` (Import/Export actions)
- `src/lib/assetLibraryBundle.ts` (new bundle/manifest helpers)
- `src/app/api/assets/export/route.ts` (new)
- `src/app/api/assets/import/route.ts` (new)
- `src/components/__tests__/AssetLibrary.test.tsx`

Functional scope:
- Export selected/all assets with metadata manifest.
- Import bundle with dedupe and owner/visibility handling.

Acceptance criteria:
- Round-trip import/export preserves usable asset records.
- Dedupe is deterministic and user-visible when collisions occur.
- Partial failures return detailed summary to the UI.

Dependencies:
- Align with R-08 provider abstraction.

---

### R-08: Additional Cloud Storage Providers (P2)
Goal:
- Extend cloud storage beyond Google Drive with adapter architecture.

Primary current files:
- `src/lib/googleDrive.ts`
- `src/lib/assetStorageSettings.ts`
- `src/components/AssetLibrary.tsx`
- `src/components/SettingsModal.tsx`

Primary implementation files (expected):
- `src/lib/cloudProviders/types.ts` (new)
- `src/lib/cloudProviders/googleDriveProvider.ts` (new adapter wrapper)
- `src/lib/cloudProviders/dropboxProvider.ts` (new, phased)
- `src/lib/cloudProviders/oneDriveProvider.ts` (new, phased)
- `src/components/SettingsModal.tsx` (provider connection UI)
- `src/components/AssetLibrary.tsx` (provider-aware operations)

Functional scope:
- Generalize provider contracts (list/upload/download/rename/delete/visibility).
- Keep local/hybrid/cloud semantics unchanged for users.

Acceptance criteria:
- At least one additional provider reaches parity with Drive core operations.
- Provider switching does not break existing Drive users.
- Asset merge behavior remains deterministic across providers.

Dependencies:
- R-07 import/export can reuse provider abstraction.

---

### R-09: Facebook Authentication Integration (P2)
Goal:
- Ship Facebook OAuth login with existing approval/status gates.

Primary current files:
- `src/components/LoginModal.tsx`
- `src/app/api/user/auth/google/route.ts`
- `src/app/api/user/auth/login/route.ts`
- `src/lib/server/user-auth-store.ts`

Primary implementation files (expected):
- `src/app/api/user/auth/facebook/route.ts` (new)
- `src/components/LoginModal.tsx` (enable provider button)
- `src/lib/server/user-auth-store.ts` (provider mapping)
- `src/components/__tests__/LoginModal.test.tsx`

Functional scope:
- OAuth sign-in, user mapping, pending/approved/rejected/disabled gating parity.

Acceptance criteria:
- Facebook-authenticated users follow same status model as existing providers.
- Error and denial states are clearly surfaced in auth UI.
- Existing email/google flows remain unchanged.

Dependencies:
- None hard; coordinate with auth/security releases.

---

### R-10: Direct Social Posting Connectors (P3)
Goal:
- Evolve “export + open website” into connected publish workflows.

Primary current files:
- `src/components/Editor/useEditorExport.ts`
- `src/components/Editor/EditorHeaderActions.tsx`

Primary implementation files (expected):
- `src/app/api/social/facebook/post/route.ts` (new)
- `src/app/api/social/instagram/post/route.ts` (new, where allowed)
- `src/components/Editor/EditorHeaderActions.tsx` (connected account launcher)
- `src/components/Editor/useEditorExport.ts` (publish payload builder)
- `src/components/SettingsModal.tsx` (social account connection state)

Functional scope:
- Connected account posting with caption/alt/aspect validation.
- Manual export flow remains as fallback when not connected.

Acceptance criteria:
- User can publish directly when connected and authorized.
- Unsupported/expired tokens fail with actionable recovery guidance.
- Existing manual share behavior remains available.

Dependencies:
- R-09 may provide shared OAuth infrastructure patterns.

---

### R-11: Provider QA Hardening (P2)
Goal:
- Close runtime quality gaps for less-traveled provider paths (Banana/NanoBanana and multi-provider consistency).

Primary current files:
- `src/app/api/ai/generate-image/route.ts`
- `src/lib/server/bananaGeneration.ts`
- `src/lib/agentic-edit/providers/nanobanana.ts`
- `scripts/qa-ollama.mjs`

Primary implementation files (expected):
- `scripts/qa-providers.mjs` (new)
- `src/app/api/ai/generate-image/route.test.ts` (expanded matrix)
- `src/lib/server/__tests__/bananaGeneration.test.ts`
- `src/lib/agentic-edit/providers/__tests__/nanobanana.test.ts`

Functional scope:
- Add scripted health + smoke checks for configured providers.
- Normalize error surfaces and fallback behavior.

Acceptance criteria:
- Provider QA script runs in CI/manual release gate.
- Failures identify provider, stage, and suggested fix path.
- Existing successful providers keep current behavior.

Dependencies:
- Coordinates with R-03/R-04/R-06.

---

### R-12: Comfy Custom Workflows/Nodes Bundled Integration (P1)
Goal:
- Ship first-party support for your custom Comfy nodes/workflows as a managed part of this app distribution.

Primary current files:
- `src/components/SettingsModal.tsx`
- `src/components/ImageGeneratorModal.tsx`
- `src/lib/comfyui/registry.ts`
- `src/lib/comfyui/runner.ts`
- `src/lib/comfyui/libraryServer.ts`

Primary implementation files (expected):
- `src/lib/comfyui/presets/customWorkflowBundles.ts` (new)
- `src/lib/comfyui/presets/customNodeBundles.ts` (new)
- `src/app/api/ai/comfy/library/route.ts` (bundle-aware install/update operations)
- `src/components/SettingsModal.tsx` (bundle selector + install/update actions)
- `src/components/ImageGeneratorModal.tsx` (workflow source attribution and compatibility hints)
- `src/lib/comfyui/__tests__/registry.test.ts`

Functional scope:
- Bundle your workflow/node repository definitions in the app codebase.
- Add install/update actions for those bundles from Settings.
- Track installed version/commit and surface update availability.

Acceptance criteria:
- User can install/update bundled custom repos without manual git commands.
- Bundled workflows appear in generator UI when requirements are met.
- Missing dependency messages identify specific node/model gaps.

Dependencies:
- Pairs with R-13 installer and R-14 model management.

---

### R-13: Super Installer + First-Run Dependency Orchestration (P0)
Goal:
- Provide a guided installer that pulls latest required components (ComfyUI, libraries, custom nodes/workflows, optional models) and validates readiness.

Primary current files:
- `src/components/SetupWizardModal.tsx`
- `src/components/SettingsModal.tsx`
- `scripts/qa-ollama.mjs`

Primary implementation files (expected):
- `scripts/super-installer.mjs` (new orchestrator)
- `scripts/installers/comfy/install-comfy.mjs` (new)
- `scripts/installers/comfy/install-custom-bundles.mjs` (new)
- `scripts/installers/models/install-comfy-models.mjs` (new)
- `scripts/installers/models/install-ollama-models.mjs` (new)
- `scripts/qa-installation.mjs` (new post-install checks + auto-fix attempts)
- `src/components/SetupWizardModal.tsx` (selector UI + progress log + retry actions)
- `src/components/SettingsModal.tsx` (re-run installer/actions for existing users)

Functional scope:
- First-run selector prompts:
  - install/update ComfyUI,
  - install bundled custom nodes/workflows,
  - download selected Comfy models,
  - download selected Ollama models.
- Pull latest versions from configured GitHub sources (with optional pinning policy).
- Run post-install validation/tests, detect missing dependencies, and attempt safe auto-fixes.

Acceptance criteria:
- User can complete install from one flow and open a ready-to-run editor/runtime setup.
- Installer logs every action and failure with retry path.
- Post-install validation reports pass/fail by subsystem (Comfy runtime, workflows, models, Ollama).

Dependencies:
- Must coordinate with security policy for remote source trust and pinning.
- Enables R-12 and R-14 delivery quality.

---

### R-14: Comfy Model Catalog + Custom Model Upload in UI (P1)
Goal:
- Let users select among multiple Comfy models, including custom model upload/registration from UI.

Primary current files:
- `src/components/ImageGeneratorModal.tsx`
- `src/components/SettingsModal.tsx`
- `src/lib/comfyui/registry.ts`
- `src/lib/comfyui/preferences.ts`

Primary implementation files (expected):
- `src/components/SettingsModal.tsx` (model catalog + upload/register controls)
- `src/components/ImageGeneratorModal.tsx` (model picker with compatibility checks)
- `src/lib/comfyui/modelCatalog.ts` (new)
- `src/app/api/ai/comfy/library/route.ts` (model registration + scan operations)
- `src/lib/comfyui/__tests__/libraryTypes.test.ts`
- `src/components/__tests__/ImageGeneratorModal.test.tsx`

Functional scope:
- UI for choosing model per workflow/task.
- UI path for adding custom model files/paths and mapping model metadata.
- Compatibility guardrails (workflow requires model type X).

Acceptance criteria:
- User can switch from default SDXL to alternative installed/custom models in UI.
- Invalid model/workflow combinations are blocked with clear guidance.
- Model selection is persisted and restorable across sessions.

Dependencies:
- R-13 installer should optionally prefetch selected models.

---

### R-15: Global Resizable Popup/Modal Compliance (P2)
Goal:
- Standardize modal/popup behavior so major overlays are resizable (and draggable where appropriate).

Primary current files:
- `src/components/ui/DraggableResizablePanel.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/LoginModal.tsx`
- `src/components/UserProfileModal.tsx`
- `src/components/AdminAreaModal.tsx`
- `src/components/DocumentationModal.tsx`
- `src/components/Editor/EditorExportQualityModal.tsx`
- `src/components/Editor/EditorViewOverlays.tsx`

Primary implementation files (expected):
- `src/components/ui/ResizableModalShell.tsx` (new shared abstraction)
- Existing modal components migrated incrementally to shared shell
- `src/components/__tests__/*` updates for resize handles and layout constraints

Functional scope:
- Define which overlays must be resizable vs fixed.
- Add consistent resize handles, min/max constraints, mobile fallbacks.
- Persist optional size/position where useful.

Acceptance criteria:
- All targeted modals follow one resize behavior contract.
- Resize state does not break keyboard/focus/accessibility flows.
- Mobile remains usable with constrained non-overflow layouts.

Dependencies:
- Coordinates with R-16 theme/layout adaptation.

---

### R-16: Interface Customization (Themes/Colors/Modes) (P2)
Goal:
- Add user-facing UI customization for theme mode and color styling.

Primary current files:
- `src/app/ui-theme.css`
- `src/app/globals.css`
- `src/lib/theme-tokens.ts`
- `src/components/SettingsModal.tsx`
- `src/components/Toolbar.tsx`
- `src/components/Editor/EditorView.tsx`

Primary implementation files (expected):
- `src/lib/themePreferences.ts` (new persistence helper)
- `src/components/SettingsModal.tsx` (theme mode + accent palette controls)
- `src/app/ui-theme.css` and `src/lib/theme-tokens.ts` (expanded token sets)
- `src/app/layout.tsx` (theme hydration/init)
- `src/components/__tests__/SettingsModal.test.tsx`

Functional scope:
- Mode selection (light/dark/system where supported).
- Accent and interface color presets with safe contrast constraints.
- Persist and apply preferences globally.

Acceptance criteria:
- Theme changes apply live across dashboard/editor/modals.
- Contrast and readability remain within accessibility guardrails.
- User preferences persist across sessions.

Dependencies:
- Works alongside R-15 to ensure modal shells inherit theme tokens cleanly.

## 6. Immediate Execution Queue (Recommended)
1. R-01 Durable Key Vault (P0)
2. R-13 Super Installer + first-run orchestration (P0)
3. R-12 Comfy custom workflows/nodes bundled integration (P1)
4. R-14 Comfy model catalog + custom upload UI (P1)
5. R-02 Campaign Workspace B2 (P1)
6. R-03 AI Critique Quality (P1)
7. R-04 Ollama Quality Track (P1)
8. R-05 Channels Advanced (P1)
9. R-06 and R-11 together (jobs + provider reliability)
10. R-07 and R-08 together (asset portability + cloud expansion)
11. R-15 and R-16 together (resizable UI shell + interface customization)
12. R-09 then R-10 (auth before direct posting)

## 7. Roadmap Change Control
Update this file in the same PR whenever:
- priority changes,
- scope changes,
- dependencies change,
- milestone placement changes,
- acceptance criteria are adjusted.

When an item is delivered:
- move status and completion notes into `docs/unified_progress_status.md`,
- update row state in `docs/feature_implementation_tracker.md`,
- refresh any related sections in `docs/application_bible.md`.
