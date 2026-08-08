# Image Express — Architecture Reference

**This is the master reference for how the system works.** Read it before
changing runtime code.

- What the app *does* for a user: [FUNCTIONALITY.md](FUNCTIONALITY.md)
- What we're building next: [ROADMAP.md](ROADMAP.md)
- What things are called: [TERMINOLOGY.md](TERMINOLOGY.md)
- What already shipped: [CHANGELOG.md](CHANGELOG.md)

---

## 1. Shape of the system

Image Express is a single Next.js 16 (App Router) application that runs in three
places from one codebase: a browser, a local loopback web server, and an
Electron desktop shell. There is no separate backend service — the Next server
*is* the backend, and on a local install it runs on the user's own machine.

That single fact drives most of the design decisions below: the "server" and
"the user's computer" are usually the same machine, so the app can index local
drives and spawn local runtimes — but it must fail closed when that assumption
does not hold.

```mermaid
graph TD
    A[Electron shell / Browser] --> B[Next.js App Router client]
    B --> C[Fabric.js 2D canvas]
    B --> D[Three.js WebGL 3D]
    B --> E[Command history]
    B --> F[Next.js API routes]
    B -. SSE .-> Q

    F --> Q[Job queue: durable store + lane scheduler]
    Q --> G[Provider adapter layer]
    G --> H[Local: ComfyUI / Ollama]
    G --> I[Cloud: Stability / OpenAI / Gemini / Meshy / Tripo / Hitem3D]

    F --> S[(Filesystem stores)]
    F --> V[Asset Vault index]
```

### Runtime profiles

`src/lib/server/runtimeProfile.ts` resolves one of three profiles. Everything
security-sensitive keys off it.

| Profile | When | Filesystem access |
|---|---|---|
| `desktop-local` | Electron (`NEXT_DESKTOP=1`) | All drives |
| `developer-local` | `npm run dev`, and `npm run start` (declared by `start-web.mjs`) | All drives |
| `self-hosted` | `NODE_ENV=production` with no explicit profile; Docker sets it explicitly | **Nothing** unless `IMAGE_EXPRESS_VAULT_ALLOWED_ROOTS` lists it |

`self-hosted` fails closed by design: an unset allowlist means "authorise
nothing", never "allow everything". Both local launchers bind `127.0.0.1`
only, which is what makes granting them full filesystem access safe.

> **Historical trap.** `next start` sets `NODE_ENV=production`, so a local user
> running `npm run start` was classified `self-hosted` and every
> `/api/assets/vault/file` request returned 403 for their own indexed files.
> `scripts/start-web.mjs` now declares its profile explicitly. Pinned by tests
> in `__tests__/start-web-runtime-profile.test.ts` and
> `src/lib/server/__tests__/runtimeProfile.test.ts`.

---

## 2. The "Q" — unified job queue

Long-running AI work never runs inside a request handler. This section is the
full contract; the design rationale and Adobe comparison live in
[JOB_QUEUE.md](JOB_QUEUE.md).

### Why it exists

Before the queue, `POST /api/generate` called `void processGenerateJob(id)`
directly in the request handler. That meant no concurrency cap (five clicks =
five concurrent provider calls, which OOMs a local GPU), no crash recovery
(provider params lived in a module-level `Map` that HMR and restarts wiped, so
interrupted jobs reported `running` forever), and `GET /api/jobs/:id/result`
deleted the result on first read.

### The nine stages

Every job moves through the same pipeline, and the UI names these stages:

```
Request → API → Queue → Worker → AI → Validate → Store → Notify → Retrieve
```

| Stage | Meaning |
|---|---|
| `request` | Client fired the action |
| `api` | Route accepted it (`202` + job id) and did **no** work |
| `queue` | Durable record written, waiting for a lane slot |
| `worker` | A lane slot opened; handler started |
| `ai` | Provider call in flight (local or remote) |
| `validate` | Output checked before it is trusted |
| `store` | Result written to durable storage |
| `notify` | Terminal transition pushed to clients |
| `retrieve` | Result addressable and re-fetchable |

### Status enum

`queued → running → succeeded | failed | cancelled`. Flat and small, following
Adobe Firefly Services' async job contract.

### Concurrency lanes

The single most important property. Lanes have independent caps so one slow
provider cannot starve another kind of work:

