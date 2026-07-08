# Repository Maintenance Audit

Purpose: keep file-size debt, obvious coverage gaps, and live placeholder backlog visible as the codebase changes.

## Audit Command

Run:

```bash
npm run audit:repo
```

The audit reports:
- source files over 500 lines
- test files over 500 lines
- larger modules without a direct same-name test heuristic
- runtime `coming soon` / `not implemented yet` markers still present in source

## Current Large Source Hotspots

Highest-priority oversized source files from the current audit snapshot:
- `src/components/ImageGeneratorModal.tsx` around 3728 lines after the first annotation-helper extraction pass
- `src/components/PropertiesPanel.tsx` around 3301 lines
- `src/components/Toolbar.tsx` around 2578 lines
- `src/components/SettingsModal.tsx` around 2116 lines
- `src/components/ThreeDGenerator.tsx` around 1833 lines
- `src/components/AssetLibrary.tsx` around 1498 lines
- `src/components/properties/PanelUtilityViews.tsx` around 1331 lines
- `src/components/Editor/EditorView.tsx` around 1227 lines
- `src/lib/googleDrive.ts` around 1047 lines
- `src/lib/comfyui/libraryServer.ts` around 991 lines

## Current Large Test Hotspots

Large tests still worth splitting further:
- `src/components/Editor/__tests__/EditorView.test.tsx`
- `src/components/__tests__/ImageGeneratorModal.test.tsx`
- `src/components/__tests__/Toolbar.test.tsx`
- `src/components/Editor/__tests__/TopToolOptionsBar.test.tsx`
- `src/components/AI/__tests__/StabilityGenerator.test.tsx`
- `src/components/__tests__/AssetLibrary.test.tsx`
- `src/components/__tests__/SettingsModal.test.tsx`

## Live Placeholder Backlog Still in Code

The audit continues to surface these runtime placeholders:
- Channels panel implementation
- Google Imagen runtime completion
- Banana.dev runtime completion
- NanoBanana runtime completion
- Facebook sign-in/auth integration
- provider-specific `coming soon` branches in parts of 3D generation

## Cleanup Rules

- Browser-test artifacts belong in ignored generated directories only.
- `test-results/` and `playwright-report/` should not be committed.
- New feature work should prefer extracting helpers/tests instead of growing existing coordinator files further.
- `ImageGeneratorModal.tsx` has started its extraction pass through `src/components/image-generator/annotationCanvasUtils.ts`; keep peeling self-contained canvas/annotation helpers out instead of adding new logic inline.