# Changelog — Delivery History

Last updated: 2026-08-07  
Repository: https://github.com/GeekatplayStudio/Image-Express.git  
Branch: main  
App version: 0.2.0

**What has shipped, newest first.** This file is history — it is not where you
look for current behaviour or future plans.

| Question | Doc |
|---|---|
| How does the system work? | [ARCHITECTURE.md](ARCHITECTURE.md) |
| What does the app do today? | [FUNCTIONALITY.md](FUNCTIONALITY.md) |
| What is planned? | [ROADMAP.md](ROADMAP.md) |
| What do we call things? | [TERMINOLOGY.md](TERMINOLOGY.md) |

> Renamed from `unified_progress_status.md` on 2026-08-07, when 45 docs were
> consolidated to 18. Entries below predate that split and may reference docs
> that no longer exist; their content now lives in the four files above.

## Latest Delivery (2026-08-07) — Unified Job Queue ("Q") + Pipeline Rail

Roadmap item **R-06 Background Jobs Control Center**, core delivered. Full
architecture record and extension guide: `docs/JOB_QUEUE.md`.

The app had **no queue**. Two disconnected job systems existed, and both
could strand the user:

- **`POST /api/generate` executed inside the request handler** via
  `void processGenerateJob(id)` — no concurrency cap (five clicks meant five
  concurrent provider calls, which on the local GPU path means OOM), no
  crash recovery. Provider params lived in a module-level `Map` that HMR and
  restarts wiped, so an interrupted job reported `running` **forever** —
  and `cleanupOldGenerateJobs` only reaped *terminal* jobs, so those zombies
  accumulated permanently.
- **`GET /api/jobs/[id]/result` deleted the result on first read.** A reload
  at the wrong moment lost the output.
- **3D/Stability jobs were polled from the browser**, so closing the tab
  abandoned them; the 3-concurrent cap was per-tab; API keys were read from
  `localStorage`. Completion notified nobody — the polling loop never called
  the toast system that was already mounted.

Delivered, modeled on Adobe Firefly Services' async job contract (accept
instantly, small flat status enum, ephemeral status vs durable result,
events over polling, limits as a contract):

- **`src/lib/server/jobQueue/`** — durable atomic store (`data/queue/jobs.json`),
  and a scheduler pinned to `globalThis` so HMR cannot orphan in-flight work.
  **Lane-based concurrency**: `local-gpu` = 1 (one GPU, serialize or die),
  `local-cpu` = 4, each `remote:<provider>` = 3 — a slow provider cannot
  starve another lane. Priority + FIFO within a lane, retries, and
  **lease-based crash recovery**: any job persisted as `running` belonged to
  a dead process and is failed as `interrupted` on boot. Zombie jobs are now
  structurally impossible.
- **SSE push** at `/api/queue/stream` (snapshot on connect, event per
  transition, heartbeat) replaces client polling; `/api/queue` remains as a
  snapshot fallback. Cancel/retry at `/api/queue/[id]/cancel|retry`.
- **A validation stage that did not exist**: a provider returning 200 with a
  missing or empty image is now `failed: validation`, not a corrupt asset.
- **Retrieval is non-destructive**, and failed jobs now **keep their uploads**
  — they are the inputs a retry needs (age-based retention still reaps them).
- **Pipeline Rail** (`src/components/PipelineRail.tsx`), mounted globally: a
  3px strip below the top toolbar with one segment per pipeline stage
  (Request → API → Queue → Worker → AI → Validate → Store → Notify →
  Retrieve). Hover drops down a card showing each job, an **External API vs
  Local** chip, stage, progress, inline failure reason, and cancel/retry.
  Merges both job systems. Toasts on completion. Honors
  `prefers-reduced-motion`; pure CSS, no animation library (bundle budget).
- **Preferences** (Settings → Workspace): `pipelineRailMode`
  (Hidden/Minimal/Detailed) and `notifyOnJobComplete`, localized en/ru/uk.
- Fixed in passing: `flux` is ComfyUI-backed, so it now serializes on the
  `local-gpu` lane instead of being treated as a remote provider; and
  `QueueStore` resolves its directory once at construction, so an async write
  can no longer land in whatever directory `IMAGE_EXPRESS_DATA_DIR` points at
  when it flushes.
- **21 new tests** (13 scheduler + 8 rail) covering lane caps, cross-lane
  starvation, zombie recovery, retry/cancel semantics, priority ordering,
  event emission, and the rail's action round-trips. Verified live against
  the dev server: 202 accept, SSE stream, repeat result fetch, failure path,
  and a full retry round-trip from the UI.

**Remaining for R-06:** server-side provider polling (a closed tab still
abandons Meshy/Tripo/Hitems/Stability jobs), running-job cancellation via
handler abort signals, a full Activity history panel, and OS-level
notifications when the window is unfocused.

## Latest Delivery (2026-08-01) — Release Chain, Dependencies, i18n Encoding

Four defects that each blocked a clean release. Policy detail:
`docs/DEPENDENCY_SECURITY.md`, `docs/DESKTOP.md`, `docs/i18n_multilanguage_support.md`.

- **Node engine is now enforced, not warned about.** npm downgrades an `engines`
  miss to `EBADENGINE` and installs anyway, so any shell whose PATH served an
  older Node (nvm/nvm4w, volta, fnm shims are the usual cause) produced a subtly
  wrong tree and failed later with an unrelated error. `scripts/node-guard.mjs`
  finds a supported Node across the common install layouts; installers and
  launchers re-exec under it with a patched PATH, and `npm run build` stops with
  the exact fix. New: `npm run doctor:node`.
- **The Electron runtime was never provisioned.** `ensure-deps` skips the binary
  download to keep web installs fast and npm 11 blocks install scripts by
  default, so `node_modules/electron/dist` never existed and every `desktop:*`
  script failed on a fresh clone. `scripts/ensure-electron.mjs` now fetches it on
  demand as a pre-hook on all seven desktop scripts.
- **The desktop package shipped the whole repository.** `appPaths.ts` resolves
  from `process.cwd()`, so Next traced the project root into `.next/standalone`,
  and `extraResources` copied it into the installer: `3d-models/` (1.2 GB),
  previous `dist-installer`/`dist-close-test` builds, `tree.glb`. Excludes are now
  comprehensive and `desktop:verify-package` fails on known-bad entries plus a
  400 MB standalone budget. **win-unpacked 2,604 MB → 453 MB; standalone
  2,271 MB → 120 MB; `ImageExpress-Setup-0.2.0.exe` builds at 122.7 MB** and
  passes the launch smoke test.
- **Every non-English locale shipped mojibake.** All ten dictionaries stored
  UTF-8 that had been decoded once as Windows-1252 and re-encoded — `страница`
  was rendered as `ÑÑ‚Ñ€Ð°Ð½Ð¸Ñ†Ð°`. 6,624 strings repaired via the new
  idempotent `scripts/i18n-fix-mojibake.mjs` (`--check` gates CI). Keys are
  untouched: locale parity is byte-identical before and after.
- **Test suite restored: 63 failures → 0** (148 suites, 864 tests). Root causes:
  `three`'s ESM add-ons were not transformed by Jest, which killed every suite
  reaching `modelThumbnail.ts` (57 tests); `VaultWatchRootsPanel` crashed on a
  watch-roots response without a `roots` array (a real product bug, now
  normalised at the client boundary); a test queried RTL's `container` for a
  portalled modal; two assertions had drifted from the component.
- **Dependencies cleaned.** Removed six unused/redundant packages
  (`@types/jspdf`, `@types/jszip`, `@types/mime`, `@testing-library/user-event`,
  `@tiptap/extension-underline`, `jsdom`), upgraded `@electron/asar` 3→4 and the
  Jest 29→30 family to drop deprecated transitives, and applied every in-range
  update. Six deprecation warnings remain — all transitive, dev-only, no
  advisories — each documented with its path and why it cannot be overridden.
  `npm audit`: 0 vulnerabilities across 363 production dependencies.

## Prior Delivery (2026-07-29) — Dependency Security Hardening

Policy and rationale: `docs/DEPENDENCY_SECURITY.md`.

- **Production advisory count is now zero** (`npm audit --omit=dev`, previously 2 moderate). Fixes are pinned in the `overrides` block of `package.json` so they survive every `npm install` / `npm ci`: `builder-util-runtime` 9.5.1 → 9.7.0 (electron-updater credential leak on cross-origin redirect, CVE-2026-54673), `@hono/node-server` 1.19.14 → 2.0.12 (serve-static path traversal via encoded backslash), `tar` 7.5.20 → 7.5.22, the `js-yaml` 3.15.0 subtree replaced by 4.3.0, and `http-cache-semantics` pinned to `^4.2.0`.
- **`brace-expansion` pinned per release line** (1.1.17 / 2.1.3 / 5.0.8) because the majors are not interchangeable: 5.x dropped the callable default export, so forcing 5.0.8 everywhere makes `minimatch@3` and `minimatch@9` throw `expand is not a function`, which breaks eslint, jest and electron-builder. The 1.x/2.x pins are the verified backports of CVE-2026-14257.
- **New override-integrity gate** — `scripts/security-overrides-check.mjs` (`npm run audit:overrides`) fails the build when `package-lock.json` resolves any package below its pinned override floor, which is how pinned security fixes silently regress. Wired into `audit:dependencies` and `verify`, so it runs in CI and locally.
- **Fixed the audit gate on Windows** — `scripts/dependency-audit.mjs` spawned bare `npm`, which cannot be executed without a shell on Windows, so the gate had never actually run on developer machines; it only printed "Unable to parse npm audit output" and exited non-zero.
- **Waiver register trimmed to what is genuinely unfixable** — `config/dependency-audit-exceptions.json` now documents only `brace-expansion` (advisory range is the flat `<=5.0.7`, dev-only, patched via backports) and the withdrawn `cacheable-request` advisory (v10+ is ESM-only while its consumer `got@11` is CommonJS). The stale `@hono/node-server` and MCP SDK waivers were removed because that advisory is now genuinely resolved.
- **Out of scope** — `mobile-companion/` is a separate Expo workspace with its own lockfile, covered by neither Dependabot (scoped to `/`) nor these overrides.

