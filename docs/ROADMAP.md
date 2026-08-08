# Image Express — Roadmap

**The single forward-looking document.** Everything not-yet-built lives here.

- What exists today: [FUNCTIONALITY.md](FUNCTIONALITY.md)
- How it works: [ARCHITECTURE.md](ARCHITECTURE.md)
- What already shipped: [CHANGELOG.md](CHANGELOG.md)

Status: Active · Last updated: 2026-08-07 · Branch baseline: `main`

> **Change control.** Scope, priority, dependency and sequencing changes are
> made *here first*. When an item ships, move its notes into
> [CHANGELOG.md](CHANGELOG.md), update the behaviour claim in
> [FUNCTIONALITY.md](FUNCTIONALITY.md), and adjust
> [ARCHITECTURE.md](ARCHITECTURE.md) if the runtime shape changed.

---

## 1. Backlog

| ID | Initiative | Priority | State | Milestone |
|---|---|---|---|---|
| R-01 | Durable encrypted user key vault | P0 | Phase 1 delivered; hardening open | M0 |
| R-13 | Super installer + first-run orchestration | P0 | Scripts delivered; wizard UI open | M0 |
| R-02 | Campaign Workspace (media overlay B2) | P1 | B1 bridge done | M1 |
| R-03 | AI critique quality program | P1 | In progress | M1 |
| R-04 | Ollama local generation quality | P1 | In progress | M1 |
| R-05 | Channels advanced workflows | P1 | Partial | M1 |
| R-12 | Comfy custom workflows/nodes bundling | P1 | Foundation exists | M1 |
| R-14 | Comfy model catalog + custom upload UI | P1 | Not started | M1 |
| R-06 | Background jobs control center | P2 | **Core delivered**; provider polling open | M2 |
| R-11 | Provider QA hardening | P2 | Planned | M2 |
| R-08 | Additional cloud storage providers | P2 | Drive only | M2 |
| R-15 | Global resizable modal compliance | P2 | Mixed | M2 |
| R-16 | Interface customization | P2 | Mode + accents delivered | M2 |
| R-17 | Asset Vault phases 2–4 | P2 | Phases 0–1 delivered | M2 |
| R-18 | One-click distribution: signing + release validation | P2 | P0 foundation done | M2 |
| R-09 | Facebook authentication | P2 | Not started | M3 |
| R-10 | Direct social posting | P3 | Manual export only | M3 |
| R-19 | Mobile capture companion | P3 | Expo scaffold + contract only | M3 |

**Recommended order:** R-01 → R-13 → R-06 (finish) → R-12 → R-14 → R-02 →
R-03 → R-04 → R-05 → R-11 → R-17 → R-08 → R-15/R-16 → R-18 → R-09 → R-10.

---

## 2. Milestones

**M0 — Security & durability.** Keys survive restart, encrypted at rest, access
role-safe and auditable. A new user reaches a ready-to-run state from one
installer flow.

**M1 — Core creative workflow.** Campaign variants first-class. Critique output
structured and actionable. Local generation quality predictable per profile.
Channels support saved-channel and channel-to-selection. Comfy node/workflow
packs installable in-app; models selectable from the UI.

**M2 — Operations & asset ecosystem.** Every background job controllable from
one panel and surviving a tab close. Provider QA scripts in the release gate.
At least one additional cloud provider at parity. Modals follow one resize
contract. Signed installers verified on all three platforms.

**M3 — Identity & publishing.** Facebook login under the existing approval
model. Share menu posts to connected accounts with manual export as fallback.

---

## 3. Initiatives

### R-01 · Durable encrypted user key vault — P0
**Done:** encrypted filesystem vault service; `/api/user/keys` migrated.
**Open:** stronger authz on read/update paths, rotation/expiry policy,
optional external KMS for multi-node.
**Files:** `src/lib/server/user-key-vault.ts`, `src/app/api/user/keys/route.ts`.
**Acceptance:** keys survive restart; never returned in clear text outside the
authorized read path; rotation and failure cases covered by tests.

### R-13 · Super installer + first-run orchestration — P0
**Done:** `scripts/super-installer.mjs`, task scripts, config, `qa-installation` scaffold.
**Open:** Setup Wizard + Settings integration, deeper readiness tests, trust and
pinning policy for remote sources.
**Scope:** first-run selectors for ComfyUI, bundled custom nodes/workflows,
Comfy models and Ollama models; post-install validation with safe auto-fix.
**Acceptance:** one flow reaches a ready runtime; every action logged with a
retry path; validation reports pass/fail per subsystem.

### R-06 · Background jobs control center — P2 *(core delivered 2026-08-07)*
**Done:** the unified server queue — durable store, lane-based concurrency,
lease-based crash recovery, retries, SSE push, cancel/retry endpoints, and the
global pipeline rail. `POST /api/generate` no longer executes inline;
`GET /api/jobs/[id]/result` is no longer destructive. Full design record:
[JOB_QUEUE.md](JOB_QUEUE.md), contract in [ARCHITECTURE.md](ARCHITECTURE.md) §2.

**Open — in priority order:**
1. **Move provider polling server-side.** Meshy/Tripo/Hitem3D/Stability are
   still polled from the browser, so closing the tab abandons the job and the
   3-concurrent cap is per-tab rather than global. This is the largest
   remaining correctness gap in the queue.
2. Running-job cancellation — needs abort signals threaded into provider calls.
3. A full Activity panel with history and reorder. `BackgroundJobsPanel` today
   serves only the legacy localStorage jobs, and only inside the Editor.
4. OS-level notifications when the window is unfocused (Electron `Notification`).

