# Image Express - Release Notes Archive (2026)

This archive consolidates historical release notes for Image Express.

---

## Release Notes — 2026-08-01

Reliability release: the install → build → package chain now works from a clean
clone, and the shipped UI is no longer corrupted in ten languages.

### Installers and build
- **Node 24+ is enforced instead of warned about.** A version manager that
  leaves an older Node first on `PATH` no longer produces a broken install:
  installers and launchers switch to a supported Node automatically, and
  `npm run build` stops with the exact command to fix your shell. Added
  `npm run doctor:node`.
- **`desktop:*` scripts provision the Electron runtime on demand**
  (`npm run electron:ensure`). Previously `node_modules/electron/dist` never
  existed on a fresh clone, so every desktop script failed.
- **Desktop package shrank from 2.6 GB to 453 MB** (installer: 122.7 MB). Next's
  file tracing had been pulling the entire project root — including the 1.2 GB
  `3d-models/` folder and previous installer builds — into the app.
  `desktop:verify-package` now fails on leaked entries and a size budget.

### Internationalisation
- **Fixed mojibake in every non-English language.** Russian, Ukrainian, German,
  French, Spanish, Italian, Polish, Portuguese, Japanese and Chinese all
  displayed double-encoded text (`страница` shown as `ÑÑ‚Ñ€Ð°Ð½Ð¸Ñ†Ð°`).
  6,624 strings repaired; `scripts/i18n-fix-mojibake.mjs --check` prevents a
  recurrence.

### Fixes
- Storage settings no longer crash when the watch-roots endpoint returns a
  response without a `roots` array.
- Asset Vault page-size label no longer had an unreachable branch.

### Quality
- Test suite restored to green: **148 suites, 864 tests**, from 63 failures.
- `npm run verify` (audits → lint → types → tests → build → bundle) passes.
- Dependencies: six unused packages removed, Jest 29→30 and `@electron/asar`
  3→4 to drop deprecated transitives, all in-range updates applied.
  `npm audit`: 0 vulnerabilities.

---

## Release Notes — 2026-07-29

### Highlights
- Added **AI Brand Manager**: Brand Kit setup, VLM compliance auditor, visual canvas bounding box overlays for detected violations, and local storage persistence.
- Added **Super Agent System & Agent Creator**: Autonomous single-prompt design execution engine, step timeline runner, and sub-agent creator for custom design roles.
- Exposed 5 new MCP tools in `scripts/mcp-server.mjs` (`get_brand_profile`, `audit_brand_compliance`, `list_super_agents`, `create_super_agent`, `execute_super_agent_task`).

### AI Brand Manager
- Integrated `BrandManagerModal` into top tools dropdown and toolbar AI menu.
- Added `brandProfile.ts` for managing color palettes, approved fonts, logo rules, and layout margins.
- Added `brandAuditEngine.ts` featuring automatic metadata extraction, VLM audit prompt builder, and a deterministic heuristic evaluation fallback.
- Added interactive canvas visual highlights (`[left, top, width, height]`) on top of Fabric.js canvas when inspecting audit violations.

### Super Agent System
- Integrated `SuperAgentModal` for entering natural language prompts and generating multi-step design execution plans.
- Added `superAgentEngine.ts` for executing sequential step actions (`SET_CANVAS_SIZE`, `SET_BACKGROUND_COLOR`, `ADD_SHAPE`, `ADD_TEXT`, `RUN_BRAND_AUDIT`) directly on the canvas.
- Added Custom Agent Creator drawer for creating, configuring, and storing specialized sub-agents with custom canvas dimensions and instructions.

---

## Release Notes — 2026-07-23

### Highlights
- Fixed popup window z-index layering above editor header and rails by portalled floating overlays to `document.body`.
- Refactored core modules (`googleDrive.ts`, ComfyUI `registry.ts`, `runner.ts`, `connection.ts`) into smaller, modular sub-components for improved maintainability.
- Expanded unit test coverage for Google Drive auth/query helpers and ComfyUI workflow registry & graph inspection helpers.

### UI & Popups Layering Fix
- Floating property popups and toolbar modals (Color Wheel, AI Critique, Comfy Workflows) now portal to `<body>` using `BodyPortal` and SSR-safe `useIsClient` hook.
- Adjusted editor header z-index to `z-90` and floating properties panel to `z-100` to guarantee popups render above application chrome.