## Prior Delivery (2026-07-23) — Core Refactoring & UI Stacking Fixes

- **UI Popups Stacking Fix** — Floating property popups and toolbar modals (Color Wheel, AI Critique, Comfy Workflows) now portal to `<body>` using `BodyPortal` and SSR-safe `useIsClient` hook. Adjusted header z-index to `z-90` and floating properties panel to `z-100` so popups layer cleanly above application chrome.
- **Google Drive Integration Modularization** — Decomposed `googleDrive.ts` (1,047 lines) into constants, types, errors, config, helpers, auth, folders, session, and index barrel exports. Added unit tests for pure helpers.
- **ComfyUI Subsystem Modularization** — Split `registry.ts`, `runner.ts`, and `connection.ts` into single-responsibility modules (`registryTypes`, `promptBlueprint`, `runnerTypes`, `workflowInspection`, `connectionTypes`, `cloudConfig`, `transport`) while maintaining backward-compatible public index barrels. Added comprehensive test coverage for WorkflowRegistry and graph inspection logic.

## Prior Delivery (2026-07-23) — 3D Layer system (Phases 1–4)

New live, re-editable **3D layer** type (`is3DLayer` + `threeDLayerSettings`, full undo/autosave/export support), inspired by ComfyUI-NKD-VFX-Tools (algorithms reimplemented from scratch; see `docs/prd_3d_layer_vfx_2026-07-23.md` for the PRD, roadmap and per-phase implementation status):

- **Perspective Unwarp/Rewarp** — 4-corner homography editor (full-screen, VP-preserving edge handles, projective grid, magnifier loupe, Auto/Metric aspect), non-destructive round-trip with feather/edge-hardness/LAB color match.
- **Relight** — Depth Anything V2 runs fully in-browser (WebGPU/WASM, cached ~50 MB download, brightness fallback with a panel warning), Sobel normals, WebGL screen-space relighting: global or per-layer sun, up to 8 point lights with falloff, ray-marched depth shadows, ambient. Relight also works on unwarp layers (light the flattened surface).
- **Global sun** — one persisted canvas-wide light; editing it re-bakes every sun-following 3D layer (relight + object).
- **3D Object layers** — headless Three.js GLB bake with VSM shadows on a shadow catcher, rotation/tilt/scale/camera/shadow controls, GLB file loading; fSpy 2-VP camera solver implemented and unit-tested (UI wiring pending).
- **VFX** — depth-driven lens blur (focus point, focal offset, strength, depth of field).
- **UI** — compact per-layer 3D tool icon row in Properties (Unwarp/Relight/Object); distinct Box icon in the Layers panel; 68 `layer3d.*` i18n keys in all 11 locales (ru/uk at 100% parity).
- **Fixes in the same delivery** — SupportCorner no longer covers overlay windows (z 9997 → 55); panel-mode rail raised above corner pills and viewport-capped; missing ambience `effect.mjs` engines added for collie-hills and saucer-invasion (404s resolved); serialized-props list unified (Toolbar now imports `CUSTOM_SERIALIZED_PROPS`).

Module map: `src/lib/threeDLayer/` (homography, warpRender, depth, normals, relightShader, globalLight, objectBake, fspySolver, lensBlur, bake) + `src/components/UnwarpEditorModal.tsx` + `src/components/properties/ThreeD{LayerProperties,RelightControls,ObjectControls}.tsx`. Tests: `src/lib/__tests__/threeDLayer-*.test.ts`.

## Prior Delivery (2026-07-14) — v0.2.0

**Login/startup rework**
- App now always opens straight to the dashboard as a local guest — no automatic login popup or setup wizard on first run, local or server (`src/app/page.tsx`).
- Sign-in is opt-in only, via the user icon (top right); the same icon opens the profile once signed in.
- The Setup Wizard no longer auto-opens; it's reachable from **Settings → Workspace → Preferences → Open Setup Wizard**.
- `LoginModal` reorganized into three clear groups: Local Access, Accounts (Google/Facebook), Email (sign in/register/recover).

**Uniform resizable window system**
- New `src/components/ui/ModalShell.tsx`: draggable, resizable (corner handle), double-click-to-maximize, always clamped inside the viewport, scrollable body, Esc/X close. Built on the existing `DraggableResizablePanel` used by the Asset Library.
- Converted every application window to it: Login, User Profile, Settings, Setup Wizard, Admin Area, Documentation.
- Escape now closes only the topmost stacked window (fixes double-close when e.g. the wizard is open over Settings).

**i18n foundation**
- New `src/lib/i18n/` (dictionaries + `translate()`), `src/providers/I18nProvider.tsx` (`useI18n()`), and a globe language dropdown (`src/components/LanguageSelector.tsx`) in both the dashboard and editor top bars.
- 11 languages shipped: English, Russian, Ukrainian, Spanish, French, German, Italian, Portuguese, Polish, Chinese (Simplified), Japanese.
- See `docs/i18n_multilanguage_support.md` for conventions and the incremental translation-as-you-go policy.

**Asset Library redesign** (from the prior session, included in this version)
- Redesigned buttons/layout, right-click + "…" context menu per asset, asset groups with filter chips, robust menu positioning (fixed a CSS-transition bug that could leave menus stuck off-screen).

**Self-update**
- `scripts/update.mjs` (`npm run update` / `npm run update:check`): safe git fast-forward-only updater, refuses to run over uncommitted changes.
- New `GET /api/system/update` endpoint + Settings → Workspace → Updates section showing current commit and whether a newer version exists.

## Documentation Sync (2026-05-16)

- Added a dated baseline audit document to capture the verified current application feature set, major workflows, roadmap/tracker reconciliation, and prioritized next work.
- This file remains the canonical delivery-history source; use the baseline audit for broad current-state orientation and planning context.


---

## Latest Delivery (2026-04-03)

- Started roadmap item `R-16` / tracker item 43 with a first-pass interface customization system.
- Added `src/lib/themePreferences.ts` for persisted theme mode + accent preference storage, DOM application, and early-init script generation.
- Added `src/lib/theme-tokens.ts` accent palettes plus `src/hooks/useAppTheme.ts` so JS-driven surfaces can resolve the active runtime palette instead of relying on one static accent.
- Added `src/components/ThemePreferenceSync.tsx` and wired it into the root layout so theme preferences stay applied after hydration, settings saves, storage changes, and system appearance changes.
- Added global `light` mode token overrides in `src/app/globals.css` and accent-preset token overrides in `src/app/ui-theme.css` for `ocean`, `ember`, `meadow`, and `violet`.
- Extended `SettingsModal` with saved Theme Mode and Accent Palette controls so users can switch between `system` / `dark` / `light` and persist a preferred accent.
- Extended the active accent into JS-controlled UI paths: `CircularContextMenu` icon tints, `ImageGeneratorModal` AI zone overlay colors, and default shape fill colors in toolbar/editor shape controls now follow the selected palette.
- Added focused regression coverage confirming Settings saves both the local preference payload and the DOM-applied theme attributes, and that theme-aware menu/zone colors switch with the active accent.

Validation notes (2026-04-03 theme follow-up):
- Focused tests passed:
  - `npm test -- --runInBand src/components/__tests__/SettingsModal.test.tsx src/components/__tests__/CircularContextMenu.test.tsx src/components/__tests__/ImageGeneratorModal.test.tsx`
  - Run completed with existing `act(...)` warning noise in the long-standing Image Generator / Comfy test path, but the focused suites passed.

## Earlier Delivery (2026-04-03 UI Follow-up)

- Improved small-window accessibility and modal overflow behavior for the dashboard/editor shell slice tied to roadmap item `R-15` / tracker item 42.
- Reworked `DocumentationModal` with an explicit close icon, floating quick-jump chapter rail on larger screens, and mobile horizontal chapter navigation while keeping the manual scroll-safe inside the viewport.
- Updated editor shell overflow handling so the left tool rail and docked/floating properties surfaces remain reachable when viewport height is constrained.
- Restored hub project screenshots by making saved design routes expose both `thumbnail` and `image` preview fields and by teaching `Dashboard` to use either field.
- Added a hub-only standard footer with version/subversion/commit label plus contact/support/community links, keeping it off the canvas/editor page.
- Restored Hitem3D Back Preview / Back Layer controls in single-image mode so front/back artwork stays visible before switching to multi-view.
- Added focused regression coverage for the updated dashboard/docs/Hitem3D behaviors.

Validation notes (2026-04-03 UI follow-up):
- Focused tests passed:
  - `npm test -- --runInBand src/components/__tests__/Dashboard.test.tsx src/components/__tests__/DocumentationModal.test.tsx src/components/__tests__/ThreeDGenerator.test.tsx`
- Static editor checks passed:
  - no errors reported for touched dashboard/docs/editor shell/Hitem3D files

## Earlier Delivery (2026-04-03)

- Started roadmap implementation in priority order with `R-01` (Durable Encrypted User Key Vault) phase 1 delivery.
- Replaced `/api/user/keys` in-memory storage with encrypted-at-rest filesystem vault persistence using new server service `src/lib/server/user-key-vault.ts`.
- Added durable secret-key resolution strategy for vault encryption:
  - uses `IMAGE_EXPRESS_KEY_VAULT_SECRET` when configured,
  - otherwise creates/reuses `data/user-key-vault.secret` for local durable operation.
- Added vault audit metadata for read/write operations (`readCount`, `writeCount`, `lastReadAt`, `lastWriteAt`) and store-level `updatedAt`.
- Updated `src/app/api/user/keys/route.ts` to use the vault service for GET/POST with normalized object handling and error surfacing.
- Added focused node-environment regression coverage in `src/lib/server/__tests__/user-key-vault.test.ts` for encrypted persistence, merge behavior, audit metadata, and env-secret mode.
- Started `R-13` (Super Installer + first-run dependency orchestration) with script foundation:
  - `scripts/super-installer.mjs` selector-based orchestrator,
  - `scripts/installers/*` task scripts for Comfy install/update, bundled custom node/workflow sync, Comfy model download, and Ollama model pull,
  - config-driven source/model definitions in `scripts/installers/config/sources.json`,
  - post-install verification scaffold in `scripts/qa-installation.mjs`,
  - package scripts: `npm run install:super` and `npm run qa:install`.

