# The "Q" — Unified Job Queue & Pipeline Rail

Status: implemented (2026-08-07). This document describes the architecture, the reasoning behind it, and how to extend it.

## Why

The app previously had **no queue**. Two disconnected job systems existed:

1. **Generate jobs** (`src/lib/agentic-edit/jobs.ts`): `POST /api/generate` fired `void processGenerateJob(id)` inside the request handler — no concurrency cap (N clicks = N concurrent provider calls), no crash recovery (a restart left jobs saying `running` forever, because provider params lived in a module-level `Map` wiped by HMR/restart), and the result was **deleted on first read**.
2. **3D/Stability jobs** (`useBackgroundJobPolling.ts`): polled from the **browser**, so closing the tab abandoned the job; visible only in the Editor's footer; and nothing ever notified the user of completion.

## The model (Adobe's approach, single-machine form)

The design mirrors Adobe Firefly Services' async job contract:

| Adobe principle | Our implementation |
|---|---|
| Accept instantly (`202` + job id), never work in the request handler | `POST /api/generate` only writes the job record and calls `queue.enqueue()` |
| Small flat status enum | `queued → running → succeeded \| failed \| cancelled` |
| Status is ephemeral, results are durable | Result URL is a stable asset path; `GET /api/jobs/:id/result` is now **non-destructive** |
| Events over polling ("performant, ideal for bulk") | One SSE stream (`/api/queue/stream`) pushes every transition; snapshot on (re)connect |
| Rate/concurrency limits are a contract | Lane-based caps (below); provider `429`/backoff stays in the provider clients |
| Visible queue UI (Media Encoder) | The Pipeline Rail, global, preference-controlled |

## Architecture

```
Request → API → Queue → Worker → AI → Validate → Store → Notify → Retrieve
  UI      202   SQLite-  lanes   ext/  size+     asset   SSE +    durable
         accept  style    +caps  local  decode   file    toast    URL
                durable
                JSON
```

### Server (`src/lib/server/jobQueue/`)

- **`types.ts`** — `QueueJobRecord`, the 9 pipeline stages (`QUEUE_STAGES`), status enum, lanes.
- **`store.ts`** — durable persistence: one JSON document at `data/queue/jobs.json`, written atomically (temp file + rename, same idiom as `vault-store.ts`), writes serialized on a promise chain. Terminal jobs are pruned after 24 h.
- **`scheduler.ts`** — the queue itself:
  - **Singleton on `globalThis`** so Next.js dev HMR cannot orphan in-flight jobs (the exact bug that plagued `runtimeProviderParams`).
  - **Lane concurrency**: `local-gpu` = 1 (one GPU, serialize or die), `local-cpu` = 4, each `remote:<provider>` = 3. A slow provider cannot starve another lane.
  - **Priority + FIFO** ordering inside a lane.
  - **Leases + crash recovery**: running jobs hold a lease renewed by every progress update. On boot, any persisted `running` job belonged to a dead process and is failed as `interrupted` — zombie jobs are structurally impossible.
  - **Retries**: `maxAttempts` with requeue on handler failure.
  - **Events**: every mutation is pushed to subscribers.
- **`handlers/generate.ts`** — wraps `processGenerateJob`, mirrors its progress file into queue stages, and adds the **validation stage**: output file must exist and be non-empty or the job fails as `validation`.
- **`index.ts`** — entry point; registers handlers and maps providers to lanes (`flux` → `local-gpu` because it is ComfyUI-backed; `nanobanana` → `remote:nanobanana`; `mock` → `local-cpu`). **Routes must import from here**, never from `scheduler.ts` directly.

### API

- `GET /api/queue` — snapshot (polling fallback / debugging).
- `GET /api/queue/stream` — SSE: `snapshot` event on connect, `job` events per transition, comment heartbeat every 15 s. EventSource reconnects natively; the reconnect snapshot makes missed transitions impossible.
- `POST /api/generate` — unchanged contract (`202` + `job_id`), now enqueues instead of executing.
- `GET /api/jobs/:id/result` — non-destructive; transient uploads are still cleaned, the record and result survive.

### Client

- **`src/hooks/useQueueStream.ts`** — the SSE subscription. Callback-based (`onSnapshot`/`onJob`) so consumers update state inside external-event callbacks (required by the strict `react-hooks` lint).
- **`src/components/PipelineRail.tsx`** — mounted globally in `layout.tsx`. A 3px strip fixed just below the top toolbar (`top-16`), one segment per pipeline stage:
  - active stages pulse, passed stages hold the accent at 45%, pending stages are muted;
  - hover (or `detailed` mode while active) drops down a thin card: job label, **External API vs Local** chip, current stage, progress %/elapsed;
  - merges **both** job systems: server queue via SSE + the editor's provider jobs via their localStorage store (`BACKGROUND_JOBS_CHANGED_EVENT` same-tab, `storage` cross-tab);
  - fires success/failure **toasts** on observed terminal transitions (jobs already terminal at page load stay silent);
  - honors `prefers-reduced-motion`; pure CSS animation, no animation library (bundle budget).

