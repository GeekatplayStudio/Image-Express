# PRD: 3D Layer & VFX Tools for Image Express

**Date:** 2026-07-23 · **Status:** Draft for review
**Reference:** [ComfyUI-NKD-VFX-Tools](https://github.com/Nekodificador/ComfyUI-NKD-VFX-Tools) (GPL-3.0 — reference for *algorithms and UX only*; we re-implement, we do not copy code — see §10 Licensing)

---

## 1. Summary

Add a new **3D layer** type to the canvas. Unlike today's 3D flow (modal editor → baked PNG), a 3D layer is a *live, re-editable* compositing layer that hosts:

1. **Perspective Unwarp / Rewarp** — pick a planar region of a photo with a 4-corner grid, edit it flat, project it back with correct perspective.
2. **Relight** — generate depth + normal maps from any image and relight it with our existing sun/lighting UI, plus local point lights with falloff and screen-space shadows.
3. **3D object preview in-canvas** — place GLB models (from our existing generators) as live objects with transform gizmos, lit by the same lighting system, with ground shadows.
4. **VFX tools** — depth-of-field lens blur and related depth-driven effects.
5. **Global vs. local lighting** — one sun per canvas (global) shared by all 3D layers, plus per-layer local lights.

All lighting reuses the conventions of `ThreeDLayerEditor` (LightGizmo sun, presets, VSM shadows, `ThreeDSettings`), now available per-layer from the Properties panel instead of only inside the modal.

## 2. Why (analysis of the reference)

The NKD pack's value is not ComfyUI plumbing — it's four solid, browser-portable algorithms, each of which already has a JS/GLSL twin in the reference:

| Feature | Core algorithm | Verdict |
|---|---|---|
| Unwarp/Rewarp | 4-pt DLT homography, Zhang & He metric aspect, homography-rescale round-trip, supersampled minification, inward-only feather, LAB color match | **Adopt** — the round-trip design (edit at native res, rescale H instead of resizing the edit) is exactly right for a layer-based editor |
| Relight | Screen-space shading: Lambert + wrapped diffuse, windowed-quadratic falloff, Blinn-Phong spec, 24-step depth ray-march shadows | **Adopt shader, improve model** — it has no ML models; we add depth/normal estimation (see §5.3) and lift the 3-light cap |
| Preview 3D | Three.js viewport, photo-as-IBL (PMREM), shadow catcher, disparity-space depth compositing, Theil–Sen depth auto-calibration | **Adopt selectively** — we already have a better 3D editor; steal IBL-from-canvas, shadow catcher, depth calibration |
| fSpy camera solve | 2-VP orthogonality solve → orientation + focal (~150 dependency-free lines) | **Adopt** — powers "match the photo's perspective" for both unwarp ground-grid and 3D object placement |
| Lens blur | 8-level Gaussian kernel bank + per-pixel level lerp, smoothed CoC map | **Adopt, improve** — add occlusion-aware gathering to fix fg/bg halo |

**UX patterns to steal:** magnifier loupe with crosshair on precision drags; vanishing-point-preserving edge-midpoint handles; radial arc-scrub gizmos on light dots; sphere-joystick for light direction (we already have LightGizmo — keep ours); graceful degenerate-input fallbacks (warn + sane default, never crash).

**Where we do better than the reference:** real ML depth/normal generation built in (they rely on external nodes); more than 3 lights; live layer-based editing instead of node re-queuing; occlusion-aware DoF; global + local lighting hierarchy; full undo/history/autosave integration.

## 3. Architecture decision: hybrid live/baked

The map of our codebase (Fabric.js v7 canvas; every layer is a Fabric object; 3D currently bakes to PNG via `useEditorThreeDWorkspace`) gives two options. **Decision: hybrid.**

- The 3D layer is a Fabric image object (`type3DLayer: true`) whose pixels are a **bake** of an offscreen Three.js/WebGL render — so all existing systems (serialization, undo, export, shared layers, clipping) work unchanged.
- While the layer is **selected**, a transparent R3F/WebGL overlay is mounted above the Fabric canvas, aligned to the layer's transform, giving live preview + gizmos. On deselect/commit, it re-bakes and unmounts. This is "edit-in-place" rather than "edit-in-modal" — same bake model as today, but the editor comes to the canvas.
- All source data (source image, corner quad, depth/normal maps as dataURL/blob refs, lights, model URL, camera solve) persists in a new `threeDLayerSettings` bag → layer is losslessly re-editable forever.

This avoids the huge cost of permanent live-WebGL-over-Fabric compositing (hit-testing, z-order interleaving, export headaches) while still feeling live.

## 4. Data model

`src/types.ts`:

```ts
export type ThreeDLayerMode = 'unwarp' | 'relight' | 'object' | 'vfx';

export interface ThreeDLayerLight {
  id: string; kind: 'point' | 'directional';
  color: string; intensity: number;
  // point: screen-space position + depth, windowed-quadratic falloff radius
  x?: number; y?: number; z?: number; radius?: number; softness?: number;
  // directional: azimuth/elevation
  azimuth?: number; elevation?: number;
  shadows: { enabled: boolean; strength: number; softness: number; range: number };
}

export interface ThreeDLayerSettings {
  mode: ThreeDLayerMode;
  sourceRef?: string;                  // original image (asset/blob ref)
  // unwarp
  corners?: [number, number][];        // TL,TR,BR,BL normalized
  aspectMode?: 'auto' | 'metric'; focal35?: number;
  rewarp?: { feather: number; edgeHardness: number; matchColors: boolean; seamless: boolean };
  gridDivisions?: number;
  // relight / vfx
  depthRef?: string; normalRef?: string; albedoRef?: string;
  depthSpace?: 'disparity' | 'linear'; depthNear?: number; depthFar?: number;
  useGlobalLight: boolean;             // inherit canvas sun
  lights: ThreeDLayerLight[];          // local lights
  ambient: { color: string; intensity: number };
  delitMix?: number;
  lensBlur?: { enabled: boolean; focus: [number, number]; focalOffset: number; strength: number; fieldOfDepth: number };
  // object mode
  modelUrl?: string;
  objectTransform?: { position: [number,number,number]; rotation: [number,number,number]; scale: number; pivot: 'bottom'|'center'|'origin' };
  cameraSolve?: { quaternion: [number,number,number,number]; fovV: number; origin: [number,number] } | null;
  threeD?: ThreeDSettings;             // reuse existing lighting/shadow bag for object mode
}
```

Plus a per-canvas **global light** (the "sun") stored on the project canvas record: `canvas.globalLight?: { azimuth, elevation, color, intensity, ambient }` in `projectStore.ts`. Layers with `useGlobalLight: true` re-bake when it changes.

Flag on the Fabric object: `is3DLayer: true` + `threeDLayerSettings` — both added to `ExtendedFabricObject`, `CUSTOM_SERIALIZED_PROPS` (editorViewConfig.ts:140), the Toolbar.tsx:2147 duplicate list, and `duplicateCanvasSelection.ts` (⚠️ three lists to keep in sync — consider unifying them into one exported constant as part of this work).

## 5. Features

### 5.1 3D layer basics (P0)
- Toolbar: "Add 3D Layer" (menu: From Image → Unwarp / Relight; From 3D Model; Empty VFX).
- Layers panel: distinct icon (lucide `Box`/`Boxes`) in `SortableLayerItem.tsx`, default name via `layeritem.3dlayer`.
- Properties panel: new `ThreeDLayerProperties.tsx` section routed from `PropertiesPanel.tsx` on `is3DLayer` — mode-specific controls + "Edit on canvas" button mounting the overlay.
- Guards in `useLayerOperations.ts` (clip/merge behavior: mergeable = rasterize bake, like adjustment flatten).
- Full undo/autosave/export support for free via the bake + serialized settings.

### 5.2 Perspective Unwarp / Rewarp (P0)
- Enter edit → overlay shows source image with 4 corner handles + 4 VP-preserving edge-midpoint handles + projective grid (0–16 divisions) + magnifier loupe while dragging.
- Homography: 4-pt DLT (SVD or direct 8×8 solve, as in the reference's JS). Aspect: auto (edge ratios) and metric (Zhang & He, focal from `focal35` or fSpy solve of the canvas image).
- The flat ("unwarped") view becomes the layer's editable face: user can paint/paste/generate on it (implementation: the flat image is a nested editable buffer; commit re-projects).
- Rewarp render: WebGL textured quad with projective UV (or fragment-shader homography); supersample on minification; inward-only feather; edge-hardness alpha remap; optional LAB Reinhard color match; composite modes: into-original / transparent element.
- Ground-grid preset: fSpy-style 2-VP solve (drag 2×2 line pairs) to establish ground plane + camera for placing the quad "on the floor" and for object mode (shared solver module).

### 5.3 Depth & normal generation (P0 — prerequisite for relight/VFX)
- The reference ships no models; we build this in. Provider abstraction `src/lib/depth/`:
  - **Local (default, free):** Depth Anything V2 small via `@huggingface/transformers` (WebGPU with WASM fallback) — runs in a worker, gated behind the standard AI gate (`image-express-3dlayer-gate-dismissed`, mirroring `GeneratorSetupGate`).
  - **Cloud (optional):** route via existing AI provider pattern (`src/app/api/ai/*`) for higher-quality depth (e.g. Marigold-class) when the user has keys configured.
- Normals: derived from depth via Sobel gradient in a shader/worker (cheap, controllable strength), stored as `normalRef`. Optional future: dedicated normal estimator.
- Maps cached in IndexedDB keyed by source hash; regenerate button; user can also import/paint depth manually.

### 5.4 Relight (P0)
- Port the reference's shader as our own GLSL (raw WebGL quad or Three ShaderMaterial): base = lerp(rgb, albedo, delitMix); ambient + Σ lights; directional Lambert; point lights in screen space with windowed-quadratic falloff and wrapped diffuse; Blinn-Phong spec when roughness present; 24-step depth ray-march screen-space shadows with the reference's bias constants.
- **Improvements over reference:** no 3-light cap (soft cap ~8 for perf); tone-map option (Reinhard) instead of hard clamp; `depthSpace` explicit (disparity vs linear) so point-light z behaves predictably.
- **Global lighting:** the canvas sun (same LightGizmo UX as `ThreeDLayerEditor`, presets from `LIGHT_PRESETS`) maps to a directional light in every `useGlobalLight` 3D layer; editable from a canvas-level lighting popover. **Local lighting:** per-layer point/directional lights with the arc-scrub gizmo (drag dot to move; radial sectors scrub intensity / z / radius; double-click toggles).
- Relight applies in unwarp mode too (light the rewarped region consistently with the scene).

### 5.5 3D object mode (P1)
- Place a GLB (from Asset Library / 3D generators / file) as a live 3D layer. Overlay: R3F scene with drei OrbitControls disabled in favor of **object gizmos** — translate/rotate/scale (three.js `TransformControls`), pivot mode bottom/center/origin.
- Lighting: reuse `ThreeDSettings` + VSM shadow pipeline from `ThreeDLayerEditor` verbatim; sun follows global light when enabled; **IBL from the canvas itself** (render surrounding canvas → PMREM env) for grounded look.
- Shadow catcher ground plane (ShadowMaterial) → shadows bake into the layer's alpha.
- Camera: default ortho-ish match, or **fSpy solve** of a background photo layer to place objects in true photo perspective (this is the killer integration: solve once per canvas, share with unwarp).
- Optional depth export of the object (bounding-sphere-fitted near/far) so relight/VFX layers above can occlude correctly; Theil–Sen depth auto-calibration ("Auto Z") to anchor a generated depth map to the solved ground plane.

### 5.6 VFX tools (P1–P2)
- **Lens blur (P1):** depth-driven DoF — draggable focus point (samples depth), focal offset, strength, field-of-depth; smoothed CoC map; kernel-bank Gaussian levels with per-pixel lerp, implemented as multi-pass WebGL. Improvement: occlusion-aware gather (reject samples from nearer depth than CoC allows) to kill halos.
- **P2 candidates:** depth fog/haze, depth-based color grading, bloom on relight highlights, mask-by-depth-range (export depth slice as selection/mask — very useful with our existing masking).

### 5.7 i18n (all phases)
New flat namespaces in `en.ts`, replicated to all 10 other locales (audit `npm run audit:i18n` must pass): `layer3d.*` (creation, layer names, gate), `layer3d.unwarp.*`, `layer3d.relight.*`, `layer3d.light.*` (shared with global-light popover), `layer3d.object.*`, `layer3d.vfx.*`, `layer3d.camera.*` (fSpy). Reuse existing `view3d.*` keys where identical.

## 6. Files touched (from codebase map)

New: `src/lib/threeDLayer/` (homography.ts, fspySolver.ts, relightShader.ts, lensBlur.ts, depth/ providers, bake.ts), `src/components/canvas3d/` (ThreeDLayerOverlay.tsx, UnwarpEditor.tsx, LightGizmos.tsx, ObjectGizmo.tsx), `src/components/properties/ThreeDLayerProperties.tsx`, `src/components/GlobalLightPopover.tsx`.
Modified: `types.ts`, `editorViewConfig.ts` (+ the two duplicate prop lists), `SortableLayerItem.tsx`, `useLayerOperations.ts`, `PropertiesPanel.tsx`, `Toolbar.tsx`, `EditorView.tsx`, `projectStore.ts` (globalLight + shared-layer sync), `useEditorThreeDWorkspace.ts`, all 11 locale files.

## 7. Roadmap

**Phase 1 — Foundation + Unwarp/Rewarp (P0, ~1–2 weeks)**
Layer type plumbing (flags, serialization ×3 lists → unify, icon, properties routing, i18n scaffold); overlay mount/bake lifecycle; homography module with unit tests (port the reference's `demo()` self-test discipline); corner/edge/grid/loupe editor; rewarp render with feather/hardness/color-match. *Exit: round-trip a poster on a wall — unwarp, paint, rewarp — with undo/autosave/export working.*

**Phase 2 — Depth pipeline + Relight + Global light (P0, ~2 weeks)**
Depth Anything V2 local provider + AI gate + IndexedDB cache; normals from depth; relight shader + bake; light list UI + arc gizmos; canvas global sun popover reusing LightGizmo/presets; global→layer propagation + re-bake. *Exit: import a photo, one click "Relight", drag sun and a local point light with shadows.*

**Phase 3 — 3D object mode (P1, ~2 weeks)**
GLB live layer with TransformControls gizmos; VSM shadows + shadow catcher; canvas-IBL; fSpy camera solve module + UI; Auto Z calibration; integration with 3D generators/Asset Library.

**Phase 4 — VFX + polish (P1–P2, ~1–2 weeks)**
Lens blur (occlusion-aware); depth-range masking; fog/grading; perf pass (worker offload, bake debounce, texture pooling); shared-layer sync across canvases; docs + release notes.

Each phase lands behind incremental commits with i18n parity green; Phases 1–2 are independent of 3, so 3 can be re-prioritized.

## 8. Performance & constraints
- Bake at layer native resolution, preview at ≤1024px during drags (reference uses ≤512 — we can afford more locally); RAF-batched redraws.
- One overlay WebGL context at a time (mounted only while editing); depth inference in a worker; large maps in IndexedDB, not localStorage.
- Keep new files under the 500-line project goal — the shader/math modules split naturally.

## 9. Risks
- **Fabric ↔ overlay alignment** under zoom/pan/rotation is the trickiest UI work (matrix sync each frame). Mitigate: single source of truth = Fabric viewport transform → CSS matrix on overlay.
- **WebGPU/WASM depth inference** perf on low-end machines → gate + cloud fallback + "import depth map" escape hatch.
- **Serialization bloat** (depth/normal maps) → store as IndexedDB blobs referenced by id, never inline in project JSON.
- **PropertiesPanel monolith** (~3200 lines) — add as a delegated subcomponent, don't grow the switchboard.

## 10. Licensing
NKD-VFX-Tools is **GPL-3.0**. We must not copy its code into Image Express. This PRD treats it as prior-art documentation: algorithms (DLT homography, Zhang & He rectification, fSpy solve, Blinn-Phong, ray-marched screen-space shadows) are standard published techniques we implement independently from first principles/papers. UX patterns are not copyrightable, but all code is written fresh.