Validation notes (2026-04-03):
- Focused tests passed:
  - `npm test -- --runInBand src/lib/server/__tests__/user-key-vault.test.ts`
- Focused lint passed:
  - `npm run lint -- src/lib/server/user-key-vault.ts src/app/api/user/keys/route.ts src/lib/server/__tests__/user-key-vault.test.ts`
  - `npm run lint -- scripts/super-installer.mjs scripts/qa-installation.mjs scripts/installers/common.mjs scripts/installers/comfy/install-comfy.mjs scripts/installers/comfy/install-custom-bundles.mjs scripts/installers/models/install-comfy-models.mjs scripts/installers/models/install-ollama-models.mjs`
- Installer dry-run checks passed:
  - `node scripts/super-installer.mjs --yes --dry-run --skip-tests`
  - `npm run qa:install -- --dry-run --auto-fix --skip-tests`
- Production build passed:
  - `npm run build`

---

## Latest Delivery (2026-04-02)

- Added a front/back pseudo-backside preset in the Properties panel so selected layers can flip to a backside presentation without introducing extra perspective skew.
- Stored the original horizontal flip state as `backsideBaseFlipX` and added regression coverage for the new preset controls in `PropertiesPanel.test.tsx` and `SelectionProperties.test.tsx`.
- Fixed local Comfy image-source export by hiding the visible AI zone overlay during capture, restoring visibility afterward, and moving the export logic into `imageGeneratorModalUtils.ts`.
- Added blank-source inspection for local Comfy image-based tasks so nearly all-white captures fail fast with a corrective message instead of being uploaded as a bad img2img/inpaint source.
- Standard local Comfy runs now persist the last prepared request snapshot in browser localStorage under `image-express-comfy-last-request`, including prepared positive/negative prompt text plus workflow/model metadata.
- Local Comfy request params now forward the shared UI negative prompt into prepared workflow bindings.
- Comfy local folder resolution now accepts relative child paths under the configured install path for `custom_nodes` and workflow-library scanning.
- Server-side Ollama fetches now retry transient network failures/timeouts before falling back between `host.docker.internal` and `localhost`.
- Added focused regression coverage in `imageGeneratorModalUtils.test.ts`, `ollamaServer.test.ts`, and `registry.test.ts`.

Validation notes (2026-04-02):
- Focused tests passed:
  - `npm test -- --runInBand src/components/__tests__/imageGeneratorModalUtils.test.ts src/lib/__tests__/ollamaServer.test.ts src/lib/comfyui/__tests__/registry.test.ts src/components/__tests__/PropertiesPanel.test.tsx src/components/properties/__tests__/SelectionProperties.test.tsx`
- Production build passed:
  - `npm run build`
- Local Docker deployment was refreshed successfully:
  - rebuilt the `image-express` image
  - replaced the `image-express-app` container
  - verified HTTP 200 on port 3000

---

## Latest Delivery (2026-04-01)

- Fixed the AI remove-background selection trap: opening the AI modal now forces the editor canvas back into selectable mode instead of leaving brush/drawing state active, so the prompt to pick a layer is actionable again.
- Updated `StabilityGenerator` to hydrate the current active canvas selection immediately, so remove-background recognizes an already-selected image without requiring the user to reselect it.
- Added regression coverage for the selection-mode reset and immediate-selection hydration in `ImageGeneratorModal.test.tsx` and `StabilityGenerator.test.tsx`.
- Started the Local AI support (Ollama) track with persisted local runtime preferences, a new `/api/ai/ollama/status` probe route, and a Settings-panel health check for base URL/model availability.
- Added regression coverage for the new Ollama settings workflow in `SettingsModal.test.tsx`.
- Started AI critique of image/canvas with a new toolbar-triggered local critique panel that can review either the selected layer or the full canvas using the saved Ollama runtime/model settings.
- Added `/api/ai/ollama/critique` plus shared Ollama helpers for URL normalization, model-list messaging, image payload extraction, and critique prompt construction.
- Added regression coverage for the critique modal and Ollama helpers in `AICritiqueModal.test.tsx`, `Toolbar.test.tsx`, and `ollama.test.ts`.
- Added Comfy workflow library support through `/api/ai/comfy/library`, including server-template discovery, custom workflow-folder scanning, managed repo inspection, and update/install helpers for configured Comfy folders.
- Added same-origin Comfy proxying via `/api/ai/comfy/proxy` with loopback-to-`host.docker.internal` fallback candidates for mixed Docker/host setups.
- Added `ComfyWorkflowLibraryPanel` to surface runnable server/custom workflows directly in the UI.
- Added non-destructive mask gradient utilities and regression coverage so clip masks can use editable linear/radial opacity fades.
- Fixed safe-area media-overlay variant conversion geometry to use the logical frame box rather than the stroked outline, eliminating the 2 px frame inflation that was breaking the editor regression test.

Validation notes (2026-04-01):
- Focused tests passed:
  - `npm test -- --runInBand src/components/__tests__/ImageGeneratorModal.test.tsx src/components/AI/__tests__/StabilityGenerator.test.tsx src/components/__tests__/SettingsModal.test.tsx`
- Focused lint passed:
  - `npm run lint -- src/components/ImageGeneratorModal.tsx src/components/AI/StabilityGenerator.tsx src/components/__tests__/ImageGeneratorModal.test.tsx src/components/AI/__tests__/StabilityGenerator.test.tsx src/components/SettingsModal.tsx src/components/__tests__/SettingsModal.test.tsx src/lib/localAiPreferences.ts src/app/api/ai/ollama/status/route.ts`
- Production build passed:
  - `npm run build`
- Additional critique validation passed:
  - `npm test -- --runInBand src/components/__tests__/AICritiqueModal.test.tsx src/components/__tests__/Toolbar.test.tsx src/lib/__tests__/ollama.test.ts`
  - `npm run lint -- src/components/AICritiqueModal.tsx src/components/Toolbar.tsx src/components/__tests__/AICritiqueModal.test.tsx src/components/__tests__/Toolbar.test.tsx src/lib/ollama.ts src/lib/__tests__/ollama.test.ts src/app/api/ai/ollama/critique/route.ts`
  - `npm run build`
- Full repository validation passed:
  - `npm.cmd test -- --runInBand --ci` -> 57/57 suites passed, 405 tests passed
  - `npm.cmd run build` -> passed
  - `npm.cmd run lint -- .` -> passed with existing warnings only

---

## Latest Delivery (2026-03-01)

- Completed Phase 4 Left-Toolbar Parity: Retouch Group. Added Spot Healing, Remove, Burn, and Sponge tool identities.
- Extended `retouch-engine.ts` base typings and dummy/fallback calibration for new modes.
- Integrated new tools into `Toolbar.tsx`, `CircularContextMenu.tsx`, and `ToolsDropdownMenu.tsx` with proper icons.
- Updated tool checks and UI state handling in `TopToolOptionsBar.tsx`, `RetouchControls.tsx`, `useEditorCanvasRetouchInteractions.ts`, and `editorRetouchUtils.ts` via aliasing to existing logic (dodge/healing base templates).
- Wired top header filter menu shortcuts in `EditorHeaderMenus.tsx` and updated interaction logic to recognize the new modes natively.

- Stabilized canvas initialization in `DesignCanvas`: switched canvas-ready/modified/right-click handlers to ref-backed callbacks and narrowed init-effect dependencies to canvas size inputs, preventing re-init loops and max-update-depth flicker.
- Hardened Google Drive asset listing auth flow: passive `AssetLibrary` fetch now uses non-interactive Drive session refresh and gracefully falls back to local/server assets when user interaction is required.
- Updated `googleDrive` listing default to non-interactive auth for safety, preventing unintended popup-based token requests from background effects.
- Reduced noisy console churn for expected blocked-popup/passive-auth cases during cloud listing attempts in background fetch paths.
- Continued editor modular refactor slices (menu-shell extraction + top-tool-options bridge prop composition) to keep integration files on track for <=500-line goals.

- Completed Media Export Overlay Phase A3: per-frame safe-area guide presets in Export menu, persisted safe-area metadata per frame, and active-frame safe-area guide rendering on canvas overlay.
- Added frame ZIP naming templates (`Frame + Preset`, `Design + Frame + Preset`, `Design + Preset + Date + Frame`) with persisted template preference and template-driven batch export filenames.
- Completed Media Export Overlay Phase A2 in `EditorView`: multi-frame frame-list management, active-frame switching, per-frame include/exclude toggles, and persisted frame collections (`frames` + `activeFrameId`) in local storage.
- Added batch frame export actions in Export menu: `ZIP Selected Frames` and `ZIP All Frames`, reusing existing crop/export pipeline and generating PNG ZIP archives.
- Refactored media overlay orchestration out of `EditorView` into dedicated hook `src/components/Editor/useMediaOverlay.ts` to reduce integration-file bloat and centralize overlay behavior.
- Added focused export regression coverage in `src/components/Editor/__tests__/EditorView.test.tsx` for batch ZIP export flow.
- Completed gradient masks per layer: masked layers now expose linear/radial fade controls in Appearance so clip-path masks can be softened non-destructively without releasing the mask.
- Added refactor slice: extracted crop/eyedropper/zoom top utility state and effects from `EditorView` into `src/components/Editor/useEditorTopCanvasControls.ts`.
- Moved viewport-size and utility-canvas-size synchronization effects into `useEditorTopCanvasControls` and rewired top-bar callbacks to hook handlers.
- Adopted existing `src/components/Editor/useEditorCanvasInteractionEffects.ts` from `EditorView` for gradient drag handlers and media/3D double-click interaction effects.
- Added refactor slice: extracted shape/gradient top-control state-sync and apply handlers from `EditorView` into `src/components/Editor/useEditorShapeGradientControls.ts`.
- Added refactor slice: extracted selection expand/contract top-control handler from `EditorView` into `src/components/Editor/useEditorSelectionModify.ts`.
- Adopted existing `src/components/Editor/useBackgroundJobsStore.ts` + `src/components/Editor/useBackgroundJobPolling.ts` from `EditorView` and removed in-file background-job storage/polling orchestration.
- Added refactor slice: extracted marquee/lasso/wand plus quick-select and selection-brush canvas selection interactions from `EditorView` into `src/components/Editor/useEditorCanvasSelectionInteractions.ts`.
- Added refactor slice: extracted retouch-layer bootstrap/reuse plus healing/clone/history/blur/sharpen/dodge stroke interactions from `EditorView` into `src/components/Editor/useEditorCanvasRetouchInteractions.ts`.
- Added refactor slice: extracted export background detection, viewport reset, and resilient `toDataURL` fallback helpers from `EditorView` into `src/components/Editor/useEditorCanvasExportSupport.ts`.
- Replaced two effect-driven derived states in `EditorView` (`profileSettings`, `apiKeys`) with direct derivation to satisfy current hook lint rules and trim the integration shell further.
- Added refactor slice: extracted shell-level side effects (initial tool, canvas selection/control sync, export outside-click, zoom/hand sync, preview escape, UI preferences) from `EditorView` into `src/components/Editor/useEditorShellEffects.ts`.
- Reduced `src/components/Editor/EditorView.tsx` from 5764 lines to 1337 lines across these refactor slices.