| Lane | Cap | Why |
|---|---|---|
| `local-gpu` | **1** | One GPU. Serialize or OOM. ComfyUI-backed providers (e.g. `flux`) live here. |
| `local-cpu` | 4 | Thumbnails, embeddings, vault indexing |
| `remote:<provider>` | 3 each | Per-provider window; `nanobanana`, `stability`, … |

Within a lane: priority first, then FIFO.

### Durability and crash recovery

- **Store**: `data/queue/jobs.json`, written atomically (temp file + rename),
  writes serialized on a promise chain. Terminal jobs pruned after 24h.
  `QueueStore` resolves its directory **once at construction** — resolving
  per-write let async writes land wherever `IMAGE_EXPRESS_DATA_DIR` pointed at
  flush time.
- **Leases**: a running job holds a lease that its own progress updates renew.
- **Boot recovery**: this is a single-process app, so any job persisted as
  `running` belonged to a dead process. It is failed as `interrupted` at
  startup. Zombie jobs are structurally impossible.
- **Singleton**: the scheduler is pinned to `globalThis` so Next.js dev HMR
  cannot orphan in-flight work. *Consequence:* editing `scheduler.ts` does not
  replace the live instance — restart the dev server after changing its shape.

### Transport: SSE, not polling

`GET /api/queue/stream` pushes every transition. Each connection opens with a
full snapshot, so a reconnect cannot miss a state change; `EventSource`
reconnects natively. `GET /api/queue` remains as a snapshot fallback.

### Job control

| Endpoint | Rule |
|---|---|
| `POST /api/queue/[id]/cancel` | Queued jobs only. Running → `409 job_not_cancellable`; handlers own their provider calls and cannot be interrupted safely. |
| `POST /api/queue/[id]/retry` | Failed or cancelled only; resets `attempts` to zero. Otherwise `409 job_not_retryable`. |

Two things make retry actually work: failed jobs **keep their uploads** (they
are the inputs a retry needs), and unredacted provider params survive in memory
for the process lifetime. After a restart those are gone, so retrying a
credentialed provider fails — by design, since persisting secrets is exactly
what redaction prevents.

### Adding a new kind of job

1. Write a handler `(ctx: QueueHandlerContext) => Promise<{resultUrl?} | void>`
   in `src/lib/server/jobQueue/handlers/`; call `ctx.update({stage, progress, message})`
   as it advances.
2. Register it in `src/lib/server/jobQueue/index.ts`.
3. Enqueue with `getQueue().enqueue({ kind, lane, external, label, payload })`.

Persistence, recovery, retries, SSE, the pipeline rail and notifications all
come for free. **Always import from `index.ts`**, never `scheduler.ts` directly,
or handler registration is skipped.

### Client surface

- `src/hooks/useQueueStream.ts` — the SSE subscription, callback-based so
  consumers update state inside external-event callbacks.
- `src/components/PipelineRail.tsx` — global 3px strip under the top toolbar,
  one segment per stage. Merges the server queue with the editor's
  localStorage background jobs, distinguishes External-API vs Local work,
  surfaces failure reasons inline, and offers cancel/retry.

### Known gap

Meshy/Tripo/Hitem3D/Stability 3D jobs are still polled **from the browser**
(`useBackgroundJobPolling`), so closing the tab abandons them and the
3-concurrent cap is per-tab. Migrating that into queue workers is the largest
open item — see [ROADMAP.md](ROADMAP.md).

---

## 3. Editor runtime

`src/components/Editor/EditorView.tsx` orchestrates; behaviour lives in
extracted hooks so the file stays navigable.

| Domain | Hook |
|---|---|
| Save / load / back-safety | `useEditorPersistence` |
| Export, share, quality modal | `useEditorExport` |
| Undo / redo / duplicate | `useEditorHistory` |
| Menu commands | `useEditorMenuActions` |
| Keyboard shortcuts | `useEditorKeyboardShortcuts` |
| Media overlay + campaign variants | `useMediaOverlay`, `useMediaOverlayCampaignVariants` |
| Background jobs | `useBackgroundJobsStore`, `useBackgroundJobPolling` |
| Selection / retouch pipelines | `useEditorCanvasSelectionInteractions`, `useEditorCanvasRetouchInteractions` |
| Top tool controls | `useEditorTopCanvasControls`, `useEditorShapeGradientControls` |
| 3D workspace | `useEditorThreeDWorkspace` |