### Preferences (Settings → Workspace → Interface Behavior)

- `pipelineRailMode`: `off` | `minimal` (default; expand on hover) | `detailed` (open while active)
- `notifyOnJobComplete`: toasts on/off (default on)

Stored in `ui-preferences.ts` (localStorage), live-updating via `UI_PREFERENCES_CHANGED_EVENT`. i18n keys (`queue.*`, `settings.workspace.pipelineRail*`) exist in en/ru/uk.

## Technology choices

- **No Redis/BullMQ/DB**: this is a single-process Next.js standalone server wrapped in Electron. A server-fleet queue is the wrong tool; an in-process scheduler with a durable JSON journal is exactly right at this scale and matches existing storage idioms.
- **SSE over WebSocket**: unidirectional need, native reconnection, works in the Node runtime with a plain `ReadableStream`.
- **JSON over `node:sqlite`**: `node:sqlite` is still experimental and its availability inside Electron's bundled Node was unverified; the store is a small class behind a stable interface — swapping it for SQLite later touches one file.

## Extending

To queue a new kind of work:
1. Write a handler `(ctx: QueueHandlerContext) => Promise<{resultUrl?} | void>` in `handlers/`; call `ctx.update({stage, progress, message})` as it advances.
2. Register it in `index.ts` (`scheduler.registerHandler('my-kind', handler)`).
3. Enqueue with `getQueue().enqueue({ kind: 'my-kind', lane, external, label, payload })`.

The rail, SSE, persistence, recovery, retries, and notifications come for free.

## Tests

- `src/lib/server/jobQueue/__tests__/scheduler.test.ts` — 13 tests: success path + persistence, GPU-lane serialization, remote-lane cap without cross-lane starvation, failure capture, in-run retry via `maxAttempts`, **zombie recovery**, event emission, cancellation, priority/FIFO ordering, explicit retry of failed and cancelled jobs, refusal to retry a succeeded job, **cooperative stop of a running job** (and that a handler which never checks the flag still succeeds).
- `src/components/__tests__/PipelineRail.test.tsx` — 8 tests: hidden when idle, preference off, stage segments render, toast on observed completion, silence for already-terminal jobs, cancel button POSTs the cancel endpoint, retry button POSTs retry and the failure reason renders, rejected actions raise a destructive toast.

Note the test suite sets `IMAGE_EXPRESS_DATA_DIR` to a temp dir per test and flushes every scheduler before teardown — without both, an async queue write can land in the project's real `data/` directory after the env var is restored.

## Job control (cancel / retry)

- `POST /api/queue/[id]/cancel` — a **queued** job is cancelled outright; a
  **running** job is asked to stop *cooperatively*. The handler owns its
  provider calls and open handles, so it checks `ctx.stopRequested()` at its own
  safe points (long passes check between batches), reports `Stopping…`
  immediately so the UI does not look ignored, and exits cleanly. Only terminal
  jobs return `409 job_not_cancellable`.

  A job finishes as `cancelled` **only when the handler acknowledged the stop** —
  it asked, was told yes, and returned early. A handler that never checks (a
  generation mid-provider-call) completes in full and is recorded as
  `succeeded`: reporting finished work as cancelled would hide a real result,
  which is the opposite lie to the one this prevents.
- `POST /api/queue/[id]/retry` — failed or cancelled jobs only; resets
  `attempts` to zero for a full fresh budget. `409 job_not_retryable` otherwise.
- The rail exposes both inline: a **Cancel** button on queued jobs and a
  **Retry** button on failed ones. Failed jobs linger 60 s on the rail (vs 6 s
  for successes) so the retry stays reachable.

Two things make retry actually work:
1. **Failed jobs keep their uploads.** `processGenerateJob` used to delete them
   in its failure path, which would have made every retry fail on a missing
   input file. Age-based retention still reaps them.
2. **In-memory provider params survive a failure.** Params on disk are
   redacted (`redactSensitiveParameters`), so an in-process retry reuses the
   original unredacted credentials from `runtimeProviderParams`. After a
   process restart those are gone and a retry of a credentialed provider will
   fail — by design, since persisting secrets is the thing redaction prevents.

## Dev-mode note

The scheduler is pinned to `globalThis` so HMR cannot orphan in-flight jobs.
The flip side: **editing `scheduler.ts` does not replace the already-constructed
instance** — restart the dev server after changing the class shape, or calls to
newly-added methods will fail against the stale singleton.

## Known follow-ups

- Retire the browser poller entirely. Meshy/Tripo/Hitems/Stability polling is
  handed to the server (`serverPollHandoff.ts` → the `remote-poll` handler), so a
  closed tab no longer abandons a paid-for generation — but the handoff is
  best-effort and only applies to signed-in accounts, because keys are vaulted
  per account and Guest has none. The browser poller remains the fallback.
- OS-level notifications when the window is unfocused (Electron `Notification`).
- An Activity panel (full queue history with reorder, Media Encoder-style). The existing `BackgroundJobsPanel` covers the legacy localStorage jobs inside the Editor and should be promoted to a global panel backed by the queue.