Validation notes (2026-03-01):
- Unit/Integration tests updated to cover dropdown selection checks and top-tool layout validation for new tools.
- Validation rerun: `npm test`, `npm run lint`, and `npm run build` executed successfully tracking zero fatal issues or test failures.

Validation notes (2026-02-27):
- Build passed after latest stability/auth fixes:
  - `npm.cmd run build`
- Focused A3 export tests passed:
  - `npm test -- --runInBand src/components/Editor/__tests__/EditorView.test.tsx -t "exports batch ZIP from media overlay menu|applies media overlay naming template and active-frame safe area controls"`
- Focused export/menu tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|exports PNG without canvas background when toggle is off|exports JSON and HTML bundle from export menu|exports batch ZIP from media overlay menu"`
- Focused crop/eyedropper/zoom tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "applies crop using drag-draft bounds from the workspace|wires crop/eyedropper/zoom/hand top utility controls|samples eyedropper color from clicked scene point"`
- Focused gradient/top-utility regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires top gradient controls and applies gradient config with angle fallback|wires crop/eyedropper/zoom/hand top utility controls|applies crop using drag-draft bounds from the workspace|samples eyedropper color from clicked scene point|handles grid selection, context menu tool trigger, and zoom controls"`
- Focused shape+gradient+utility regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires top shape controls and applies shape style to active shape object|wires top gradient controls and applies gradient config with angle fallback|wires crop/eyedropper/zoom/hand top utility controls|applies crop using drag-draft bounds from the workspace|samples eyedropper color from clicked scene point"`
- Focused shape+gradient+selection-modify run status:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "applies selection expand and contract operations from top controls|wires top shape controls and applies shape style to active shape object|wires top gradient controls and applies gradient config with angle fallback"` -> selection-modify test still fails with the existing missing label query (`Selection modify pixels`), while shape/gradient tests pass.
- Focused background-job-adjacent regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "supports admin actions, server rename fallback, and dirty-design back confirmation|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|opens share flow, launches export quality modal, and downloads export"`
- Focused selection interaction regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "uses marquee drag bounds to select the top-most intersecting object|uses lasso path bounds to select the top-most object inside polygon|routes selection brush interactions through the lasso selection pipeline|uses wand threshold matching and falls back to pointer-hit target when direct target is missing|routes quick selection interactions through the wand selection pipeline"`
- Focused retouch interaction regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "captures clone source point on option-click and updates clone source status|creates and reuses a dedicated retouch layer during retouch strokes|shows retouch unavailable warning when canvas 2D context is not available|falls back to lower-canvas sampling when all-layer snapshot export is unavailable|captures a fresh history source snapshot at each history-brush stroke start"`
- Focused export/save regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "saves successfully when canvas toDataURL throws with missing upper ctx|opens share flow, launches export quality modal, and downloads export|exports PNG without canvas background when toggle is off|exports JSON and HTML bundle from export menu|exports batch ZIP from media overlay menu"`
- Focused shell-side-effect regression tests passed:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "wires crop/eyedropper/zoom/hand top utility controls|opens share flow, launches export quality modal, and downloads export"`
- Lint passed for extracted slice:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorTopCanvasControls.ts src/components/Editor/useEditorCanvasInteractionEffects.ts src/components/Editor/useEditorShapeGradientControls.ts src/components/Editor/useEditorSelectionModify.ts src/components/Editor/useBackgroundJobsStore.ts src/components/Editor/useBackgroundJobPolling.ts`
- Lint passed for latest extraction slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasSelectionInteractions.ts`
- Lint passed for latest retouch extraction slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasRetouchInteractions.ts`
- Lint passed for latest export-support extraction slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasExportSupport.ts`
- Lint passed for latest shell-effects extraction slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorShellEffects.ts`
- Lint passed for A3 slice:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useMediaOverlay.ts src/components/Editor/useEditorExport.ts src/components/Editor/EditorHeaderActions.tsx src/components/Editor/editorViewConfig.ts src/components/Editor/__tests__/EditorView.test.tsx`
- Build passed:
  - `npm run build`

---

## Previous Delivery (2026-02-25 to 2026-02-26)

- Completed right-panel color workflow parity: embedded wheel interaction, editable RGB/HSB/CMYK/Lab channel cards, and profile-context display modes (sRGB/Adobe RGB/CMYK print preview).
- Completed harmony management in color tooling: named save/load/delete, inline rename, import/export JSON, plus compact collapsible list behavior.
- Completed grouped swatch management in Swatches panel: create/select/remove groups and add/remove swatches within the panel, persisted via local storage.
- Completed adjustment layer workflow alignment: adjustment creation stays in left rail `Adjustment Layers`, added missing types (`brightness-contrast`, `color-balance`, `light-and-color`, `solid-color`), and creation now auto-focuses new adjustment properties.
- Completed properties/text UX updates: multiline text editing in properties and text-on-path render safety to reduce clipping.
- Completed shape library expansion in the left rail shape tool: cloud, thought bubble, hexagon, and diamond.

Validation notes:
- Build passed after latest round (`npm run build`).
- Lint/build were rerun after syntax regression fixes during swatch panel refactor.

---

## Verified Implemented (Checked + Working)

Verification method used:
- Mapped each checked checklist item to code in `TopToolOptionsBar` + `EditorView`
- Confirmed coverage in component/integration tests
- Re-ran validation gates:
  - `npm test -- TopToolOptionsBar.test.tsx EditorView.test.tsx`
  - `npm run lint`
  - `npm run build`

### C1. Platform Setup
- [x] Top tool options bar component created and mounted under header.
- [x] Bound to active tool and live selection/object state.

### C2. Select/Move Family
- [x] Auto-select toggle
- [x] Selection mode toggle (Layer/Group)
- [x] Transform controls toggle
- [x] Feather / anti-alias controls

### C3. Brush/Paint Family
- [x] Brush preset
- [x] Size
- [x] Hardness
- [x] Opacity
- [x] Flow
- [x] Smoothing
- [x] Blend mode
- [x] Fabric paint brush wiring in editor
- [x] Shared raster engine utility for brush presets (`Pencil`/`Spray`/`Oil`/`Watercolor`)

### C4. Pen/Path Family
- [x] Path/Shape mode toggle
- [x] Add/Subtract/Intersect path operations
- [x] Auto add/delete toggle
- [x] Rubber band toggle

### C5. Text Family (partially complete section)
- [x] Font family selector
- [x] Font style selector
- [x] Size control
- [x] Bold/Italic/Underline toggles
- [x] Alignment controls (left/center/right/justify)
- [x] Color shortcut

---

## Pending Work (Upgrade Program)

### Next Active Step (Approved Direction)
- [ ] Implement **Media Export Overlay (Phase B)**:
  - [x] Add first-pass `convert active frame to variant` bridge action inside the editor.
  - [ ] Decide whether the bridge should remain an in-editor draft flow or hand off into a dedicated Campaign Workspace later.
  - Keep A1/A2/A3 overlay export path as the canonical lightweight adaptation workflow.

### Media Export Overlay Roadmap (new)
- [x] A1: single frame export from overlay bounds.
- [x] A2: multi-frame management + batch ZIP export.
- [x] A3: safe-area guides + naming templates.
- [x] B1: convert active frame to a preset-sized variant draft in the current editor.
- [ ] B2: optional handoff from the bridge into a future Campaign Workspace model.

### A) Pre-Implementation Safety Gates
- [ ] Baseline visual + UX parity snapshots captured
- [ ] Current editor interactions smoke-tested against checklist
- [ ] Rollback points and guardrails explicitly signed off

### B) Menu Bar Upgrade Path
- [x] File menu shell + mapped existing actions (`Save`, `Export As` launcher)
- [x] Edit menu shell + mapped existing actions (`Undo`, `Redo`, `Duplicate`, `Preferences`)
- [x] Image menu shell + mapped actions
- [x] Layer menu shell + mapped actions
- [x] Select menu shell + mapped actions
- [x] Filter menu shell + mapped actions
- [x] View menu shell + mapped existing actions (`Fit`, `Zoom In/Out`, `Show Grid`)
- [x] Window menu shell + mapped actions
- [x] Help menu shell + mapped actions

### C) Top Tool Options Bar Remaining
- [x] C6: Shape/Rectangle family (all)
- [x] C7: Gradient family (all)
- [x] C8: Crop/Eyedropper/Zoom/Hand family (all)

