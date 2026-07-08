# Release Notes — 2026-04-01

## Highlights
- Added local AI critique with Ollama for either the selected layer or the full canvas.
- Added first-pass local Ollama SVG generation through the shared image-generation workflow.
- Added Comfy workflow library/proxy infrastructure for server templates, custom workflow folders, and managed repo inspection.
- Added non-destructive mask gradient controls for clip-path masks.
- Fixed safe-area variant conversion geometry regression caused by stroke-inflated overlay frame bounds.

## Local AI (Ollama)
- Added persisted local runtime preferences for Ollama base URL and default model.
- Added `/api/ai/ollama/status` to validate local runtime/model availability from Settings.
- Added `/api/ai/ollama/critique` plus shared Ollama helpers for prompt construction, URL normalization, and image payload parsing.
- Added `/api/ai/ollama/install` so missing local models can be installed directly from Settings, AI Critique, and the Ollama generation flow.
- Added loopback fallback handling so server-side Ollama calls retry between `localhost` and `host.docker.internal` when the app and Ollama run on opposite sides of Docker.
- Added the `AI Critique` panel so users can review the active selection or the full canvas without leaving the editor.
- Added `npm run qa:ollama` so the live status, generation, and critique routes can be verified against a running app and local Ollama runtime.

## Remote Providers
- Added Google Gemini image generation to the shared generator route with aspect-ratio mapping for prompt-zone requests.
- Added Banana.dev image generation through a server-configured Banana endpoint using the saved Banana API key.
- Replaced the NanoBanana stub provider so AI Edit Notes can route edit jobs through the same Banana runtime.

## Account & Profile
- Added in-profile password changes to the User Profile modal, backed by a server-side current-password verification route for signed-in web accounts.
- Local desktop and guest sessions now keep the password-change controls disabled instead of showing a dead-end action.

## Asset Library & Sync
- Fixed AI-generated and AI-processed assets so they now save through the active storage mode instead of the legacy server-only path.
- Added shared asset persistence that writes to local library storage, Google Drive, or both depending on the current storage settings.
- Added automatic Asset Library refresh events so new generated assets appear immediately after save.

## Comfy Workflow Library
- Added `/api/ai/comfy/library` for server-template discovery, local workflow-folder scanning, and Comfy repo inspection.
- Added `/api/ai/comfy/proxy` for same-origin browser access to selected Comfy routes.
- Added loopback fallback handling so server-side access can try `host.docker.internal` when `localhost` is not reachable from Docker.
- Added runtime bootstrap support for `COMFY_CLOUD_URL` and `COMFY_CLOUD_API_KEY`, plus clearer free-tier Comfy Cloud API-auth messaging.
- Added `ComfyWorkflowLibraryPanel` to surface runnable server/custom workflows in the UI.

## Editor & Masking
- Added mask gradient utilities and coverage so clip-path masks can use editable linear or radial fades.
- Expanded the real Channels panel with a luminosity row, per-channel opacity controls, per-channel composite masks, and a Mask action so RGB/alpha/luminosity channel work is more useful for selected images and fillable layers.
- Navigator minimap now renders a real artboard thumbnail preview instead of object-outline boxes only, while preserving viewport drag and zoom controls.
- Fixed media-overlay safe-area variant conversion to use the logical frame box instead of the stroked outline, restoring expected positioning and scale values in variant drafts.
- Fixed the top tool-options strip so selection subtools can switch directly from the header bar, and improved the strip layout so marquee, lasso, wand, quick select, and selection brush controls stay reachable instead of appearing squeezed or hidden.
- Fixed left-rail insertions so new text, shapes, adjustment layers, media assets, and placeholder layers reopen the right properties panel instead of leaving the new layer selected with the properties dock hidden or stuck on a different mode.
- Fixed the circular right-click tool popup so it reflects the currently active tool instead of acting like a stateless launcher.
- Added Photoshop-style shortcut mappings for the supported editor tools and history commands.
- Added Alt/Option-drag duplication on selected layers so duplicate-drag behaves like Photoshop.

## Runtime Hardening
- Added a startup performance-API shim so partial browser or webview `performance` objects no longer crash chat or hydration paths when `clearMarks` and related methods are missing.

## Validation
- `npm.cmd test -- --runInBand --ci` -> passed (`57/57` suites)
- `npm run test:e2e -- e2e/export-verification.spec.ts e2e/media-overlay-verification.spec.ts` -> passed
- `npm run audit:repo` -> passed
- `npm.cmd run build` -> passed
- `npm.cmd run lint -- .` -> passed with existing warnings only