### R-02 · Campaign Workspace (media overlay B2) — P1
Promote the frame-to-variant bridge into a real campaign workspace: right-side
flyout from Export, active-variant badge near the title.
**Acceptance:** create/rename/duplicate/delete/select variants; deterministic
export of current and of all; snapshots carry metadata and thumbnail linkage.
Benefits from the queue for variant-export batching.

### R-03 · AI critique quality program — P1
Profiles (composition, typography, brand consistency, conversion-readiness),
structured score + issue list + recommended actions, and "apply in editor" jump
actions.
**Acceptance:** same image + profile yields a stable structure; always at least
one actionable recommendation; runtime/model preflight still blocks clearly.

### R-04 · Ollama local generation quality — P1
Define the supported local model matrix, decide SVG-first vs bitmap-first per
use case, and add `fast` / `balanced` / `quality` profiles with explicit
tradeoffs.
**Acceptance:** capability guidance shown before a run; profile choice
materially changes output; `npm run qa:ollama` covers status, generation and
critique.

### R-05 · Channels advanced workflows — P1
Save named alpha/luma channels, load a channel as the active selection, and
manage the channel stack.
**Note:** the document content-selection mask is live — channel load should
write into that mask.

### R-12 · Comfy custom workflows/nodes bundling — P1
Bundle first-party workflow/node repo definitions, add install/update actions in
Settings, track installed version/commit and surface updates.
**Acceptance:** install/update without manual git; bundled workflows appear when
requirements are met; missing-dependency messages name the specific node/model.

### R-14 · Comfy model catalog + custom upload — P1
Per-workflow model picker, UI path to register custom model files, and
compatibility guardrails.
**Acceptance:** switch from default SDXL to alternative or custom models in UI;
invalid combinations blocked with guidance; selection persists across sessions.

### R-11 · Provider QA hardening — P2
`scripts/qa-providers.mjs` plus an expanded route test matrix for the
less-travelled provider paths (Banana/NanoBanana, multi-provider consistency).
**Acceptance:** runs in the release gate; failures identify provider, stage and
suggested fix.

### R-17 · Asset Vault phases 2–4 — P2
Phases 0–1 (foundation, entry points, hybrid search, local merge) are delivered,
as is folder-tree navigation.
**Open:** full CRUD parity with the classic library and richer previews (P2);
multi-location indexing across network shares and cloud connectors (P3); agent
and canvas bridges (P4).
**Switch-over:** the vault replaces the classic library as default only once
CRUD parity and preview fidelity match.

### R-18 · One-click distribution — P2
**Done:** P0 foundation — packaging, updater runtime, release workflow, package
verification.
**Open:** code signing (Windows EV / Apple Developer ID + notarization), and a
real cross-platform release validated from a version tag. The workflow is wired
for `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER`; until those secrets exist every build is unsigned and
Gatekeeper/SmartScreen will object. See [RELEASE_PROCESS.md](RELEASE_PROCESS.md).

### R-08 · Additional cloud storage providers — P2
Generalize the provider contract (list/upload/download/rename/delete/visibility)
and bring one additional adapter to Drive parity without breaking existing Drive
users.

### R-15 · Resizable modal compliance — P2
One shared `ResizableModalShell`, consistent handles and min/max constraints,
mobile fallbacks, optional persisted size/position — without breaking
keyboard/focus flows.

### R-16 · Interface customization — P2
Mode and accent palettes are delivered. Open: broader interface colour
customization within contrast guardrails.

### R-09 · Facebook authentication — P2
OAuth sign-in mapped into the existing pending/approved/rejected/disabled model,
with clear denial states and no change to email/Google flows.

### R-10 · Direct social posting — P3
Connected-account posting with caption/alt/aspect validation; manual export
stays as the fallback. Expired tokens must fail with actionable recovery.

### R-19 · Mobile capture companion — P3
An Expo scaffold and a defined auth/upload contract exist under
`mobile-companion/`. It is a separate workspace with its own lockfile, outside
the main app's dependency audits. Open: decide whether to ship it at all.

---

## 4. Cross-cutting debt

Not features, but they block the gates.

- **`npm run lint` fails on `main`** — 14 errors in committed files
  (`AssetVault/useVaultBrowse.ts` ×10, `ColorConstellation` ×2,
  `useEditorCanvasSelectionInteractions.ts` ×2), nearly all
  `react-hooks/set-state-in-effect`. This blocks `npm run verify` from passing.
- **`desktop:pack` can report exit 0 while electron-builder failed**, leaving a
  partially-copied package that only `desktop:verify-package` catches.
- **`electron/main.js` logs the server child's stderr as a byte count only**,
  which makes a packaged startup failure undiagnosable from the log.
- **Broken submodule reference**: `Imageprocessingui` is a gitlink (mode
  `160000`) with no `.gitmodules` entry, so a fresh clone leaves an empty
  directory.
- **`brace-expansion` scanner noise** — the installed 1.1.18/2.1.4 builds carry
  the CVE-2026-14257 fix and are the last releases on their lines, but scanners
  use a flat `<=5.0.7` range. Silencing it permanently requires forcing
  `minimatch@10` everywhere so nothing needs the old callable export. See
  [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md).
- **Positional vault page ids** (`<album>::page_N`) renumber on re-index. The
  folder tree avoids this by keying on paths; the group view still does not.

---

## 5. Deferred by decision

Recorded so they are not rediscovered as gaps:

- **Horizontal scaling.** All persistence is filesystem JSON. Correct for a
  single-machine app; a shared store is a prerequisite for multi-node, not a
  bug.
- **Reference-UI parity program.** The upgrade pass against the external
  `Imageprocessingui` reference is complete in substance (top options bar,
  selection engines, retouch tools, panel structure). No further parity work is
  planned; the reference repo is no longer a dependency.