Completed in this pass (C6 shape/rectangle family):
- [x] Added Shape/Path/Pixels mode toggles in `TopToolOptionsBar` when `activeTool === 'shapes'`.
- [x] Added Fill/Stroke color shortcuts and stroke width controls.
- [x] Added fixed-size toggle wired to object scaling locks.
- [x] Wired shape config through existing canvas mutation/event paths (`shape:config:set` + active object `set` updates).
- [x] Added/updated Top options and editor integration tests for C6 controls.

Completed in this pass (C7 gradient family):
- [x] Added gradient top controls wiring in `EditorView` for type/blend/opacity/reverse/dither.
- [x] Applied gradient config to active object with safe fallback behavior: `angle` preserved via `gradientTypeHint` while rendered as linear, and `dither` persisted as metadata where engine support is partial.
- [x] Updated gradient drag workflow to honor current top settings and preserve/flip color stops safely.
- [x] Added focused tests for gradient control wiring in `TopToolOptionsBar` and `EditorView`.

Completed in this pass (C8 crop/eyedropper/zoom/hand family):
- [x] Added crop top controls (ratio presets, artboard-bounds option, delete-outside option, apply action) and wired apply to artboard crop bounds with safe object-prune behavior.
- [x] Added eyedropper top controls (sample size/source + sample action) and wired sampling through active-object/canvas fallback with color propagation to live top color state.
- [x] Added zoom top controls (in/out mode, step presets, apply, fit-to-screen, reset) wired to existing zoom/fit behavior.
- [x] Added hand top controls with explicit pan-lock alias and connected hand-mode state through canvas event wiring.
- [x] Added focused tests for C8 wiring in `TopToolOptionsBar` and `EditorView`; re-ran lint/build gates.

### D) Properties + Panel Organization
- [x] Right icon rail taxonomy expansion with persisted mode state (Layers/Properties/History/Color/Swatches/Brushes/Channels/Adjustments/Navigator/Info)
- [x] Color system tabs (RGB/HSB/CMYK/Lab) with safe fallback messaging
- [x] Adjustment discoverability launcher (categorized actions + selected-adjustment quick controls)
- [x] Layer/History/Info/Navigator organization updates

Completed in this pass (layer cleanliness phase 1):
- [x] Moved selected-layer lock/clip/delete actions to a compact top action strip.
- [x] Simplified layer row controls to reduce persistent icon clutter.
- [x] Added selected-layer settings/overflow affordance on the right side of row.

Completed in this pass (layer cleanliness phase 2/3):
- [x] Added selected-layer properties inspector toggle and dedicated layer properties surface (X/Y/W/H).
- [x] Added explicit Arrange Layers mode toggle and gated drag-sort behavior behind arrange mode.
- [x] Added component tests for new layer inspector and arrange mode behaviors.

Completed in this pass (panel rail + color workflow slice):
- [x] Added dedicated `PanelModeRail` component and integrated it into `PropertiesPanel`.
- [x] Added persisted panel mode state (`layers`/`properties`) via localStorage with safe fallback to `properties`.
- [x] Added `PropertiesPanel` + `PanelModeRail` tests for rail switching/persistence behavior.
- [x] Added color mode tabs (RGB/HSB/CMYK/Lab) in selection Fill workflow and preserved existing `ColorPicker` pipeline.

Completed in this pass (adjustment discoverability slice):
- [x] Added categorized adjustment launcher in selection workflow with reference-style naming groups.
- [x] Wired launcher actions through existing `adjustment:create` canvas event path (no duplicate adjustment state ownership).
- [x] Added selected-adjustment quick controls for fast adjustment-type switching and preserved existing `AdjustmentControls` mutation flow.

Completed in this pass (panel organization follow-through slice):
- [x] Added persisted panel shortcuts beyond Layers/Properties (`history`, `navigator`, `info`) via the right rail.
- [x] Wired History panel to live undo/redo stack counts and actions (no mock history list).
- [x] Wired Navigator/Info panels to real editor state (zoom, canvas size, object count, selection count, active tool).
- [x] Upgraded Navigator with a compact minimap preview and click-to-center viewport navigation.

Completed in this pass (D1 rail taxonomy expansion slice):
- [x] Expanded right rail with remaining reference icons (`color`, `swatches`, `brushes`, `channels`, `adjustments`).
- [x] Mapped `color`/`swatches`/`adjustments` to concrete panel surfaces tied to existing mutation pipelines.
- [x] Mapped `brushes` to a real dedicated controls surface wired to editor paint state (preset/size/hardness/opacity/flow/smoothing/blend + activate paint action).
- [x] Reserved `channels` in the right rail so the later real panel could land without changing the rail taxonomy.
- [x] Extended rail persistence + hydration tests for new modes.
- [x] Added `PropertiesPanel` test coverage for brushes mode control wiring.

Completed in this pass (layer lock canvas interaction slice):
- [x] Added direct on-canvas lock badges for locked layers with click-to-unlock behavior.
- [x] Added pale hover outline feedback for locked layers to reduce accidental drag attempts.
- [x] Extended lock-badge hit-testing to nested locked child layers inside groups (while preventing duplicate child badges when parent group is locked).
- [x] Added `EditorView` regression coverage for lock badge unlock flow (top-level and grouped child layers).
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

### E) Missing Tools Program
- [x] Alias/identity first phase (Move/Hand/Zoom/Path select aliases)
- [~] Raster selection tools — **content pixel selection v2** (marquee/lasso/wand/quick-select/selection-brush → document alpha mask + ants + clear + mask-from-selection + expand/contract). Delete/Cut/Fill constrained to selection still pending.
- [ ] Advanced retouch tools (healing/clone bootstrap complete; full raster retouch behavior pending)

Completed in this pass (2026-08-02 content pixel selection v1):
- [x] DocumentSelectionMask + rect/polygon writers + wand flood-fill on layer pixels (`src/lib/selection/*`).
- [x] Marquee / Lasso / Wand write content mask (not Fabric ActiveSelection of whole layers).
- [x] Persistent tint + dashed ants overlay; Escape / Ctrl+D / Select→Deselect clear mask.
- [x] Select → Mask from Selection via `applyRasterMaskToObject`.
- [x] Feather applies to mask edge; Layer/Group chrome hidden on content tools (Move only).
- [x] Domain + EditorView tests updated; docs corrected so object-pick ≠ content selection.

Completed in this pass (2026-08-02 content pixel selection v2 — brush / quick / wand color):
- [x] Selection Brush stamps soft expand into the mask; Alt+paint contracts.
- [x] Quick Select paint-grows into similar colors under the brush (wand Range); Alt contracts.
- [x] Wand Contiguous vs Color modes + color picker / Apply; Shift+click adds to mask.
- [x] Expand/Contract top controls morph the document mask (not object AABB).
- [x] Tests: `selectionBrushStamp`, brush/quick EditorView paints, `keyIntegrity`; i18n hints in all locales.

Completed in this pass (E1 alias/identity first phase):
- [x] Added Move naming alias over Select across toolbar/tool surfaces while preserving underlying `select` behavior.
- [x] Added Path Select alias entry in tool switching surfaces and normalized alias routing to existing select engine.
- [x] Added keyboard alias wiring (`V` => Move/Select, `A` => Path Select alias) and aligned docs copy.
- [x] Added/updated tests for alias routing and tool-surface labels.