Composition shells: `EditorWorkspaceShell` (tool rail, panels, job footer),
`EditorCanvasWorkspace` (canvas stage, overlays, utility cluster),
`EditorViewOverlays` (modals, including the Asset Vault).

### Canvas model

`DesignCanvas` owns a full-size Fabric canvas plus an explicit **artboard**
rect as a non-selectable base layer. The artboard is the export boundary; it is
kept at the bottom of the stack and excluded from selection and deletion.

The "Canvas W×H" badge resolves through
`resolveUtilityCanvasSize` in precedence order: scaled `artboardRect`, then
`artboard`, then the Fabric element divided by zoom. Only the last is the
viewport — a detail that silently broke a test when a shared stub gained an
artboard.

### Cross-canvas linked layers

Any layer can carry a `sharedLayerId`, broadcasting itself into every other
page — including across albums. Mutations fan out to every linked instance
without circular update loops. Bookshelves are a **hard resource boundary**:
linked layers never sync across shelves.

---

## 4. Asset Vault

Indexes assets **in place** across local drives without moving files.

- **Records**: `origin.uri` (`file://d:/…` or `server://…`) is canonical;
  `displayPath` is for display only and is not a clean path.
- **Watch roots**: `data/vault/watch-roots.json`. A file must sit inside a
  registered root *and* pass the runtime access policy — two independent gates,
  because this endpoint turns a path into bytes.
- **Vectors**: `data/vault/vectors.json`, mtime-keyed in-memory cache.
- **Scale**: a whole-drive scan is routinely ~200k assets. `DEFAULT_MAX_SCAN_FILES`
  caps one scan at 200,000.

### Two navigation models

| Mode | Source | Ids |
|---|---|---|
| **Groups** | `domain/vaultAlbumTree.ts` — derived lenses (type / date / location / subject) | Album ids semantic; **page ids positional** (`<album>::page_N`) |
| **Folders** | `domain/vaultFolderTree.ts` — the real directory tree | **The folder path** |

Positional page ids are a known hazard: re-indexing renumbers them, which used
to throw the reader back to page 1. The folder tree exists partly to avoid that
class of bug — path ids survive a re-index. Folder tree builds in one pass,
O(total path segments): measured at 200,081 assets → 700 nodes in ~550 ms, so
it is memoised on `workingAssets` alone (**not** `t`/`language`) and skipped
entirely while the folder sidebar is closed.

---

## 5. Provider adapter layer

Every generative action returns the same normalized shape to the UI, so
providers are swappable mid-project.

- `src/lib/agentic-edit/providers/` — `flux` (ComfyUI-backed), `nanobanana`, `mock`.
  Resolved by `resolveModelProvider`; unknown names fall back to `mock`.
- Provider params are **redacted before they touch disk**
  (`SENSITIVE_PARAMETER_PATTERN`); unredacted values live only in memory.
- ComfyUI (`src/lib/comfyui/`) uses a WebSocket for live progress with HTTP
  history polling as fallback. The browser-proxy mode skips the socket entirely.

---

## 6. API surface

86 routes under `src/app/api/`. Grouped:

**Queue** — `/api/queue`, `/api/queue/stream`, `/api/queue/[id]/cancel`, `/api/queue/[id]/retry`
**Agentic jobs** — `/api/generate`, `/api/jobs/[id]`, `/api/jobs/[id]/result`
**AI providers** — `/api/ai/generate-image`, `/api/ai/stability/*` (generate, img2img, inpaint, outpaint, remove-bg, upscale, upscale/poll), `/api/ai/comfy/{proxy,library}`, `/api/ai/ollama/{status,install,critique,describe-asset,vision-models}`, `/api/ai/meshy`, `/api/ai/tripo/*`, `/api/ai/hitems/*` (incl. depth, split), `/api/ai/brand-manager/*`, `/api/ai/super-agent/*`
**Asset Vault** — `/api/assets/vault/{search,similar,browse,drives,file,status,sync,enrich,bookcases,watch-roots}`
**Assets / designs / templates** — `/api/assets/{upload,list,delete,rename,visibility,save-url,fetch-url,serve/[...path]}`, `/api/designs/*`, `/api/templates/*`, `/api/export/proxy`
**Themes / ambience** — `/api/themes/*`, `/api/ambience/*` (both with `install` and sandboxed `files/[id]/[...path]`)
**Runtime** — `/api/runtime/comfy`, `/api/runtime/{dependencies,installer}/{status,run}`, `/api/system/update`
**User / auth / admin** — `/api/user/auth/*`, `/api/user/admin/users`, `/api/user/keys`, `/api/logs/login`

