# Release Notes — 2026-05-22

## Highlights
- Local ComfyUI generation now verifies runtime availability before source capture, warmup, or queue submission.
- Known local Comfy connection failures now surface as inline modal status messages instead of noisy console errors.
- Added focused regression coverage for the local-down generate path and Comfy requirement-install prompt flow.

## ComfyUI Generate Reliability
- `ImageGeneratorModal` now runs a Comfy connection preflight immediately after workflow/model selection validation, so every Comfy task fails fast when the configured local runtime is unavailable.
- The generate flow now stops cleanly before task-specific source-image capture for `img2img`, `inpaint`, `outpaint`, and `upscale` when local ComfyUI cannot be reached.
- User-handled local Comfy connection failures continue to update the modal status banner without falling through to `console.error` noise.

## Validation
- `node .\\node_modules\\jest\\bin\\jest.js "src/components/__tests__/ImageGeneratorModal.test.tsx" --json --outputFile=test-results.json` -> passed (`23/23`)