Completed in this pass (E2 rectangular marquee slice):
- [x] Added left-rail `Marquee` tool and menu/keyboard entry (`M`) wired through existing tool routing.
- [x] Implemented rectangular drag-selection state in `EditorView` with helper overlay and scene-space hit testing.
- [x] Integrated selection-mode behavior for marquee commits (`Layer` picks top-most hit, `Group` builds active multi-selection).
- [x] Reused existing top select controls for marquee tool mode (no duplicate ownership).
- [x] Added focused test coverage for marquee activation + drag selection flow.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E2 lasso slice):
- [x] Added left-rail `Lasso` tool and menu/keyboard entry (`L`) wired through existing tool routing.
- [x] Implemented lasso path capture + commit flow in `EditorView` with polygon-based object inclusion and selection-mode-aware commit behavior.
- [x] Added explicit cancel flow for in-progress lasso capture via `Escape`.
- [x] Reused existing top select controls for lasso tool mode (no duplicate ownership).
- [x] Added focused test coverage for lasso activation + keyboard alias + drag selection flow.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E2 magic wand bootstrap slice):
- [x] Added left-rail `Magic Wand` tool identity and toolbar routing/cursor behavior.
- [x] Added `W` keyboard alias and tools-menu entry wiring for wand activation.
- [x] Implemented wand threshold bootstrap selection in `EditorView` with safe fallback: direct target if present, otherwise pointer-hit bounding-box target, and single-target fallback when color matching is unavailable.
- [x] Added wand threshold top-option control wiring and selection tests for threshold matching + fallback path.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E2 selection modify slice):
- [x] Added top select-family controls for selection modify radius and expand/contract actions.
- [x] Implemented selection modify operations in `EditorView` over current selection bounds with safe fallback behavior for degenerate contraction.
- [x] Wired modify operations to current selection mode commit path and existing selectable-object filters.
- [x] Added focused tests for selection modify top-controls wiring and expand/contract behavior.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E3 retouch bootstrap slice):
- [x] Added left-rail tool identities for `Healing Brush` and `Clone Stamp` with cursor/tool routing.
- [x] Added tool-menu entries and keyboard aliases (`J` for Healing, `S` for Clone Stamp).
- [x] Added top option control surfaces for healing/clone bootstrap settings (size/hardness/sample/alignment/source state).
- [x] Added clone source-point scaffolding (`Option`-click sets source).
- [x] Added focused tests for healing/clone top controls, keyboard alias routing, toolbar activation, and clone source scaffolding behavior.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.
- [x] Added left-rail `History Brush` bootstrap identity with cursor/tool routing.
- [x] Added tools-menu entry and keyboard alias (`Y`) for history brush activation.
- [x] Added top option control surface for history brush bootstrap settings (size/hardness/sample state).
- [x] Added focused tests for history brush top controls, toolbar activation, tools-menu routing, and keyboard alias handling.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx src/components/__tests__/Toolbar.test.tsx --watch=false`, `npm run lint`, `npm run build`.
- [x] Added left-rail `Blur Tool` and `Dodge Tool` bootstrap identities with cursor/tool routing.
- [x] Added tools-menu entries and keyboard aliases (`B` for Blur, `O` for Dodge).
- [x] Added top option control surfaces for blur/dodge bootstrap settings (size/strength/sample and size/exposure/protect tones).
- [x] Added focused tests for blur/dodge top controls, toolbar activation, tools-menu routing, and keyboard alias handling.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx src/components/__tests__/Toolbar.test.tsx --watch=false`, `npm run lint`, `npm run build`.
- [x] Added first-pass dedicated raster retouch layer engine and wired live stroke mutations for clone/healing/history/blur/dodge.
- [x] Added retouch utility module (`src/lib/retouch-engine.ts`) for soft masks, stroke interpolation, and sampled/dodge dab stamping.
- [x] Added clone aligned-flow continuation and history-source snapshot capture for retouch strokes.
- [x] Preserved safe warning behavior only when source pixels are unavailable, instead of unconditional no-op.
- [x] Added regression tests for retouch-layer creation/reuse and unavailable-context handling in `EditorView` plus retouch utility unit tests.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/EditorView.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/Editor/__tests__/ToolsDropdownMenu.test.tsx src/components/__tests__/Toolbar.test.tsx --watch=false`, `npm run lint`, `npm run build`.

### F) Bottom-Right Utility Upgrade
- [x] Utility cluster placement and overlap-safe status chips

Completed in this pass (F bottom-right utility upgrade + right-panel dedup):
- [x] Moved zoom controls from bottom-center to a bottom-right utility cluster.
- [x] Kept zoom actions wired to existing zoom handlers as single source of truth.
- [x] Added compact utility status chips for zoom %, canvas size, and grid state.
- [x] Added adaptive utility placement offsets to avoid overlap with floating properties panel, context menu, and job status footer.
- [x] Removed duplicate right-side Pen surface behavior by eliminating the extra `activeTool === 'pen'` override.
- [x] Removed right-rail `paths` panel mode so Pen exists on the left/tool surface only.

Completed in this pass (Phase 7 raster engine slice):
- [x] Added `src/lib/raster-engine.ts` for shared brush construction + drawing-mode helpers.
- [x] Unified `Pencil`/`Spray`/`Oil`/`Watercolor` preset typing across top options and brushes panel.
- [x] Restored left-rail `Pen` as vector curves/path tool with top pen config wiring (`pen:config:set`).
- [x] Removed duplicate/legacy paint ownership override in `PropertiesPanel` by auto-routing paint/pen context to `brushes` panel mode.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/TopToolOptionsBar.test.tsx src/components/__tests__/PropertiesPanel.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (B1/B2/B7 menu-shell first increment):
- [x] Added `File`, `Edit`, and `View` dropdown shells in the header using existing command paths only.
- [x] Wired `File` menu to existing save/export flow (`Save`, `Export As...` launcher to current export menu).
- [x] Wired `Edit` menu to existing history/settings flows (`Undo`, `Redo`, `Duplicate`, `Preferences...`).
- [x] Wired `View` menu to existing viewport/grid flows (`Fit to Screen`, `Zoom In`, `Zoom Out`, `Show/Hide Grid`).
- [x] Added smoke test coverage for menu action wiring and keyboard coexistence in `EditorView`.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (B8 window menu panel wiring):
- [x] Added `Window` dropdown shell in editor header.
- [x] Added panel toggles for Layers/Properties/History/Color/Swatches/Brushes/Channels/Adjustments/Navigator/Info.
- [x] Wired toggles to real shared panel-mode state (EditorView <-> PropertiesPanel) with persisted mode hydration.
- [x] Added panel visibility + dock-mode toggles (show/hide, dock left/right, float) that reflect live panel state.
- [x] Added/updated `EditorView` integration test coverage for window menu toggle state reflection.
- [x] Validation rerun: `npm test -- src/components/Editor/__tests__/EditorView.test.tsx src/components/__tests__/PropertiesPanel.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (tool rail hover-label discoverability slice):
- [x] Added left toolbar hover-expand behavior to reveal tool names while keeping default icon-first compact layout.
- [x] Added right panel rail hover-expand behavior to reveal panel labels with the same interaction model.
- [x] Added a persisted configuration toggle in `Settings` to enable/disable hover expansion (`Expand side tool rails on hover`).
- [x] Wired editor runtime to rehydrate/apply preference changes via shared UI-preferences storage/event.
- [x] Validation rerun: `npm test -- src/components/__tests__/Toolbar.test.tsx src/components/properties/__tests__/PanelModeRail.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E3 retouch fidelity + regression slice):
- [x] Added safer all-layers retouch source fallback when `toCanvasElement` snapshot export is unavailable (including tainted/cross-origin snapshot failure scenarios) by sampling from runtime lower canvas with viewport-aware crop mapping.
- [x] Extracted clone aligned source-point continuation into shared helper logic and added dedicated regression unit coverage.
- [x] Added `EditorView` regression coverage for:
  - lower-canvas fallback source sampling path,
  - history-brush per-stroke source snapshot restore semantics.
- [x] Validation rerun: `npm test -- src/lib/__tests__/retouch-engine.test.ts src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (E3 retouch blend/softness calibration slice):
- [x] Expanded retouch brush profiles with mode-aware compositing metadata and optional secondary-pass blending.
- [x] Tuned healing/blur/sharpen/dodge calibration curves for opacity, hardness, spacing, and effect strength to reduce haloing/smearing at extreme sizes/strengths.
- [x] Added healing two-pass stamping (`source-over` base + `soft-light` detail pass) for smoother blend fidelity.
- [x] Added focused unit coverage for profile calibration behavior across healing/blur/sharpen/dodge modes.
- [x] Validation rerun: `npm test -- --runInBand src/lib/__tests__/retouch-engine.test.ts src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (Phase 4 left-toolbar utility + cursor foundation slice):
- [x] Added persistent left-rail utility tools (`Crop`, `Eyedropper`, `Zoom`, `Hand`) so they are no longer dropdown-only.
- [x] Added bottom utility FG/BG/swap cluster in the left rail with canvas sync event (`toolbar:color:change`) for downstream consumers.
- [x] Replaced ad-hoc cursor conditionals with a centralized cursor resolver and added zoom cursor mode parity (`zoom-in`/`zoom-out`) from top options.
- [x] Wired toolbar zoom cursor mode from `EditorView` (`zoomTopMode`) into toolbar cursor handling.
- [x] Added/updated toolbar regression coverage for persistent utility controls, zoom-out cursor mode, and color swap sync event.
- [x] Validation rerun: `npm test -- --runInBand src/components/__tests__/Toolbar.test.tsx src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`, `npm run build`.

Completed in this pass (Phase 4 cursor realism + test-coverage audit slice):
- [x] Added real on-canvas tool cursor previews in workspace:
  - brush-size ring for paint/retouch family tools,
  - target-style cursor for eyedropper.
- [x] Added viewport-aware pointer mapping for cursor previews with scene-point fallback.
- [x] Added `EditorView` regression tests for brush cursor preview rendering and eyedropper target preview rendering.
- [x] Full suite audit rerun completed: `npm test -- --runInBand` (50 suites / 346 tests), then `npm run lint`, `npm run build`.
- [x] Confirmed remaining placeholders are isolated away from active editor cursor workflows; Channels has now moved beyond the old coming-soon stub into a real MVP panel.

Completed in this pass (Phase 4 selection-group parity slice):
- [x] Added `Quick Selection` and `Selection Brush` identities across tool surfaces (left rail group, tools dropdown, select menu, keyboard aliases).
- [x] *(Superseded 2026-08-02)* Both tools now paint the document content mask directly — Quick Select is no longer a wand alias; Selection Brush is no longer a lasso alias.
- [x] Added top-options parity for selection subtool switching and wand-threshold behavior in quick-select mode.
- [x] Synced circular right-click tool menu with new selection tools so context actions reflect current tool taxonomy.
- [x] Added/updated regression coverage in:
  - `ToolsDropdownMenu.test.tsx`
  - `Toolbar.test.tsx`
  - `TopToolOptionsBar.test.tsx`
  - `EditorView.test.tsx`
- [x] Validation rerun: `npm test -- --runInBand` (50 suites / 351 tests), `npm run lint`, `npm run build`.

Completed in this pass (crop + picker reliability slice):
- [x] Added crop drag-draft bounds directly in workspace canvas for crop tool (drag on canvas, apply from top bar, Enter shortcut).
- [x] Updated crop apply flow to prioritize draft bounds when present, with helper cleanup and success messaging.
- [x] Added true eyedropper point sampling from clicked canvas scene-point (instead of center-only fallback), preserving source/size options.
- [x] Updated left-toolbar picker behavior to open the color wheel while eyedropper is active.
- [x] Refreshed color wheel panel UX with hue ring + SV square interaction, harmony mode swatches (complementary/triadic/tetradic/etc), and saved swatches.
- [x] Added/updated regression coverage in `Toolbar.test.tsx` and `EditorView.test.tsx` for picker-panel open, pointer sampling, and crop draft apply flow.
- [x] Validation rerun: `npm test -- --runInBand` (50 suites / 354 tests), `npm run lint`, `npm run build`.

Completed in this pass (picker interaction hardening + key-stability slice):
- [x] Prevented eyedropper clicks from selecting canvas layers by disabling target-finding while picker mode is active.
- [x] Prevented auto tool-switch fallback (`-> select`) for eyedropper/crop/zoom/hand utility tools when selection events fire.
- [x] Added regression coverage ensuring eyedropper remains active during sampling and does not collapse to layer-select behavior.
- [x] Fixed duplicate React key warnings in color wheel harmony/swatch lists by using stable indexed keys.
- [x] Validation rerun: `npm test -- --runInBand src/components/Editor/__tests__/EditorView.test.tsx`, `npm run lint`.

Completed in this pass (EditorView export extraction slice):
- [x] Extracted export/share/batch ZIP orchestration from `EditorView.tsx` into `useEditorExport`.
- [x] Extracted export quality modal JSX into `EditorExportQualityModal`.
- [x] Preserved existing export menu behavior (PNG/JPG modal, SVG/PDF/JSON/HTML, ZIP selected/all frames, share flow).
- [x] Reduced `EditorView.tsx` from `7453` to `7081` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "exports batch ZIP from media overlay menu|exports JSON and HTML bundle from export menu|exports PNG without canvas background when toggle is off|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (EditorView persistence extraction slice):
- [x] Extracted save/back/template logic from `EditorView.tsx` into `useEditorPersistence`.
- [x] Moved missing-assets load/resolve state management into `useEditorPersistence` while keeping existing replacement browser flow in `EditorView`.
- [x] Preserved save + Drive backup behavior, unsaved-change back guard, initial design/template loading, and missing-assets resolution behavior.
- [x] Reduced `EditorView.tsx` from `7081` to `6834` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "supports admin actions, server rename fallback, and dirty-design back confirmation|saves a new design and uploads a Drive backup when Drive is connected|stops save when prompt is cancelled for untitled design|shows save failure message when server save fails|saves successfully when canvas toDataURL throws with missing upper ctx|loads initial design from URL and handles load errors|loads template missing assets, replaces with library selection, and resolves"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "exports batch ZIP from media overlay menu|exports JSON and HTML bundle from export menu|exports PNG without canvas background when toggle is off|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (EditorView menu/media hook adoption slice):
- [x] Replaced in-file menu action handlers with `useEditorMenuActions`.
- [x] Replaced in-file media frame-capture handler with `useEditorMediaPreview`.
- [x] Preserved existing top-menu action wiring, layer lock/delete/select menu commands, and media preview capture behavior.
- [x] Reduced `EditorView.tsx` from `6834` to `6703` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|reorders active layer from context menu move-up and send-to-back actions|handles grid selection, context menu tool trigger, and zoom controls"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "supports admin actions, server rename fallback, and dirty-design back confirmation|saves a new design and uploads a Drive backup when Drive is connected|stops save when prompt is cancelled for untitled design|shows save failure message when server save fails|saves successfully when canvas toDataURL throws with missing upper ctx|loads initial design from URL and handles load errors|loads template missing assets, replaces with library selection, and resolves|exports batch ZIP from media overlay menu|exports JSON and HTML bundle from export menu|exports PNG without canvas background when toggle is off|opens share flow, launches export quality modal, and downloads export"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (Editor architecture map + keyboard/title extraction slice):
- [x] Added `docs/component_responsibility_map.md` as the living ownership map for runtime modules across app shell, editor, properties, shared components, libraries, and API routes.
- [x] Added update rules to require map updates on every refactor/new runtime file.
- [x] Extracted keyboard shortcut effect cluster from `EditorView.tsx` into `useEditorKeyboardShortcuts`.
- [x] Extracted design title rename/draft workflow from `EditorView.tsx` into `useEditorDesignTitle`.
- [x] Reduced `EditorView.tsx` from `6703` to `6549` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "closes open menus on Escape|supports move, wand, quick-select, selection brush, healing, history brush, blur, dodge, clone stamp, marquee, lasso, and path-select keyboard aliases|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|reorders active layer from context menu move-up and send-to-back actions|handles grid selection, context menu tool trigger, and zoom controls|supports admin actions, server rename fallback, and dirty-design back confirmation|supports server-backed rename success flow"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "saves a new design and uploads a Drive backup when Drive is connected|stops save when prompt is cancelled for untitled design|shows save failure message when server save fails|saves successfully when canvas toDataURL throws with missing upper ctx|opens share flow, launches export quality modal, and downloads export|exports PNG without canvas background when toggle is off|exports JSON and HTML bundle from export menu|exports batch ZIP from media overlay menu|loads initial design from URL and handles load errors|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (Editor menu-state hook adoption follow-up):
- [x] Replaced in-file menu boolean state + menu open/close/toggle callbacks in `EditorView.tsx` with `useEditorMenus`.
- [x] Preserved top-nav menu interactions, export/share/grid menu behavior, and Escape close behavior via `useEditorKeyboardShortcuts`.
- [x] Reduced `EditorView.tsx` from `6549` to `6503` lines.
- [x] Validation rerun:
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --watch=false -t "closes open menus on Escape|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports move, wand, quick-select, selection brush, healing, history brush, blur, dodge, clone stamp, marquee, lasso, and path-select keyboard aliases|supports admin actions, server rename fallback, and dirty-design back confirmation|supports server-backed rename success flow|opens share flow, launches export quality modal, and downloads export"`
  - `npm run build`
  - `npm run lint` (same pre-existing unrelated errors remain in `ThreeDLayerEditor.tsx` and `PanelUtilityViews.tsx`).