Privileged runtime routes go through `authorizeLocalRuntimeCapability`, which
requires a local profile, a loopback request, and — in desktop mode — a
per-launch capability token.

---

## 7. Persistence

| Data | Where | Durability |
|---|---|---|
| Designs, templates, generated assets | `public/assets/*` | Filesystem |
| Queue jobs | `data/queue/jobs.json` | Filesystem, atomic |
| Agentic jobs / revisions | `data/ai-jobs/`, `data/ai-revisions/` | Filesystem, atomic |
| Vault catalog / vectors / watch roots | `data/vault/*` | Filesystem, atomic |
| Users, encrypted key vault | `data/users.json`, `data/user-key-vault.json` | Filesystem |
| Local assets | IndexedDB `image-express-local-assets` | Browser |
| Preferences, API keys, background jobs, vault UI state | localStorage | Browser |
| Optional backup | Google Drive (user OAuth) | Cloud |

All paths resolve through `src/lib/server/appPaths.ts`, overridable via
`IMAGE_EXPRESS_DATA_DIR` / `_ASSETS_DIR` / `_LOGS_DIR` — which is how the
desktop build keeps user data outside the app bundle.

**Every store is JSON on disk**, which is right for a single-machine app and is
the main thing to revisit before multi-node deployment.

### The one exception in progress: the vault catalog

The catalog is the only store where JSON has hit a real ceiling. At whole-drive
scale it measured **153 MB**, and because a JSON document has to be written
whole, adding one asset rewrote all 153 MB — while any query parsed and
validated the entire set into heap.

`src/lib/server/vaultCatalogDb.ts` is the SQLite replacement: one row per asset
with its full record as JSON, and indexed columns for the filters the UI
actually issues (`type`, `watch_root`, `folder_path`, `modified_at`). Folder and
type navigation become queries instead of full-array scans.

It uses **`node:sqlite`**, not `better-sqlite3` — deliberately, because it ships
with Node and so there is no native module to rebuild on every Electron major.
That recurring cost is what matters for a desktop app. `node:sqlite` is still
flagged experimental, so `isSqliteAvailable()` exists and callers fall back to
the JSON store rather than leaving the vault unusable on a runtime without it.

`migrateCatalogFromJson` imports once and records a marker in a `meta` table; it
is idempotent and leaves the JSON file untouched, so a release can roll back.

`readVaultCatalog`/`writeVaultCatalog` keep their signatures, so callers are
unchanged. Because that interface hands over a *whole* catalog, the write path
diffs before it writes: `syncCatalogAssets` reads a projection of id, mtime and
size — never the record bodies, which would reintroduce the exact cost being
removed — and touches only rows that differ. A dedicated covering index makes
that scan index-only.

Set `IMAGE_EXPRESS_VAULT_STORE=json` to force the old path without shipping a
build, and any SQLite failure logs and falls back to JSON rather than leaving
the vault unusable.

Callers that already know what they changed should not go through that diff at
all. `upsertVaultAssets`, `deleteVaultAssets` and `readVaultAssetsByWatchRoot`
are the targeted path, and they are what the write-heavy jobs use:

| Job | Before | After |
|---|---|---|
| Enrich 24 assets in a 200k catalog | 342 ms | **0.5 ms** |
| Rescan one watch root (read) | 885 ms | **109 ms** |
| Add one asset | 478 ms, rewriting 158 MB | **1.4 ms** |
| Assets in one folder | full scan of 200k | **3.6 ms** |

`writeVaultCatalog` still exists and still pays its 313 ms diff scan — it is
the fallback shape for a caller holding a whole catalog, not the normal one.

