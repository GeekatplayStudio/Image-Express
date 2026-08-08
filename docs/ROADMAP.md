# Image Express — Roadmap

**The single forward-looking document.** Everything not-yet-built lives here.

- What exists today: [FUNCTIONALITY.md](FUNCTIONALITY.md)
- How it works: [ARCHITECTURE.md](ARCHITECTURE.md)
- What already shipped: [CHANGELOG.md](CHANGELOG.md)

Status: Active · Last updated: 2026-08-08 · Branch baseline: `main`

> **Change control.** Scope, priority, dependency and sequencing changes are
> made *here first*. When an item ships, move its notes into
> [CHANGELOG.md](CHANGELOG.md), update the behaviour claim in
> [FUNCTIONALITY.md](FUNCTIONALITY.md), and adjust
> [ARCHITECTURE.md](ARCHITECTURE.md) if the runtime shape changed.

---

## 0. P0 — Operational floor

**This outranks every feature below.** The app is broad and ambitious; what it
lacks is a floor that makes it *trustworthy*. Nothing in §1 should be started
while anything here is open.

The governing rule: **`npm run verify` must pass, and it must mean something.**
It now runs `audit:overrides → audit:architecture → audit:filesize → lint →
typecheck → tests → build → audit:bundle`. Run it before every commit. If a gate
is red, that is the work.

### F-01 · Zero lint errors — ✅ **done**
`npm run lint` exits 0. Keep it that way — `verify` enforces it.

- **Done:** ESLint was linting build output inside git worktrees and the
  gitignored `theme-packs/` authoring area — **108,985 problems**, minutes of
  runtime, which made the command unusable and let real errors hide. Ignore
  patterns now cover `**/.next/**`, `.claude/worktrees/**` and the pack
  workspaces. Also fixed: `prefer-const`, a `react-hooks/immutability` false
  positive on external-system sync (justified disable), and two
  `set-state-in-effect` cases in ColorConstellation — one replaced by a lazy
  initializer, one by React's documented adjust-during-render pattern. Both
  removed a wasted render that flashed stale UI.
- **Done:** the remaining 10 errors and the `exhaustive-deps` warning — see F-02.

### F-02 · Refactor `useVaultBrowse` state flow — ✅ **done**
Eight effects became render-time derivation. Each was replaced, not suppressed:

| Effect | Replacement |
|---|---|
| Clamp `pageIndex` to `totalPages` | **Deleted** — `safePageIndex` derives it, so an out-of-range page never renders |
| Expand the active album | **Deleted** — derived set, so selecting an album no longer flickers its children |
| Clear selection when `depth === 'room'` | **Deleted as dead code** — every caller that sets `'room'` already clears the selection |
| `setPageIndex(0)` on nine deps | One `viewKey` compared during render |
| Album/page reconciliation | Adjust during render, guarded on previous value |
| Lens/sort hints from the query | Adjust during render, guarded on the previous hint |
| Auto-select first album on open | Render-time condition |
| Reset on close | Render-time transition; only the parent callback stays in an effect |

Every removed effect also removed a wasted render that briefly painted stale
UI — a stale lens, a collapsed album, an out-of-range page.

`pendingFlatRematchRef` became state: a ref mutated during render is unsafe
under concurrent rendering.

**Coverage:** the hook had **no direct tests** before this. Added
`useVaultBrowse.test.tsx` (10 tests) pinning the rules that were previously
only implied — including that a momentarily-empty catalog must not destroy the
browsing position. Verified non-vacuous: 2 of the 10 fail against the
pre-refactor implementation.

**Extraction:** the refactor pushed the file to 532 lines and the new ratchet
failed on it, so folder navigation moved to `useVaultFolderNav.ts`
(463 + 109 lines). The gate caught its author, which is the point.

### F-03 · Catalog storage → SQLite — ✅ **done** *(targeted-write follow-up open)*
The single architectural ceiling. `data/vault/catalog.json` is **153 MB**,
fully parsed and Zod-validated into heap, and **every mutation rewrites the
entire file** — adding one asset rewrites 153 MB.