Completed in this pass (Editor layer-order + text-controls extraction slice):
- [x] Moved layer reorder state/action logic out of `EditorView.tsx` into `useEditorMenuActions` (`getActiveLayerOrderState`, `handleLayerOrderAction`).
- [x] Added `useEditorTextControls` and moved text top-bar/quick-bar state, selection sync effects, and text mutation handlers out of `EditorView.tsx`.
- [x] Rewired `EditorView` consumers (`TopToolOptionsBar`, `TextQuickBar`, eyedropper sampled-color sync) to use the new text-controls hook.
- [x] Reduced `EditorView.tsx` from `6503` to `6128` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorMenuActions.ts src/components/Editor/useEditorTextControls.ts`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "reorders active layer from context menu move-up and send-to-back actions|closes open menus on Escape|supports move, wand, quick-select, selection brush, healing, history brush, blur, dodge, clone stamp, marquee, lasso, and path-select keyboard aliases"`
  - `npm run build`
  - Note: full `EditorView.test.tsx` run currently reports 3 unrelated top-control interaction failures (`Select feather`, `Selection modify pixels`, `Text font family`) plus expected jsdom `canvas.getContext` console noise in sampled-color tests.

Completed in this pass (Editor history hook extraction follow-up):
- [x] Added `useEditorHistory` and moved snapshot/history stack management (`pushHistory`, `resetHistory`, undo/redo, duplicate) out of `EditorView.tsx`.
- [x] Removed in-file history refs/state (`undoStackRef`, `redoStackRef`, `historyReadyRef`, `historyState`) from `EditorView` and rewired consumers to hook outputs.
- [x] Preserved existing keyboard/menu/history command wiring and persistence integration (`useEditorPersistence` continues consuming `resetHistory` + `historyReadyRef`).
- [x] Reduced `EditorView.tsx` from `6128` to `6021` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorMenuActions.ts src/components/Editor/useEditorTextControls.ts src/components/Editor/useEditorHistory.ts`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports move, wand, quick-select, selection brush, healing, history brush, blur, dodge, clone stamp, marquee, lasso, and path-select keyboard aliases|closes open menus on Escape"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx` (still shows the same 3 top-control test failures: `Select feather`, `Selection modify pixels`, `Text font family`, plus expected jsdom `canvas.getContext` console noise in sampled-color flow)
  - `npm run build`

Completed in this pass (Editor panel-state hook adoption slice):
- [x] Replaced in-file panel state/handler block in `EditorView.tsx` with `useEditorPanelState` (`dock`, `collapse`, `float`, `resize`, `window panel toggle`).
- [x] Preserved window menu panel controls, dock-mode switching, floating panel drag behavior, and panel resize interactions.
- [x] Reduced `EditorView.tsx` from `6021` to `5888` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorPanelState.ts`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|closes open menus on Escape|reorders active layer from context menu move-up and send-to-back actions"`
  - `npm run build`

Completed in this pass (Editor asset/canvas action hook adoption slice):
- [x] Added `useEditorCanvasAssetActions` and moved in-file handlers from `EditorView.tsx`:
  - `handleAssetSelect`
  - `handleFileDrop`
  - `handleCanvasModified`
  - `handleRightClick`
- [x] Preserved existing asset library insert behavior, drag-drop upload-to-canvas flow, canvas dirty/history update, and context-menu open behavior.
- [x] Reduced `EditorView.tsx` from `5888` to `5781` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasAssetActions.ts`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|reorders active layer from context menu move-up and send-to-back actions|supports admin actions, server rename fallback, and dirty-design back confirmation|loads template missing assets, replaces with library selection, and resolves|opens share flow, launches export quality modal, and downloads export"`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx` (still the same known 3 failures: `Select feather`, `Selection modify pixels`, `Text font family`, plus expected jsdom `canvas.getContext` console noise)
  - `npm run build`

Completed in this pass (Editor menu-open state simplification follow-up):
- [x] Replaced manual `hasOpenMenu` boolean aggregation in `EditorView` with `isAnyEditorMenuOpen` from `useEditorMenus`.
- [x] Removed one unused `showToolsMenu` destructure path in `EditorView`.
- [x] Reduced `EditorView.tsx` from `5781` to `5764` lines.
- [x] Validation rerun:
  - `npm run lint -- --max-warnings=0 src/components/Editor/EditorView.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "closes open menus on Escape|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions"`
  - `npm run build`

Completed in this pass (Editor header actions component extraction slice):
- [x] Added `src/components/Editor/EditorHeaderActions.tsx` to own header action UI concerns previously embedded in `EditorView`:
  - Active palette color chips
  - Grid menu
  - Share menu
  - Export menu + media-overlay frame controls
  - Profile button trigger/avatar
- [x] Replaced in-file header action JSX block in `EditorView.tsx` with `EditorHeaderActions` component wiring.
- [x] Reduced `EditorView.tsx` from `4235` to `4063` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorHeaderActions.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "supports admin actions, server rename fallback, and dirty-design back confirmation|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|opens share flow, launches export quality modal, and downloads export"`
  - `npm run build`

