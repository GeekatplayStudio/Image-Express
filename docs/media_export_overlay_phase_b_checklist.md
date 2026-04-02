# Media Export Overlay Phase B Checklist

Purpose: bridge the current single-canvas media overlay workflow into a campaign-style variant workflow without introducing multiple live Fabric engines.

## Scope
- Keep A1/A2/A3 overlay export as the default lightweight workflow.
- Add an optional `convert frame to variant` action for users who need channel-specific edits.
- Reuse the existing single active editor canvas by swapping variant snapshots, not by rendering multiple live canvases.

## Implementation Order

### 1. Data Model and Persistence
- [x] Add `CampaignWorkspace` and `CampaignVariant` types alongside existing media overlay types.
- [x] Persist variant entries locally as editor JSON snapshots plus frame preset, bounds, safe-area metadata, and default export profile.
- [ ] Add thumbnail capture for saved variants.
- [ ] Store source linkage back to the originating media overlay frame id and preset.
- [ ] Define migration rules so designs without variants keep loading unchanged.

### 2. Frame-to-Variant Conversion
- [x] Add `convert frame to variant` to the media overlay frame actions/menu for the active frame.
- [x] Seed the new variant from the current editor snapshot plus the selected frame preset and bounds.
- [ ] Capture initial adaptation mode metadata (`fit`, `fill`, `safe-area`) for later deterministic transforms.
- [x] Keep conversion idempotent for the same frame when the user retries or updates a variant.

### 3. Variant Workspace Shell
- [ ] Add a variant list panel or flyout with active variant selection, rename, duplicate, and remove actions.
- [ ] Load one variant snapshot into the existing editor canvas at a time.
- [ ] Preserve undo/redo semantics when switching variants by resetting history safely per loaded snapshot.
- [ ] Show clear active-variant state in the export/share UI.

### 4. Deterministic Adaptation Actions
- [ ] Implement `Fit`, `Fill`, and `Safe Area` actions for a variant using the existing crop/artboard math.
- [ ] Flag text or object overflow after adaptation for manual review.
- [ ] Keep all adaptation actions reversible through variant snapshot history.

### 5. Variant Export
- [ ] Add `Export Current Variant` using the existing export quality flow scoped to the active variant.
- [ ] Add `Export All Variants` ZIP output with preset-aware file names and optional manifest metadata.
- [ ] Support per-variant export presets without changing the existing overlay batch export behavior.

### 6. Validation
- [ ] Add regression tests for normal PNG/JPG/PDF export using full artboard bounds even when overlay frames exist.
- [ ] Add tests for frame-to-variant conversion, variant switching, and variant-scoped export.
- [x] Add browser-level export verification before enabling `Export All Variants` for release.
	Browser coverage now exists for full-artboard PNG/JPG/PDF downloads with overlay framing present via `npm run test:e2e -- e2e/export-verification.spec.ts`.
	Additional browser coverage now exists for media-overlay batch ZIP export plus variant-draft conversion, save, cleanup, and variant PNG export via `npm run test:e2e -- e2e/media-overlay-verification.spec.ts`.

## Constraints
- Avoid multiple simultaneous Fabric canvases.
- Do not regress normal design export behavior when media overlay is enabled.
- Keep variant creation optional; users who only need crop-based export should stay on the A1/A2/A3 path.