- **Done:** stopped pretty-printing the catalog and vector store. Indentation
  alone measured **~29 MB of the 153 MB**, paid on every write and every parse.
  Free win, no format change.
- **Decision — use `node:sqlite`.** Built into Node 24+, zero dependencies, no
  native rebuild for Electron ABI bumps, ACID, crash-safe. Rejected:
  `better-sqlite3` (native module, rebuild on every Electron major),
  Postgres/Mongo (a server process on a user's laptop is the wrong trade),
  LMDB/LevelDB (no ad-hoc queries, and we need filtered scans), staying on JSON
  (this is the problem).
- **Schema:** one `assets` table keyed by id, with indexed columns for
  `type`, `watch_root_id`, `modified_at` and a `folder_path` prefix index —
  the folder tree and type lenses become queries instead of full scans.
  Embeddings stay in a separate table so a vector rebuild never rewrites asset
  rows.
- **Migration:** read the existing JSON once, write the DB, keep the JSON as a
  backup for one release. `node:sqlite` is still flagged experimental, so keep
  the store behind its current interface and retain the JSON implementation as
  a fallback.
- **Done — the store itself.** `src/lib/server/vaultCatalogDb.ts` implements
  the schema above with WAL and `synchronous=NORMAL`, plus an idempotent
  `migrateCatalogFromJson` that records a marker rather than touching the JSON.
  13 tests, including the two that matter: a folder-prefix near-miss
  (`d:/media-private` must not match `d:/media`) and a direct check that adding
  one asset to a 2,000-row catalog writes a row rather than the whole store.
  Every DB test skips rather than fails when `node:sqlite` is absent, because
  falling back is a supported configuration.
- **Done — wired in.** `readVaultCatalog`/`writeVaultCatalog` use SQLite when
  `node:sqlite` is present, migrating the JSON catalog once on first read.
  `IMAGE_EXPRESS_VAULT_STORE=json` forces the old path without a new build, and
  any SQLite error falls back to JSON rather than making the vault unusable.
  Because the public interface is whole-catalog, `syncCatalogAssets` diffs a
  cheap projection — id, mtime, size, never the record body — and writes only
  what changed.

- **Measured** at 200k assets / 158 MB, the real catalog's scale:

  | Operation | JSON | SQLite |
  |---|---|---|
  | Add one asset | 478 ms (rewrites 158 MB) | **1.4 ms** |
  | Load for a query | 355 ms parse, before Zod | — |
  | Change detection over the whole set | — | 313 ms |
  | Assets in one folder | full scan of 200k | **3.6 ms** |

- **Done — the targeted write path.** `upsertVaultAssets`, `deleteVaultAssets`
  and `readVaultAssetsByWatchRoot` let a caller that already knows what changed
  skip the diff scan entirely. Both callers that were rewriting the catalog now
  use them:
  - **Vault enrichment** captions and embeds at most 24 assets per run and was
    handing back all 200k, making the store rediscover 24 changes by scanning
    every row. **342 ms → 0.5 ms.**
  - **Watch-root rescan** replaced one folder's assets by rewriting the whole
    catalog, and loaded all 200k into memory first just to find that folder's
    prior records. Now an indexed query: **885 ms → 109 ms** on a root holding
    an eighth of the library.

  Each keeps its JSON fallback, where the same call is still a read-modify-write
  of the whole document — that path cannot do better, and it is the one the
  numbers above are measured against.
- **Read the headline honestly.** `writeVaultCatalog` still exists and still
  costs the 313 ms diff scan, because it is handed a whole catalog and has to
  find the delta itself. It is now the *fallback* shape, not the normal one.
- **One operation got worse, and it is the hot one.** Materialising the whole
  catalog from rows costs a `JSON.parse` each: **903 ms vs 257 ms** for the
  single JSON document, measured in one run. SQLite wins on writes and scoped
  queries and loses on "give me everything". Search reads the whole catalog per
  query, and the JSON path had an mtime-keyed cache making repeat reads free —
  so the SQLite path now keeps an equivalent snapshot cache, invalidated by
  every write helper and pinned by tests that fail if the invalidation is
  removed. **This was a regression I introduced and then caught; without the
  cache the migration would have made search 3.5× slower.**
- **Next, and the honest fix:** search, similar-asset lookup and the sync route
  should stop asking for the whole catalog. A cache holds the line; it does not
  remove the ceiling, and it costs a full copy of the catalog in memory.
- **Cost paid:** the DB is larger on disk than the JSON — 229 MB vs 158 MB —
  from storing each record plus four indexes. Accepted: disk is cheap, the
  158 MB write amplification was not.
- **Acceptance:** adding one asset writes O(1), not 153 MB ✅; latency measured
  before and after ✅; catalog load no longer holds the full set in heap
  **partially** — the watch-root rescan no longer does, but `readVaultCatalog`
  still materialises everything for search, similar-asset lookup and the sync
  route. Those are the remaining callers to move onto scoped queries.

### F-04 · Server-side provider polling — ✅ **done**

**Done — the provider logic is now shared, pure and tested.**
`src/lib/server/jobQueue/providerPoll.ts` owns URL construction, auth headers,
response normalisation and poll backoff for all four providers. It previously
lived as ~250 lines of inline branching inside `useBackgroundJobPolling`, in the
browser, with no tests — and it is exactly where a silent mis-read turns a
finished job into one that polls forever. 29 tests cover the status vocabularies
that differ per provider (`SUCCEEDED` vs `success` vs `task_status: 4`,
`CANCELED` vs `CANCELLED`, `EXPIRED`), the 0–1 vs 0–100 progress scales,
Hitem3D's "a model URL means done even if the status field lags", and the Meshy
preview→refine chain.

Faithfulness was proven by pointing the existing client hook at the module: its
suite still passes unchanged, and the hook dropped 545 → 381 lines.

**Done — the server can now poll a provider to completion.**
`handlers/remotePoll.ts` drives the loop with the key read from the encrypted
vault, and calls the provider **directly** rather than looping a request back
through our own HTTP server (which would have to know its own port and would
fail during startup). `POST /api/queue/poll` enqueues one onto the
`remote:<provider>` lane, so the concurrency cap is global rather than per-tab,
and it never accepts a key from the caller.

Failure handling is deliberate: a **4xx fails immediately** (a bad key or a bad
request cannot be fixed by retrying), while 5xx, 429 and transport faults ride
out up to five consecutive errors. A success with no result URL is rejected
rather than stored. Poll bounds are injectable, which is what makes the handler
testable at all — 12 tests cover the vault lookup, direct-to-provider URL,
fail-fast vs ride-out, cancellation, and Hitem3D's `ak:sk` + `Appid` shape.

**Done — step 3: the client is cut over.** Starting a 3D generation now hands
the task to the server (`serverPollHandoff.ts`), the browser stops polling
anything carrying a `queueJobId`, and `useServerPolledJobCompletion` finishes
those jobs from the SSE stream. **A generation now survives closing the tab.**

The completion path — library save, offscreen GLB render, canvas placement —
moved to `backgroundJobCompletion.ts` and is shared, because it now has two
callers and must behave identically for both. It stays client-side: every step
needs a Fabric canvas.

Two deliberate safety properties:
- **The handoff is best-effort.** If `/api/queue/poll` fails, the browser poller
  carries on exactly as before. A less-resilient job beats a generation lost to
  a queue outage.
- **Completion is idempotent.** SSE resends a full snapshot on reconnect, so
  without a guard a dropped connection would place the same model on the canvas
  twice.

**Guests keep browser polling.** Keys are only vaulted for signed-in accounts,
so there is nothing for the server to authenticate with; the handoff detects
this locally and never makes the call. Behaviour for guests is unchanged.

**Done — the Meshy `text-to-3d` refine leg.** The handler detected
`needsMeshyRefine` but nothing acted on it, so a server-polled text-to-3d job
finished at *preview* quality — an untextured model, which reads as a quality
regression rather than a missing pipeline step. The loop now starts the refine
task, retargets the poll at the returned id and resets its backoff, so one job
spans both legs. If refine cannot be started the preview is kept and the reason
logged: a worse model still beats a failed job.


Meshy/Tripo/Hitem3D/Stability jobs are polled **from the browser**, so closing
the tab abandons a running job and the 3-concurrent cap is per-tab. Users lose
paid API credits with no recovery.

- **Recommendation: no new daemon.** Reuse the queue that already exists —
  this is a job kind, not new infrastructure. Register a `remote-poll` handler
  whose body is the existing poll loop, enqueued on the `remote:<provider>`
  lane so the cap becomes global instead of per-tab. It already has leases,
  retries, crash recovery and SSE push.
- **Why not a separate worker process:** it would need its own supervision,
  logging and IPC, and would break the single-process assumption that makes
  boot recovery sound (`running` ⇒ dead process). Not worth it until workers
  must outlive the app.
- **Sequencing:** move polling first; API keys then stop round-tripping through
  the browser, which is a security improvement as well as a reliability one.
- **Acceptance:** start a 3D generation, close the tab, reopen — the job is
  still running and completes; concurrency is capped globally.

### F-05 · Code signing — P0
The biggest single lever on adoption. Every user currently meets SmartScreen or
Gatekeeper warnings, which is fatal for a tool asking to index their whole drive.

- **macOS:** Apple Developer Program ($99/yr) → Developer ID Application
  certificate → notarize via notarytool. The release workflow already reads
  `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
  `APPLE_API_ISSUER`; adding the secrets is most of the work.
- **Windows:** since June 2023 an **OV certificate no longer works** for
  reputation — it must be **EV**, on hardware or an approved cloud HSM
  (Azure Trusted Signing, SSL.com, DigiCert KeyLocker). Budget ~$300–600/yr.
  Cloud HSM is strongly preferred: a USB token cannot sign from CI.
- **Recommendation:** Azure Trusted Signing if eligible — lowest cost, designed
  for CI, no physical token. Do macOS first: it is cheaper, fully scripted, and
  the pipeline is already wired.
- **Verified 2026-08-08 — the macOS pipeline really is ready.** Checked against
  the installed electron-builder 26, not assumed: notarization there is
  *opt-out* (only `mac.notarize: false` disables it), and its option resolver
  reads `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` — exactly what
  `release.yml` already forwards. `hardenedRuntime` is already `true`. So
  adding the three secrets genuinely is the remaining work; **no config change
  is needed**, and none should be made speculatively.
  - One sharp edge: the resolver throws if you set *some* of the three. All
    three, or none.
- **Do not** attempt to work around Gatekeeper/SmartScreen in scripts. It is the
  point of the mechanism, and trying looks like malware.

### F-06 · Shrink oversized files — P0 (ratcheted)
The 500-line rule existed in `repo-audit.mjs` but that script **never set an
exit code**, so 40 files drifted past it with nothing to stop them.

- **Done:** `npm run audit:filesize` (`scripts/file-size-ratchet.mjs`) is now
  binding and part of `verify`. A file not in the baseline may not exceed 500
  lines; a baselined file may not grow; a file that drops below must be removed
  from the baseline. The list can only shrink. i18n dictionaries are exempt —
  they are translation data, and a line budget on a key/value table measures
  nothing.
- **Done — first split.** `ImageGeneratorModal.tsx` held ~270 lines of pure
  planning and formatting before its component started. It moved to
  `src/lib/comfyui/requestPlanning.ts` with 32 tests. The point was coverage,
  not the line count: `resolveComfyQualityProfile` picks the resolution, steps
  and CFG a generation runs at, and it could not be tested without mounting a
  4,000-line modal, so it never had been. **4,013 → 3,759.**
- **Done — second split.** `AssetLibrary.tsx` gave up asset identity and
  duplicate merging to `src/lib/assetLibrary/assetMerging.ts`, with 41 tests.
  Same reasoning: the same file exists on the server, locally and in Drive at
  once, and deciding they are one asset — and which copy to hand back — was
  untested logic where merging too much could collapse a private copy into a
  public one. **3,041 → 2,906.**
- **Open:** 39 baselined files. Attack worst first, splitting by responsibility
  rather than by line count:
  `PropertiesPanel.tsx` (3,822) · `ImageGeneratorModal.tsx` (3,759) ·
  `AssetLibrary.tsx` (2,906) · `Toolbar.tsx` (2,689) · `ThreeDGenerator.tsx` (2,197).
- **`PropertiesPanel.tsx` needs a different approach.** Its component begins at
  line 175 and runs to the end, so there is no pure prefix to lift — it needs
  the render tree split by responsibility, which is the harder job and should
  not be attempted in the same pass as a mechanical extraction.
- **What to look for.** The productive cut in these files is the pure logic
  sitting above the component — it extracts cleanly, becomes testable
  immediately, and carries no JSX risk. Splitting the render tree is the harder,
  later job.
- **Rule going forward:** every PR that touches a baselined file should lower
  its number. Run `npm run audit:filesize:update` after a split.

### F-07 · Diagnosability — ✅ **done**
`electron/main.js` logged the packaged server's stderr as a **byte count only**
(`{"event":"server.stderr","details":{"bytes":1438}}`). When the packaged app
failed to start, the log recorded that 1,438 bytes of error existed and nothing
about what they said.

- **Done:** the handler now records the text. Redaction moved out of `main.js`
  into `electron/logRedaction.js`, which is the shell's single redaction path —
  the inline `redactDiagnosticValue` was already there, so logging the text
  would otherwise have meant a second, divergent redactor beside it.
- The extracted version takes the paths to mask as an injected thunk rather
  than importing Electron's `app`, so it is testable without booting Electron.
  It had **no tests at all** before this, despite guarding the exact file users
  are asked to attach to support tickets. Now 19.
- Coverage gained a case in the move: a bare `sk-…` key with no surrounding
  label, which the inline version passed through untouched.

> **Correction (2026-08-07):** an earlier note here claimed `desktop:pack`
> reports exit 0 while failing. That was a measurement error — `$?` after a
> shell pipe returns the *last* command's status, not the script's.
> `desktop:pack` is a plain `&&` chain and propagates correctly. No fix needed.

### F-08 · Process — ✅ **done**
**`npm run verify` now passes end to end**, and every stage of it is meaningful:

```
overrides → architecture → filesize → terms → i18n → lint → typecheck → tests → build → bundle
```

- **Run it before every commit.** Not `lint` alone, not `test` alone.
- CI must run the same chain, so local and CI cannot disagree.
- **`audit:terms` fixed** — 17 violations. 13 were real (a saved document is a
  **Page**, not a "design"; saved user content is an **Album**, not a
  "project"), so the strings changed. 3 were the banned word in a genuinely
  different sense and became documented exceptions alongside the existing ones:
  "**Design** connected OKLCH palettes" (a verb), "**design** feedback" (the
  aesthetics), "text-to-image **stack**" (a software stack). One was reworded to
  sidestep the ambiguity entirely.
- **`audit:i18n:parity` replaced by a ratchet.** It failed if *any* locale
  missed *any* key, which with eight partial languages was red by construction —
  it could only go green after a full translation pass, so it was permanently
  red and therefore ignored. `audit:i18n:ratchet` records the missing-key count
  per locale and fails only on a **regression**: adding an English string
  without translating it into a locale that was already at that level. Counts
  may only decrease. The full per-key report is still `audit:i18n:parity`.

> Both new gates follow the same shape as the file-size ratchet: encode current
> reality, make it one-way, and let the number only improve. A gate nobody can
> pass is worse than no gate.

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