Completed in this pass (Editor overlays/modals component extraction slice):
- [x] Added `src/components/Editor/EditorViewOverlays.tsx` to own overlay/modal composition concerns previously embedded in `EditorView`:
  - `GridOverlay` + `GradientControls`
  - `UserProfileModal`
  - Missing-assets replacement flow (`AssetLibrary` + `MissingAssetsModal`)
  - Media preview player modal
  - `EditorExportQualityModal`
- [x] Replaced in-file overlay/modal JSX block in `EditorView.tsx` with `EditorViewOverlays` component wiring.
- [x] Reduced `EditorView.tsx` from `4063` to `3987` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "supports admin actions, server rename fallback, and dirty-design back confirmation|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|opens share flow, launches export quality modal, and downloads export|exports batch ZIP from media overlay menu|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor top-nav menus component extraction slice):
- [x] Added `src/components/Editor/EditorHeaderMenus.tsx` to own top header menu cluster concerns previously embedded in `EditorView`:
  - File, Edit, Image, Layer, Select, Filter, View, Window, Settings, Help menus
  - Window panel dock/float/collapse toggles
  - Existing layer order, selection modify, zoom/view, and settings/help menu commands
- [x] Replaced in-file top-nav menu JSX block in `EditorView.tsx` with `EditorHeaderMenus` component wiring.
- [x] Reduced `EditorView.tsx` from `3987` to `3437` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|exports batch ZIP from media overlay menu|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor header primary component extraction slice):
- [x] Added `src/components/Editor/EditorHeaderPrimary.tsx` to own the remaining left header cluster previously embedded in `EditorView`:
  - Brand mark + editable document title
  - Hub/back action
  - Top-menu expand/collapse toggle button
- [x] Replaced in-file header primary JSX block in `EditorView.tsx` with `EditorHeaderPrimary` component wiring.
- [x] Reduced `EditorView.tsx` from `3437` to `3400` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx -t "wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|exports batch ZIP from media overlay menu|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor top tool options bridge extraction slice):
- [x] Added `src/components/Editor/EditorTopToolOptionsBridge.tsx` to own the large grouped `TopToolOptionsBar` wiring previously embedded in `EditorView`.
- [x] Moved top-bar prop grouping, value normalization, and tool-trigger/event bridging into the new component while preserving the existing `TopToolOptionsBar` render surface.
- [x] Reduced `EditorView.tsx` from `3400` to `3308` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "wires top pen path/shape toggle to pen config events|wires top shape controls and applies shape style to active shape object|wires top gradient controls and applies gradient config with angle fallback|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor properties panels extraction slice):
- [x] Added `src/components/Editor/EditorPropertiesPanels.tsx` to own docked/collapsed/floating panel chrome and shared `PropertiesPanel` composition previously embedded in `EditorView`.
- [x] Replaced the in-file left/right/floating properties panel JSX in `EditorView.tsx` with `EditorPropertiesPanels` placements around the main canvas.
- [x] Reduced `EditorView.tsx` from `3308` to `3190` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorPropertiesPanels.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "wires top pen path/shape toggle to pen config events|wires top shape controls and applies shape style to active shape object|wires top gradient controls and applies gradient config with angle fallback|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor canvas workspace extraction slice):
- [x] Added `src/components/Editor/EditorCanvasWorkspace.tsx` to own the central workspace render tree previously embedded in `EditorView`.
- [x] Moved the main canvas stage, drag/drop dock zones, 3D overlays, text quick bar, lock overlays, cursor preview, and bottom-right utility cluster out of `EditorView.tsx`.
- [x] Kept canvas/3D state ownership in `EditorView` and replaced inline workspace callbacks with named handlers before passing them into `EditorCanvasWorkspace`.
- [x] Reduced `EditorView.tsx` from `3190` to `3101` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/EditorCanvasWorkspace.tsx src/components/Editor/EditorPropertiesPanels.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "handles grid selection, context menu tool trigger, and zoom controls|renders brush cursor preview for paint-size tools and clears on mouse out|renders eyedropper target cursor preview when eyedropper is active|shows a corner lock badge for locked layers and unlocks from canvas|shows only one unlock lock control when selected layer is locked|unlocks a locked child layer inside a group from the canvas lock badge click|opens share flow, launches export quality modal, and downloads export|loads template missing assets, replaces with library selection, and resolves"`
  - `npm run build`

Completed in this pass (Editor workspace shell + 3D hook extraction slice):
- [x] Added `src/components/Editor/EditorWorkspaceShell.tsx` to own the outer workspace composition previously embedded in `EditorView`:
  - left tool rail
  - before/after workspace panel slots
  - `JobStatusFooter`
  - `CircularContextMenu`
- [x] Added `src/components/Editor/useEditorThreeDWorkspace.ts` to own 3D workspace state and handlers previously embedded in `EditorView`:
  - 3D generator/editor launch state
  - serializable layer-preview derivation for 3D source picking
  - insert/save/recover background-job flows
  - toolbar and panel entry handlers for 3D mode
- [x] Rewired `EditorView.tsx` to consume `EditorWorkspaceShell` and `useEditorThreeDWorkspace` while preserving existing panel, menu, lock-badge, and export behavior.
- [x] Reduced `EditorView.tsx` from `3101` to `2934` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorThreeDWorkspace.ts src/components/Editor/EditorWorkspaceShell.tsx src/components/Editor/EditorCanvasWorkspace.tsx src/components/Editor/EditorPropertiesPanels.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "handles grid selection, context menu tool trigger, and zoom controls|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions|supports admin actions, server rename fallback, and dirty-design back confirmation|opens share flow, launches export quality modal, and downloads export|loads template missing assets, replaces with library selection, and resolves|shows a corner lock badge for locked layers and unlocks from canvas"`
  - `npm run build`

Completed in this pass (Editor canvas overlay hook extraction slice):
- [x] Added `src/components/Editor/useEditorCanvasOverlayState.ts` to own canvas overlay state and effects previously embedded in `EditorView`:
  - context menu open/close state
  - lock-badge overlay state and canvas sync
  - cursor-preview state and pointer tracking
  - canvas lock/unlock mutation helper used by menus and overlays
- [x] Rewired `EditorView.tsx` to consume `useEditorCanvasOverlayState` and removed the in-file context-menu, lock-badge, and cursor-preview state/effect blocks.
- [x] Reduced `EditorView.tsx` from `2934` to `2553` lines.
- [x] Validation rerun:
  - `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorCanvasOverlayState.ts src/components/Editor/useEditorThreeDWorkspace.ts src/components/Editor/EditorWorkspaceShell.tsx src/components/Editor/EditorCanvasWorkspace.tsx src/components/Editor/EditorPropertiesPanels.tsx src/components/Editor/EditorTopToolOptionsBridge.tsx src/components/Editor/EditorHeaderPrimary.tsx src/components/Editor/EditorHeaderMenus.tsx src/components/Editor/EditorHeaderActions.tsx src/components/Editor/EditorViewOverlays.tsx`
  - `npm test -- src/components/Editor/__tests__/EditorView.test.tsx --runInBand -t "renders brush cursor preview for paint-size tools and clears on mouse out|renders eyedropper target cursor preview when eyedropper is active|shows a corner lock badge for locked layers and unlocks from canvas|shows only one unlock lock control when selected layer is locked|unlocks a locked child layer inside a group from the canvas lock badge click|handles grid selection, context menu tool trigger, and zoom controls|wires file/edit/image/layer/select/filter/view/window/help menu shells to existing editor actions"`
  - `npm run build`

### H) Implementation Status Snapshot
- [x] Phase 1 complete
- [x] Phase 2 complete
- [ ] Phase 0 complete
- [x] Phase 3 complete
- [ ] Phase 4 complete
- [x] Phase 5 complete
- [x] Phase 6 complete
- [ ] Phase 7+ complete

---

## Other Product Tracker Snapshot (Non-upgrade items)
From the feature tracker (now merged into ROADMAP.md):
- [x] Upgrade program is **In Progress** (item 29)
- [x] Gradient masks per layer
- [x] Local AI support (Ollama): runtime preferences, status probe, critique route, and first-pass image-generation provider wiring are complete
- [~] AI critique of image/canvas: toolbar modal + local route implemented, with runtime preflight/setup messaging in place; interactive QA still pending
- [ ] Direct social media posting integrations
- [x] In-profile change password
- [x] Import/export asset library
- [~] Additional online storage providers: shared provider abstraction + provider selection are in place; Google Drive remains the only implemented adapter
- [~] Channel editing panel MVP (rows/previews/isolate/invert/mask/value edits plus luminosity and per-channel opacity complete; advanced channel workflows still pending)
- [x] Google, Banana.dev, and NanoBanana runtime branches are now wired into the shared generation and agentic edit flows
- [ ] Facebook sign-in/auth integration

---

## Current Recommended Next Step
Proceed with **interactive Ollama QA + Media Overlay follow-through**:
- [~] Route-level Ollama QA is now scripted through `npm run qa:ollama` and verified against the running app.
- [ ] Run an interactive QA pass on the critique modal with at least one vision-capable Ollama model and tune the critique prompt/output shape.
- [ ] Run a hands-on QA pass on the Ollama SVG generation path with the saved local runtime/model settings, then decide whether the local path stays SVG-first or later graduates to a richer local-image orchestration flow.

Media Export Overlay Phase B remains open for QA/decision follow-through:
- [~] Browser export and variant-draft QA are now formalized through `npm run qa:overlay`.
- [ ] Validate the new variant-draft save flow against real design sessions.
- [ ] Decide whether the bridge stays as an in-editor draft flow or expands into a dedicated Campaign Workspace later.

Provider follow-through is now implementation-complete:
- [x] Google Gemini shared generation route
- [x] Banana.dev shared generation route via server-configured Banana endpoint
- [x] NanoBanana agentic edit provider integration
- [ ] Run live QA against a real Banana endpoint deployment once server env is configured

---

## Files This Consolidates
- `docs/imageprocessingui_upgrade_execution_checklist.md` (archived pointer)
- the feature tracker (now merged into `docs/ROADMAP.md`)
- `docs/chat_continuation_handoff_2026-02-23.md`

These files remain useful for detail/history, but all progress tracking must happen in this file.
