# Release Notes — 2026-04-02

## Highlights
- Fixed local Comfy image-based runs that were exporting the visible AI zone overlay into the source image.
- Added fast-fail blank-source detection plus a prepared-request debug snapshot for local Comfy troubleshooting.
- Added relative path support for Comfy `custom_nodes` and workflow-library folders under the configured install path.
- Added a front/back pseudo-backside preset for selected layers in the Properties panel.
- Hardened Ollama server fetches against transient network failures and mixed Docker/host routing.

## ComfyUI Reliability & Debugging
- Moved source-image capture into `imageGeneratorModalUtils.ts` so image-based Comfy tasks hide the AI zone overlay while exporting the selected zone or layer.
- Added white/blank source inspection before upload; `img2img`, `inpaint`, `outpaint`, and `upscale` now stop early with guidance when the captured source is almost entirely blank.
- Standard local Comfy runs now persist the latest prepared request snapshot in browser localStorage under `image-express-comfy-last-request`.
- The debug snapshot stores the UI prompt, prepared positive prompt, prepared negative prompt, workflow/model identifiers, output size, and whether the request included image or mask payloads.
- Shared Comfy params now forward the UI negative prompt into prepared workflow bindings for standard local runs.

## Comfy Local Path Handling
- `custom_nodes` and workflow-folder settings now accept relative child paths under the configured Comfy install path.
- Docker guidance was tightened so the saved install path must match the container-visible mount path, not a host-only Windows drive letter.

## Editor
- Added a front/back pseudo-backside preset to the Properties panel perspective controls.
- The preset preserves the layer's baseline horizontal flip state in `backsideBaseFlipX`, then toggles between front and mirrored back views without adding skew or taper automatically.

## Local AI Runtime
- Ollama server requests now retry transient `fetch failed` / socket-reset style network failures before giving up.
- Mixed host/container runs still fall back between `host.docker.internal` and `localhost`, so the same saved Ollama URL continues to work across Docker and host runs on macOS/Windows.

## Validation
- `npm test -- --runInBand src/components/__tests__/imageGeneratorModalUtils.test.ts src/lib/__tests__/ollamaServer.test.ts src/lib/comfyui/__tests__/registry.test.ts src/components/__tests__/PropertiesPanel.test.tsx src/components/properties/__tests__/SelectionProperties.test.tsx` -> passed
- `npm run build` -> passed
- Docker image rebuilt and `image-express-app` returned HTTP 200 on port 3000