### Modular Architecture Refactoring
- Decomposed `googleDrive.ts` into single-responsibility modules: `constants.ts`, `types.ts`, `errors.ts`, `config.ts`, `helpers.ts`, `auth.ts`, `folders.ts`, `session.ts`, and index barrel exports.
- Decomposed ComfyUI subsystem into modular files:
  - `registry.ts` split into `registryTypes.ts`, `promptBlueprint.ts`, and `registry.ts`.
  - `runner.ts` split into `runnerTypes.ts`, `workflowInspection.ts`, and `runner.ts`.
  - `connection.ts` split into `connectionTypes.ts`, `cloudConfig.ts`, `transport.ts`, and `connection.ts`.
- Preserved exact public import surfaces for all refactored modules to ensure full backward compatibility.

### Validation
- All unit test suites and TypeScript checks passing.

---

## Release Notes — 2026-05-22

### Highlights
- Local ComfyUI generation now verifies runtime availability before source capture, warmup, or queue submission.
- Known local Comfy connection failures now surface as inline modal status messages instead of noisy console errors.
- Added focused regression coverage for the local-down generate path and Comfy requirement-install prompt flow.

### ComfyUI Generate Reliability
- `ImageGeneratorModal` now runs a Comfy connection preflight immediately after workflow/model selection validation, so every Comfy task fails fast when the configured local runtime is unavailable.
- The generate flow now stops cleanly before task-specific source-image capture for `img2img`, `inpaint`, `outpaint`, and `upscale` when local ComfyUI cannot be reached.
- User-handled local Comfy connection failures continue to update the modal status banner without falling through to `console.error` noise.

### Validation
- `node .\\node_modules\\jest\\bin\\jest.js "src/components/__tests__/ImageGeneratorModal.test.tsx" --json --outputFile=test-results.json` -> passed (`23/23`)

---

## Release Notes — 2026-04-02

### Highlights
- Fixed local Comfy image-based runs that were exporting the visible AI zone overlay into the source image.
- Added fast-fail blank-source detection plus a prepared-request debug snapshot for local Comfy troubleshooting.
- Added relative path support for Comfy `custom_nodes` and workflow-library folders under the configured install path.
- Added a front/back pseudo-backside preset for selected layers in the Properties panel.
- Hardened Ollama server fetches against transient network failures and mixed Docker/host routing.

### ComfyUI Reliability & Debugging
- Moved source-image capture into `imageGeneratorModalUtils.ts` so image-based Comfy tasks hide the AI zone overlay while exporting the selected zone or layer.
- Added white/blank source inspection before upload; `img2img`, `inpaint`, `outpaint`, and `upscale` now stop early with guidance when the captured source is almost entirely blank.
- Standard local Comfy runs now persist the latest prepared request snapshot in browser localStorage under `image-express-comfy-last-request`.
- The debug snapshot stores the UI prompt, prepared positive prompt, prepared negative prompt, workflow/model identifiers, output size, and whether the request included image or mask payloads.
- Shared Comfy params now forward the UI negative prompt into prepared workflow bindings for standard local runs.

### Comfy Local Path Handling
- `custom_nodes` and workflow-folder settings now accept relative child paths under the configured Comfy install path.
- Docker guidance was tightened so the saved install path must match the container-visible mount path, not a host-only Windows drive letter.

### Editor
- Added a front/back pseudo-backside preset to the Properties panel perspective controls.
- The preset preserves the layer's baseline horizontal flip state in `backsideBaseFlipX`, then toggles between front and mirrored back views without adding skew or taper automatically.

### Local AI Runtime
- Ollama server requests now retry transient `fetch failed` / socket-reset style network failures before giving up.
- Mixed host/container runs still fall back between `host.docker.internal` and `localhost`, so the same saved Ollama URL continues to work across Docker and host runs on macOS/Windows.

### Validation
- `npm test -- --runInBand src/components/__tests__/imageGeneratorModalUtils.test.ts src/lib/__tests__/ollamaServer.test.ts src/lib/comfyui/__tests__/registry.test.ts src/components/__tests__/PropertiesPanel.test.tsx src/components/properties/__tests__/SelectionProperties.test.tsx` -> passed
- `npm run build` -> passed
- Docker image rebuilt and `image-express-app` returned HTTP 200 on port 3000

