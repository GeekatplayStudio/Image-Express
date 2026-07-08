# Generative AI Upgrade Plan (2026-02-26)

## Goal
Make Generative workflows feel instant and idea-first, closer to the reference UX:
- Open directly in a ready-to-use Generative Fill flow.
- Keep mask painting obvious (translucent pink/red overlay).
- Keep provider/model complexity in Settings, not in the creative path.

## Phase 1 (Implemented)
1. Centralize preferences
- Added `src/lib/generative-preferences.ts`.
- Single source of truth for:
  - default provider (`stability`, `openai`, `google`, `banana`, `comfy`)
  - default workflow (`zone` or Stability workflows)
  - local ComfyUI URL
  - auto-start inpaint masking
  - quick prompt dock toggle

2. Settings integration
- Added "Generative Defaults" section in `SettingsModal`.
- User can configure provider + startup workflow + ComfyUI URL.
- Added toggles for:
  - auto-start mask brush in Generative Fill
  - quick prompt dock for fill workflow

3. Generative tool startup behavior
- `ImageGeneratorModal` now resolves launch mode from centralized preferences.
- Stability workflows open directly into `StabilityGenerator` tab (e.g. inpaint).
- Zone rectangle is not created when launching into Stability fill mode.

4. Reference-style inpaint ergonomics
- `StabilityGenerator` supports:
  - `initialTab`
  - `autoStartInpaintMasking`
  - quick fill dock (prompt + Fill action)
- Mask brush color aligned to translucent pink/red.

5. Test coverage
- Added tests for preference storage/launch resolution:
  - `src/lib/__tests__/generative-preferences.test.ts`
- Extended Stability generator tests for default inpaint + auto-mask startup.

6. Compatibility safety layer
- Added provider/workflow compatibility guards:
  - provider readiness (`ready` vs `coming-soon`)
  - workflow filtering per provider
  - launch fallback to a runtime-ready provider
- Wired these checks into Settings + Setup Wizard + Generative modal.

## Phase 2 (Next)
1. Provider capability matrix
- Explicitly map features per provider (generate/inpaint/outpaint/upscale).
- Hide unsupported actions per provider instead of showing generic tabs.

2. Local AI installer handoff
- Add dedicated "Install Local AI (ComfyUI)" block in Setup Wizard.
- Detect/validate local Comfy connection and model readiness automatically.

3. Prompt-first bottom bar across workflows
- Extend quick dock beyond inpaint to img2img/outpaint where useful.
- Add keyboard-first action loop (Enter = Fill/Run).

4. Server route parity
- Complete Google/Banana endpoints in `/api/ai/generate-image`.
- Keep provider swap seamless without UX changes.

## External UX references used
- Krita AI Diffusion project and docs:
  - https://github.com/Acly/krita-ai-diffusion
  - https://docs.interstice.cloud/comfyui-setup/
  - https://github.com/Acly/krita-ai-diffusion/wiki/Custom-Workflows
- GIMP local AI plugin patterns:
  - https://github.com/intel/openvino-ai-plugins-gimp
  - https://www.intel.com/content/www/us/en/developer/articles/tool/enable-ai-for-gimp-core-ultra-mobile-processors.html
