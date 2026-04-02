# Release Notes — 2026-04-01

## Highlights
- Added local AI critique with Ollama for either the selected layer or the full canvas.
- Added Comfy workflow library/proxy infrastructure for server templates, custom workflow folders, and managed repo inspection.
- Added non-destructive mask gradient controls for clip-path masks.
- Fixed safe-area variant conversion geometry regression caused by stroke-inflated overlay frame bounds.

## Local AI (Ollama)
- Added persisted local runtime preferences for Ollama base URL and default model.
- Added `/api/ai/ollama/status` to validate local runtime/model availability from Settings.
- Added `/api/ai/ollama/critique` plus shared Ollama helpers for prompt construction, URL normalization, and image payload parsing.
- Added the `AI Critique` panel so users can review the active selection or the full canvas without leaving the editor.

## Comfy Workflow Library
- Added `/api/ai/comfy/library` for server-template discovery, local workflow-folder scanning, and Comfy repo inspection.
- Added `/api/ai/comfy/proxy` for same-origin browser access to selected Comfy routes.
- Added loopback fallback handling so server-side access can try `host.docker.internal` when `localhost` is not reachable from Docker.
- Added `ComfyWorkflowLibraryPanel` to surface runnable server/custom workflows in the UI.

## Editor & Masking
- Added mask gradient utilities and coverage so clip-path masks can use editable linear or radial fades.
- Fixed media-overlay safe-area variant conversion to use the logical frame box instead of the stroked outline, restoring expected positioning and scale values in variant drafts.

## Validation
- `npm.cmd test -- --runInBand --ci` -> passed (`57/57` suites)
- `npm.cmd run build` -> passed
- `npm.cmd run lint -- .` -> passed with existing warnings only