---

## Release Notes — 2026-04-01

### Highlights
- Added local AI critique with Ollama for either the selected layer or the full canvas.
- Added first-pass local Ollama SVG generation through the shared image-generation workflow.
- Added Comfy workflow library/proxy infrastructure for server templates, custom workflow folders, and managed repo inspection.
- Added non-destructive mask gradient controls for clip-path masks.
- Fixed safe-area variant conversion geometry regression caused by stroke-inflated overlay frame bounds.

### Local AI (Ollama)
- Added persisted local runtime preferences for Ollama base URL and default model.
- Added `/api/ai/ollama/status` to validate local runtime/model availability from Settings.
- Added `/api/ai/ollama/critique` plus shared Ollama helpers for prompt construction, URL normalization, and image payload parsing.
- Added `/api/ai/ollama/install` so missing local models can be installed directly from Settings, AI Critique, and the Ollama generation flow.
- Added loopback fallback handling so server-side Ollama calls retry between `localhost` and `host.docker.internal` when the app and Ollama run on opposite sides of Docker.
- Added the `AI Critique` panel so users can review the active selection or the full canvas without leaving the editor.
- Added `npm run qa:ollama` so the live status, generation, and critique routes can be verified against a running app and local Ollama runtime.

### Remote Providers
- Added Google Gemini image generation to the shared generator route with aspect-ratio mapping for prompt-zone requests.
- Added Banana.dev image generation through a server-configured Banana endpoint using the saved Banana API key.
- Replaced the NanoBanana stub provider so AI Edit Notes can route edit jobs through the same Banana runtime.

### Account & Profile
- Added in-profile password changes to the User Profile modal, backed by a server-side current-password verification route for signed-in web accounts.
- Local desktop and guest sessions now keep the password-change controls disabled instead of showing a dead-end action.

### Asset Library & Sync
- Fixed AI-generated and AI-processed assets so they now save through the active storage mode instead of the legacy server-only path.
- Added shared asset persistence that writes to local library storage, Google Drive, or both depending on the current storage settings.
- Added automatic Asset Library refresh events so new generated assets appear immediately after save.

### Comfy Workflow Library
- Added `/api/ai/comfy/library` for server-template discovery, local workflow-folder scanning, and Comfy repo inspection.
- Added `/api/ai/comfy/proxy` for same-origin browser access to selected Comfy routes.
- Added loopback fallback handling so server-side access can try `host.docker.internal` when `localhost` is not reachable from Docker.
- Added runtime bootstrap support for `COMFY_CLOUD_URL` and `COMFY_CLOUD_API_KEY`, plus clearer free-tier Comfy Cloud API-auth messaging.
- Added `ComfyWorkflowLibraryPanel` to surface runnable server/custom workflows in the UI.

### Editor & Masking
- Added mask gradient utilities and coverage so clip-path masks can use editable linear or radial fades.
- Expanded the real Channels panel with a luminosity row, per-channel opacity controls, per-channel composite masks, and a Mask action so RGB/alpha/luminosity channel work is more useful for selected images and fillable layers.
- Navigator minimap now renders a real artboard thumbnail preview instead of object-outline boxes only, while preserving viewport drag and zoom controls.
- Fixed media-overlay safe-area variant conversion to use the logical frame box instead of the stroked outline, restoring expected positioning and scale values in variant drafts.
- Fixed the top tool-options strip so selection subtools can switch directly from the header bar, and improved the strip layout so marquee, lasso, wand, quick select, and selection brush controls stay reachable instead of appearing squeezed or hidden.
- Fixed left-rail insertions so new text, shapes, adjustment layers, media assets, and placeholder layers reopen the right properties panel instead of leaving the new layer selected with the properties dock hidden or stuck on a different mode.
- Fixed the circular right-click tool popup so it reflects the currently active tool instead of acting like a stateless launcher.
- Added Photoshop-style shortcut mappings for the supported editor tools and history commands.
- Added Alt/Option-drag duplication on selected layers so duplicate-drag behaves like Photoshop.