**SQLite is not faster at everything, and one case is worse.** Materialising the
whole catalog costs one `JSON.parse` per row: **903 ms against 257 ms** for
parsing the single JSON document, 3.5× dearer. Row storage wins on writes and
scoped queries; it loses on "give me everything". Search calls
`readVaultCatalog` on every query, and the JSON path had an mtime-keyed cache
that made repeat reads free — so `vault-store` keeps an equivalent in-memory
snapshot cache for the SQLite path, invalidated by every write helper. Without
it the migration would have made search markedly worse rather than better.

The real fix is for search, the similar-asset lookup and the sync route to stop
asking for everything. Until they move onto scoped queries the cache is what
holds the line. See F-03 in [ROADMAP.md](ROADMAP.md).

---

## 8. Theme and ambience packs

Packs are **data, never code**: manifest JSON + CSS + PNG sprite sheets. The app
interprets a fixed vocabulary of declarative "scenes"; a pack can look like
anything but can never execute anything. Install-time validation covers
zip-slip, extension allow-lists, CSS `@import`/external-URL scanning, and SVG
script stripping. Spec: [THEME_PACKS_SPEC.md](THEME_PACKS_SPEC.md).

---

## 9. Quality gates

| Command | Enforces |
|---|---|
| `npm run verify` | The full gate: overrides, architecture, lint, types, tests, build, bundle |
| `npm run audit:architecture` | Module-boundary policy |
| `npm run audit:overrides` | Pinned security overrides not silently downgraded |
| `npm run audit:dependencies` | Production advisories minus documented waivers |
| `npm run audit:i18n` | Locale parity + untranslated-string scan |
| `npm run audit:terms` | Canonical terminology in UI strings |
| `npm run desktop:verify-package` | Package contents + 400 MB standalone budget |
| `npm run desktop:smoke-package` | Packaged app actually launches |

> **Install under Node ≥24.** Older npm does not honour the major-scoped
> `overrides` keys and silently downgrades pinned packages. See
> [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md).

---

## 10. Module ownership

Where things live, so changes land in the right place.

| Area | Path |
|---|---|
| App shell, routing, modals | `src/app/layout.tsx`, `src/app/page.tsx` |
| Editor runtime | `src/components/Editor/` |
| Properties subsystem | `src/components/properties/` |
| Asset Vault UI | `src/components/AssetVault/` |
| Vault domain logic | `src/features/asset-vault/domain/` |
| Vault contracts (zod) | `src/features/asset-vault/contracts/` |
| Job queue | `src/lib/server/jobQueue/` |
| Provider adapters | `src/lib/agentic-edit/providers/` |
| ComfyUI client | `src/lib/comfyui/` |
| Server-only helpers | `src/lib/server/` |
| i18n dictionaries | `src/lib/i18n/locales/` |
| Launchers, audits, installers | `scripts/` |
| Desktop shell | `electron/` |

Rules that are enforced, not conventions: server-only code stays under
`src/lib/server/`; features own their contracts; API routes stay thin and
delegate to `src/lib` (`npm run audit:architecture`).

### Desktop diagnostics

The shell writes newline-delimited JSON to `logs/desktop.jsonl` (rotated at
2 MB, 3 files) covering startup phases, update state, and the packaged server's
stdout/stderr. This is the file users are asked to attach to a support ticket,
which makes it the one log with a real privacy obligation — the packaged
server's stderr can echo an environment variable or an `Authorization` header
verbatim.

`electron/logRedaction.js` is the **single** redaction path for that file:

- `safeLogText` — for raw text fields: truncate to 8 KB, then strip credentials.
- `createDiagnosticRedactor(getRoots)` — for structured entries: masks home and
  install paths, blanks values under sensitive keys, redacts credential
  patterns in the rest, and caps depth, array length, and string length so one
  runaway value cannot dominate an entry.

Redaction is pattern-based as well as key-based because server output is
unstructured — a leaked key appears in prose, not just as `KEY=value`. The
module takes the paths to mask as an injected thunk rather than importing
Electron's `app`, which is what makes it unit-testable without booting Electron.

---

## 11. Change control

When you change runtime behaviour, update this file in the same PR. When you
ship something, mirror it into [CHANGELOG.md](CHANGELOG.md) and adjust
[ROADMAP.md](ROADMAP.md). Keep the API list in §6 in step with
`src/app/api/**/route.ts` — it was 40 entries out of date before this document
was consolidated.