### Runtime Hardening
- Added a startup performance-API shim so partial browser or webview `performance` objects no longer crash chat or hydration paths when `clearMarks` and related methods are missing.

### Validation
- `npm.cmd test -- --runInBand --ci` -> passed (`57/57` suites)
- `npm run test:e2e -- e2e/export-verification.spec.ts e2e/media-overlay-verification.spec.ts` -> passed
- `npm run audit:repo` -> passed
- `npm.cmd run build` -> passed
- `npm.cmd run lint -- .` -> passed with existing warnings only

---

## Release Notes — 2026-03-01

### Highlights
- Improved AI Edit Notes reliability for long-running Comfy/Flux workloads.
- Updated aspect sizing behavior to better balance user control and model-optimized render dimensions.
- Added automatic cleanup for temporary `job_*` artifacts.

### AI Edit Notes + Comfy/Flux
- Added longer AI Edit Notes polling windows for heavy provider runs.
- Added manual abort controls during AI Edit Notes processing.
- Improved Comfy recovery behavior so canceled prompt IDs are not auto-resumed after reload.
- Improved provider/task/workflow compatibility handling for reference-image edit routes.

### Aspect & Render Sizing
- Primary aspect input remains user-editable.
- UI displays model-adapted render dimensions for selected workflow/model.
- Users are warned when current custom size is suboptimal for selected model bucket.

### Job Lifecycle & Cleanup
- Temporary job uploads (source/mask/notes/references/prompts/annotation artifacts) are cleaned automatically after process completion.
- Job record files are removed after final result retrieval.
- Old terminal jobs are pruned automatically with a retention window (default: 6 hours).

### Notes
- Final generated outputs remain in `public/assets/generated/images`.
- Cleanup targets temporary processing artifacts and stale terminal job records.

---

## Release Notes — 2026-02-27

### Summary
This update focuses on runtime stability and cloud-auth robustness while continuing the editor refactor program to reduce integration-file complexity.

### Shipped
- Fixed canvas flicker / React update-depth loop risk by stabilizing `DesignCanvas` initialization callbacks with refs and tightening effect dependencies.
- Reduced repeated Fabric canvas teardown/re-init behavior from parent callback identity churn.
- Hardened Google Drive cloud listing flow:
  - passive asset fetch now uses non-interactive auth
  - no popup auth attempts from background effects
  - graceful fallback to local/server assets when re-auth requires user action
- Added safer default for `listDriveAssets` auth mode to prevent unintended popup token requests.
- Added extraction slices in editor menu/header composition and top tool-options bridge props to continue line-count reduction work.

### Validation
- Production build passed (`npm.cmd run build`).
- Type checks clean for updated stability/auth modules.

### Notes
- Browser-level extension message-channel errors (`listener indicated an asynchronous response...`) are environment/extension-originated and not from app message listeners in this codebase.

---

## Release Notes — 2026-02-26

### Summary
This release consolidates recent editor UX and workflow upgrades across adjustments, color tooling, text editing, shapes, and swatch management, with matching documentation updates.

### Shipped
- Expanded adjustment layer system with additional types:
  - Brightness/Contrast
  - Color Balance
  - Light and Color
  - Solid Color
- Left-rail-first adjustment creation flow (`Adjustment Layers`) with immediate focus on new layer properties.
- Right properties color panel parity upgrade:
  - Embedded color wheel
  - Editable RGB / HSB / CMYK / Lab channel values
  - Profile context modes (sRGB, Adobe RGB, CMYK Print)
- Harmony workflow upgrades:
  - Save, rename, delete
  - Import/export JSON
  - Compact/collapsible harmony list improvements
- Swatches workflow upgrades:
  - Grouped swatch sets
  - Create/select/remove groups
  - Add/remove swatches directly in the swatches panel
  - Persistence updates for grouped swatches
- Text workflow updates:
  - Multiline text editing in properties panel
  - Text-on-path render safety improvements to reduce clipping
- Shape tool expansion:
  - Thought bubble, cloud, hexagon, diamond

### Validation
- Production build passed (`npm.cmd run build`).
- Docs updated to align feature and progress tracking with shipped implementation.

### Commit / Push
- Commit: `2030711`
- Branch: `main`
- Remote: `origin`
- Status: pushed to GitHub
