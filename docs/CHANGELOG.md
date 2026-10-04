# Changelog — Delivery History

Last updated: 2026-10-04
Repository: https://github.com/GeekatplayStudio/Image-Express.git  
Branch: main  
App version: 0.2.2

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

## 2026-10-04 - Dependency advisories from the host's scan

Fourteen findings across five packages, one of them critical (remote code
execution in Next's `next/og` ImageResponse). All fixed by upgrading; none
waived.

- `next` and `eslint-config-next` 16.3.5 → **16.3.8**.
- `brace-expansion` 1.1.18 → **1.1.21**, 2.1.4 → **2.1.7**, 5.0.9 → **5.0.12**.
- `fast-uri` 3.1.7 → **3.1.8**, `ip-address` 10.7.0 → **10.7.3** (new override),
  `dompurify` 3.4.15 → **3.4.16**.
- The production audit reports 0 vulnerabilities, and the one audit waiver the
  repo carried (brace-expansion) is retired because it is no longer needed.
- `audit:overrides` in `npm run verify` fails the build if the lockfile ever
  resolves below these floors again.

Left as is, with reasons in [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md):
`braces` 3.0.3 in lint-only tooling (no patched release exists), and the
separate `mobile-companion/` prototype, whose own audit needs an Expo major
upgrade.

## 2026-10-04 - Saved channels are stored with the page (R-05)

Channels lived on the canvas object and were gone when the page was closed.
They are now written into the page on save and restored on open, and each page
of a multi-page document keeps its own.

- **Size.** A hard-edged selection is stored run-length encoded (a full-HD
  mask is a few hundred numbers). A soft mask — a brightness channel — has no
  long runs, and as runs would be two numbers of text per pixel, so it is
  stored as base64 bytes instead. The smaller form is chosen per channel.
- **Undo does not touch them.** History snapshots carry no channels; only
  opening a page replaces the stack (`pageChannels.loadPageJson`).
- **A file is not trusted.** Each stored channel is checked — dimensions, a
  64-megapixel ceiling, run data that must decode to exactly width × height —
  and dropped if it does not hold together.
- The `savedChannels` key is removed before the JSON reaches fabric, which
  would otherwise copy it onto the canvas object.

Not exercised in the running app in this pass; covered by tests. Loading a
template does not yet clear the previous page's channels.

## 2026-10-04 - ComfyUI workflows convert like the frontend; the 3D editor works offline

The second half of the port from the sibling projects.

**Saved workflows are converted the way ComfyUI's own frontend queues them.**
The converter knew the widget order of about 27 core nodes from a hard-coded
table and had no notion of a subgraph. Any other node lost its widget values,
and a workflow with subgraphs came out with node classes that were subgraph
ids, which the server rejects as unknown nodes. That included this app's own
bundled FLUX 2 Klein edit templates.

- `uiWorkflowConverter.ts` is a TypeScript port of the Photoshop bridge's
  converter. It reads the server's `/object_info` and handles subgraphs
  (nested, with id renumbering), promoted widgets, reroutes, Set/Get nodes,
  primitives, muted and bypassed nodes, dynamic combos, seed-control slots and
  dynamic prompts.
- It is checked against **eleven golden fixtures**: template workflows next to
  exactly what frontend 1.53.10 queues for each. All eleven match.
- The runner now asks the server for its node definitions *before* preparing a
  workflow. Without them (server not reachable for definitions) the old
  table-driven conversion is still used.
- A node the workflow depends on that is not installed is named — "Node "My
  Loader" (X) is not installed on this ComfyUI server" — and a missing node
  nothing depends on is skipped instead of failing the run.

**The prompt and the image go where the graph says.** The bundled FLUX
templates declared no input bindings at all, so a typed prompt never reached
them. For user-added workflows the prompt was written into every text-like
node whose title did not contain "negative", and the uploaded image into any
node with "image" in its class — which could replace a link with a filename.

- `workflowTargets.ts` traces the text that feeds a sampler's (or guider's)
  positive input, keeping positive and negative apart through nodes that pass
  both, and gives the image only to a Load Image node that something reads.
- A workflow's declared bindings still win; detection fills in only the
  sources it does not cover. Steps, CFG and denoise are never auto-bound: a
  template's sampler settings are tuned to its model.
- An uploaded file never overwrites a link.

**User-added workflows keep their saved graph** and are converted at run time
against the server, and the models their author listed on the nodes
(`properties.models`) are now read for them too — so a missing model is named
with its download link before the run fails on it (the open R-12 item).

**A job that vanishes is noticed.** Waiting on history alone could not tell
"still working" from "no longer there": a prompt deleted from the queue, or
lost when ComfyUI restarted, waited out a 30-minute timeout. The wait now also
reads the queue: it reports "Waiting in the ComfyUI queue (2 of 5)" or
"running", and after three polls with the prompt in neither queue nor history
it says so and stops.

**The 3D editor no longer needs the network.** It fetched the Draco decoder
from www.gstatic.com and its lighting environments from a GitHub CDN at run
time.

- The decoders are served from `public/three/` (copied from the installed
  three.js by `scripts/sync-three-assets.mjs`; a test fails when they drift)
  and the ten environments from `public/three/hdri/` (CC0, 1.6 MB).
- One loader for every path. Thumbnails and the in-panel bake used a bare
  `GLTFLoader`, so a Draco- or meshopt-compressed GLB opened in the editor but
  failed there.
- Re-editing a 3D layer at a new resolution keeps its size on the page; copying
  the old scale made a 2048 → 4096 re-render twice as large.

**Test start-up.** Jest walked the whole project on start, including
`data/vault/thumbs` — 160,000 files on a machine with an indexed drive — and
sat for minutes before the first test. It is now limited to `src` and
`__tests__`.

**Not done / known limits.**

- **None of the ComfyUI changes were run against a live ComfyUI server** (none
  was running). The converter is verified against frontend output and the
  bundled templates against synthesised node definitions; cancel, queue watch
  and error formatting against mocked responses.
- Workflow settings detected from the workflow (model, sampler and LoRA
  dropdowns filled from the server — the open R-14 item for FLUX and Qwen) are
  not built. The converter already reports the inputs an author exposed; the
  panel that would show them does not exist yet.
- Multiple output images, ComfyUI's own template catalog, freeing memory when
  the model set changes, and built-in depth / SeedVR2 upscale workflows were
  identified in the review and not ported.
- 3D: the offline assets and shared loader were not checked on screen in this
  pass. Importing FBX/OBJ/STL by converting to GLB, the fuller pose and camera
  state, and a real-GPU end-to-end test were identified and not ported.

## 2026-10-04 - Ported from our other projects: a vault that survives an unplugged drive, SQL search, real ComfyUI cancel

A side-by-side review of four sibling projects (ComfyUIAssetManager, the
Photoshop 3D plugin, the ComfyUI Photoshop bridge) against this one. What they
do more reliably was ported; what this app already does better was left alone.
This entry covers the fixes and the vault; the workflow converter and 3D work
have their own entries.

**A rescan could delete a whole folder's index.** The folder walk swallowed a
failed read and returned an empty list, and the rescan then deleted everything
it "no longer found" — so rescanning an unplugged drive, an offline share or a
folder whose permissions had changed removed every entry for it, captions and
tags included, and marked the root *ready*. A scan cut off at the file ceiling
deleted the entries past the cut the same way.

- A root that cannot be read now **fails the scan** and changes nothing.
- A scan that was truncated, stopped, or met unreadable subfolders prunes only
  what it actually looked for (`vaultScanPrune.ts`).
- A file that is gone is **marked missing and kept for 30 days**
  (`missing_since`), then purged together with its embedding. Putting a folder
  back restores its captions and tags.

**The app was not using SQLite at all in development.** The bundler rewrote
`require('node:sqlite')` and it failed at runtime ("Unsupported external type
Url for commonjs reference"). The stores catch a failed load and fall back to
JSON, so this was silent: every test exercised SQLite while `next dev` ran on
the 150 MB JSON catalog. It is now loaded through `process.getBuiltinModule`
(`nodeSqlite.ts`), and a failure to load is logged. Found only because the new
search was checked against the real catalog and returned the old answers.

**Search and browsing are SQL now (closes the F-03 follow-up).** Filter, sort,
page and count run over indexed columns; keyword search is an FTS5 query with
sanitised prefix terms; smart search fuses FTS hits with vector neighbours and
loads only the ranked ids. Measured on the real 239,769-asset catalog:

| | Before | After |
|---|---|---|
| Open the vault (browse) | ~5 s cold, an arbitrary 200, `total: 200` | 17 ms, newest first, `total: 239,769` |
| Keyword `logo` | 149 ms | 13 ms |
| Paging | none | `offset` + **Load more** in the footer |

**Incremental rescans.** A file whose size and modified time match what is
stored is skipped; only new and changed files are written, and a file's
first-seen date is no longer overwritten on every scan.

**Scans are queue jobs.** A scan reports "Found N files in M folders…" in the
Activity panel, can be stopped there (what it found is kept, nothing is
removed), and no longer holds a web request open for the length of a
whole-drive walk.

**Prompts are read from the images themselves.** New and changed files get
their real MIME type, and a PNG its dimensions and whatever ComfyUI or
AUTOMATIC1111 wrote into it — prompt, negative prompt, model, sampler, seed,
steps, CFG — so an AI image is searchable by its own prompt with no captioning
model. Files indexed earlier are caught up in the background by metadata
version.

**Schema migrations.** Both vault databases moved from `CREATE … IF NOT EXISTS`
on every open to versioned migrations keyed on `PRAGMA user_version`, each in
its own transaction; a file from a newer build is refused instead of being
opened and damaged. `busy_timeout` is set, and the WAL is checkpointed after
each scan.

**Thumbnail cache.** Two-level folder fan-out instead of one directory with
hundreds of thousands of files (old renditions are still served from where they
are); write-then-rename so a crash cannot leave a truncated file that is then
served as cached; one render per rendition however many requests arrive at
once; a size ceiling (4 GB by default, `IMAGE_EXPRESS_VAULT_THUMB_CACHE_MB`)
trimmed oldest-first after a finished sweep; and an ETag, so an edited file no
longer shows its old tile for a day.

**ComfyUI (from the Photoshop bridge).**

- **Cancel stops the server.** It used to stop watching and leave the GPU
  working. It now interrupts the prompt if it is running and removes it from
  the queue if it is waiting. The queue is read first, because older ComfyUI
  builds ignore the prompt id in an interrupt and would stop someone else's job.
- **Uploads are named by content.** Every upload used to be
  `image-express-input.png` with overwrite on, so a second job queued before
  the first ran replaced the first job's input.
- **A refused prompt names the node and the input**, instead of the first 280
  characters of raw JSON, and an oversized upload says which ComfyUI flag
  raises the limit.

**3D capture (from the Photoshop 3D plugin).** The layer editor never set the
pixel ratio, so asking for 2048 px on a 2x display produced 4096 px, and a
failed capture left the renderer at the wrong size. Both the layer editor and
the generator now capture through one function that renders at pixel ratio 1
to the canvas — so tone mapping, sRGB and anti-aliasing match the preview,
which a render target skipped — and restores everything in a `finally`. Export
size inputs are clamped to 64–8192.

**Not done / known limits.**

- The folder tree is still built from the loaded page of assets; the grouped
  query for a full tree exists (`listCatalogFolders`) but is not wired to the UI.
- Metadata is read from PNG only; JPEG/WebP dimensions and video duration are
  not read yet.
- The thumbnail and embedding jobs still load the whole catalog to find work.
- The first open after this update runs the schema migration over the existing
  catalog synchronously (a few seconds at 240k assets).
- ComfyUI cancel, upload naming and error formatting are covered by tests, not
  yet exercised against a live ComfyUI server. The 3D capture change is covered
  by tests with a mocked renderer, not checked on screen.

## 2026-10-03 - Activity panel, structured critique, generation profiles, saved channels, Comfy versions and custom models

Six roadmap items in one pass. Each has tests; three were also run against the
real thing (a live queue job, a local vision model, a local text model).

**Activity panel and background notifications (R-06).** The pipeline rail shows
what is in flight and forgets a job seconds after it ends. *Window → Activity*
is the durable view: every job the queue knows about, running first, then the
queue in the order it will actually run, then history newest first — with the
failure reason, cancel, retry, **Run next** (moves a waiting job to the front of
its lane) and **Clear finished**. When a job ends while the window is hidden or
unfocused, the result is announced through the operating system; a toast would
not be seen. Permission is requested from the settings checkbox, never from a
job finishing.

- New queue operations: `prioritize` (`POST /api/queue/[id]/prioritize`) and
  `clearFinished` (`DELETE /api/queue`), both refused cross-site.
- Checked live: a real vault-thumbnail job appeared, was cancelled from the
  panel, and moved to history with Retry offered.

**Structured AI critique (R-03).** Five review profiles — General, Composition,
Typography, Brand consistency, Conversion readiness — each with its own named
criteria. The report has an overall score, per-criterion scores, issues ranked
by severity and recommended edits, each with a button that goes to where the
edit is made. The structure is enforced in `critiqueReport.ts`, not trusted to
the model: criteria always come from the profile in the profile's order, scores
are clamped, and there is always at least one action.

- **Found by testing against a real model:** with Ollama's `format: "json"`, a
  thinking model (`qwen3-vl`) writes its JSON into the `thinking` field and
  returns an empty `response`. The first version of this change did exactly
  that and produced "empty critique" for every request. The JSON is now asked
  for in the prompt, which works for thinking and non-thinking models, and the
  `thinking` field is used only if it actually holds the JSON object.
- Verified live: two runs with the same profile returned the same structure.

**Local generation profiles (R-04).** Fast, Balanced and Quality change both
the drawing brief and the token budget together — a detailed brief on a small
budget is cut off mid-SVG. Measured on `gemma3:12b` with the same prompt:
Fast gave 12 flat shapes in 12 s; Quality gave 22 shapes with 3 gradients in
20 s; both complete documents. The settings panel states that local generation
is flat vector illustration, not photography, before a run rather than after.
`npm run qa:ollama` now generates with two profiles and asserts the richer one
is richer, and asserts the critique returns a report for the requested profile.

**Saved channels (R-05).** Save the current selection under a name, or build a
channel from a layer's alpha or luma, and load it back as the selection —
replace, add, subtract or intersect. Channels can be renamed, reordered and
deleted. Loading writes into the existing document selection mask, so every
selection-aware tool works with it unchanged. **Not saved with the page yet:**
channels last for the editing session. The run-length encoding that would make
storing them practical is written and tested (a full-HD mask shrinks more than
500-fold), but not wired into save and load.

**ComfyUI repository versions (R-12).** Each node and workflow repository in the
manager now shows its installed commit, branch and date, and *Check for updates*
reports how many commits each is behind. An ordinary scan stays offline; only
the explicit check contacts the remote. Tested against real temporary git
repositories.

**Custom ComfyUI models (R-14).** Register a checkpoint file from your ComfyUI
checkpoints folder and it joins the model picker for every workflow that loads
a single checkpoint; the choice persists like any other. Guardrails: it is not
offered for FLUX or Qwen graphs, which load a UNet rather than a checkpoint; the
entry must be a bare file name with a model extension; and once the connection
is verified, a file the server does not list is refused with where to put it.

All new interface text is translated into all eleven languages, which the
translation ratchet requires.

## 2026-10-03 - The key vault only answers its owner (R-01)

**`GET /api/user/keys?userId=<name>` returned that account's decrypted provider
keys to anyone who asked.** The route trusted the name in the request and
checked nothing else; a POST overwrote the vault the same way. The keys were
encrypted at rest and handed out in clear text on request.

On a local install the caller had to already be on the machine, and a web page
could not read the reply. On a self-hosted install it was open to the network.

- Both methods now require a valid session token, and the name in the request
  must be one of that account's own identifiers (id, email or username). No
  session is 401; someone else's vault is 403.
- A save is also refused when driven by another site, and the read is marked
  `no-store`.
- `POST /api/queue/poll` had the same shape of problem: it took an `owner` name
  and ran the job with that account's vaulted key, spending their credits. It
  now requires the owner's session too.
- The Settings dialog and the polling handoff send the session token. An older
  sign-in without one gets a 401: key sync shows as local-only and polling
  falls back to the browser, exactly as it does for guests. Signing in again
  restores both.

11 tests cover the refusals and the owner path.

## 2026-10-03 - Installer trust policy (R-13)

The one-click installers clone repositories and download model files from
addresses in `scripts/installers/config/sources.json` and from workflow catalogs
the user has added. Those addresses went straight to `git clone` and `fetch`,
and a model was written wherever its `targetPath` pointed.

`scripts/installers/trust-policy.mjs` now sits in front of all of it:

- **Where from.** https only, no embedded credentials, host on an allowlist
  (`github.com`, `huggingface.co`, plus any `trustedHosts` in the config). That
  also closes git's own escape hatches — a "URL" starting with `-` is read as an
  option, and `ext::` transports run commands. Branch names are validated and
  the clone uses `--` to end option parsing.
- **What exactly.** A repository may carry a `commit` and a model a `sha256`. A
  pin that is present is enforced: the checkout is moved to the commit and
  confirmed, and a model that fails its checksum is deleted before it is ever
  renamed into place.
- **Where to.** A bundle or model target may not resolve outside the ComfyUI
  directory.

A model refused by the policy is skipped with a reason, not fatal to the rest.
The two installers' duplicated git logic is now one `syncGitRepository`.

**No source is pinned yet.** Pins are opt-in because upstream moves and a stale
pin installs an old build; adding real commit ids and checksums is a release
decision. The mechanism is in place and tested (11 tests, run in CI with the
packaging suite), and `describeUnpinnedSources` lists what is still floating.

## 2026-10-03 - Vault status, sync and "find similar" stop loading the whole library

Three callers materialised every catalog record — about 200k at the scale the
vault targets — to answer a question about a handful of them.

- **Status and sync** read `.length` and a timestamp. Both now use
  `readVaultCatalogSummary`: a `COUNT` and one meta row. Status is polled, so
  this was being paid repeatedly.
- **Find similar** needed the seed asset and its few neighbours. It now fetches
  them by id (`readVaultAssetsByIds`) and loads the catalog only for the
  metadata tier, which compares the seed against everything by design.
- If a search has already built the in-memory snapshot the scoped reads use it;
  they never build it themselves. A test asserts that.
- Both helpers have a JSON-store implementation with the same results, tested
  against the same cases.

Search itself still loads the catalog. Moving its keyword ranking into the
database needs a full-text index, which is a design change, not a caller swap.

Also: the dangling `Imageprocessingui` submodule entry is gone. It was a gitlink
with no `.gitmodules` record, so a fresh clone produced an empty folder and
`git submodule` commands failed. The reference repo has not been a dependency
since the parity pass finished.

## 2026-10-03 - Exported HTML pages could not run; PropertiesPanel split continues

**Export → HTML produced a page whose viewer script never ran.** The script is a
string shipped inside the export and executed by a browser with no build step,
so nothing type-checked or linted it. It contained two TypeScript casts — a
syntax error in a browser, which stops the whole script — and called
`canvas.setBackgroundColor` and `canvas.sendToBack`, both removed from fabric
two major versions ago, plus the same `loadFromJSON` completion-callback
mistake fixed in the editor. The exported page showed an empty canvas.

- The script is now plain JavaScript on the fabric 7 API, and loads through the
  promise.
- `editorHtmlExportTemplates.test.ts` parses the script and runs it against a
  fabric double that only has the fabric 7 surface. 7 of its 8 tests fail
  against the previous script.

**`PropertiesPanel.tsx` 3,491 → 3,273.** Two more self-contained blocks left the
component, both previously untestable without mounting the whole panel:

- Navigator geometry → `properties/navigatorGeometry.ts` (17 tests): page
  bounds, layer outlines clipped to the page, and the visible-area frame.
- Layer stacking order → `properties/layerOrder.ts` (12 tests): which moves a
  layer may make, and making one, without ever going beneath the page.

## 2026-10-03 - Saved pages, the text tool, bend, skew and popup layering

Reported as "the text tool is broken, toolbars sit on top of popups, canvases
misbehave". Five separate causes, each reproduced in the running editor before
it was changed.

**Saved pages opened at the wrong size, and every new layer was invisible.**
Fabric 7 changed `canvas.loadFromJSON(json, callback)`: the second argument is
now a per-object *reviver*, called before the canvas is refilled and never
called for a page with no layers. Five call sites still treated it as "run this
when loading finishes". On top of that, a load copies every top-level JSON key
onto the canvas, so the saved `artboard: { width, height }` replaced the live
record and dropped its `left`/`top`.

- A page saved at 1920x1080 opened as 1080x1080.
- Anything positioned against the page computed `NaN`. Clicking the Text tool
  created a layer with no position: nothing appeared, nothing was selected.
- Undo and redo went through the same call, so the "restoring" flag was cleared
  early and each restored object was recorded as a new history entry.

All five sites now go through one helper, `loadCanvasJson`, which awaits the
load, restores the page rect, applies the saved size through it, and refits the
view only when the size actually changed (so undo keeps your pan and zoom).

**A new text layer lost its selection the instant it was created.** Leaving the
pen tool tore down the pen draft and unconditionally discarded the active
object — on every tool change. Text was added, then immediately deselected, so
its properties never appeared. It now discards only a selection that belongs to
a draft.

**Undo threw a new layer into the top-left corner.** History snapshots on add,
and layers were centred only afterwards. They are now placed first.

**Bent text garbled when the wording, font or size changed.** The arc was
computed once, when the bend slider moved, and never again. Enlarging bent text
piled the letters onto an arc sized for the old text. The geometry moved to
`src/lib/textCurve.ts` and is rebuilt inside fabric's own layout pass, so every
route that changes text — the panel, the options bar, the quick bar, typing in
place, undo, loading — refits it.

**Skew left the handles behind, and "Fake 3D depth" undid a resize.** The skew
sliders never refreshed the layer's coordinates. The taper was applied against
a copy of the layer's scale stored when the slider first moved, so resizing by
the handles and then touching the slider snapped the layer back. The taper is
now a pure function (`src/lib/taperTransform.ts`): old contribution off, new
one on, nothing stored. The Skew sliders show the layer's own skew rather than
skew-plus-taper.

**Toolbars drew over popup windows.** Windows used ad-hoc z-index values from
50 upward while the header sat at 90, floating panels at 100 and tool flyouts
at 2000. Every popup now sits in a modal tier at 1000+, with prompts, confirm
dialogs and toasts above that, and tool flyouts back in the workspace tier. The
scale is written down in `src/lib/zLayers.ts` and a test fails if a full-screen
overlay is added below the modal tier.

**The dev server rendered the whole app unstyled.** Turbopack evaluates a copy
of `postcss.config.mjs` from inside `.next`, so resolving `src` against the
config's own location pointed Tailwind at a folder that does not exist and
every utility class was dropped. The config now finds the project root by
walking up. Production builds were unaffected, which is how it went unnoticed.

Also in this pass: `PropertiesPanel.tsx` **3,860 → 3,491**. The adjustment-layer
engine (which layers each adjustment reaches, clipping, stacking order) became
`src/components/properties/applyAdjustmentLayers.ts` with 11 tests; it had none.
52 tests added in total.

## 2026-10-03 - Pen-tool and 3D-capture logic moved out of oversized components (F-06)

No behaviour change. Two of the five largest files gave up the logic sitting
above their component, which made it testable for the first time.

- `Toolbar.tsx` 2,567 → 2,355. The pen tool's fabric code (draft lines,
  coordinate mapping, bezier anchor and handle controls) is now
  `src/lib/pen-fabric.ts`, with 14 tests.
- `ThreeDGenerator.tsx` 2,197 → 2,112. Offscreen scene capture is now
  `src/lib/three/sceneCapture.ts`; API-key sanitising is
  `src/lib/providerCredentials.ts`, which also replaces a duplicate copy in the
  settings code. 17 tests.

## 2026-10-03 - Rate limiting on auth and URL-fetching routes (closes F-10)

Nothing in the app limited how often a route could be called. Sign-in could be
guessed against without bound, and six routes would fetch a caller-supplied URL
as fast as they were asked.

- New `src/lib/server/rateLimit.ts`: sliding-window counters in process memory,
  capped at 10,000 keys so the limiter cannot itself be used to exhaust memory.
  A refused request answers `429` with `Retry-After`.
- Wrong passwords (`login`, `change-password`) and wrong reset codes
  (`reset-password`) share one budget of 10 per 15 minutes **per account**. The
  account is the one key a caller cannot vary; a successful sign-in clears it.
  A locked account answers 429 before the password is checked, and unknown
  identifiers are counted the same way, so the response does not reveal which
  accounts exist.
- `register` and `request-reset`: 10 per 15 minutes per client. All auth
  routes: 30 per 5 minutes per client.
- `assets/save-url` and `assets/fetch-url`: 120 per minute. URL installs on
  `themes/install`, `ambience/install` and `comfy/library`: 10 per minute.
- Not limited: generation (bounded by queue lane concurrency) and file uploads
  to the installers.
- 16 tests: the window arithmetic, key eviction, and the route behaviour above.

## 2026-09-13 - Simpler Mac installation and current desktop runtime (0.2.2)

- Added **Install and Open** for downloaded Mac apps, with replacement confirmation,
  cancellation, and a drag-to-Applications fallback. DMGs include **Start Here.txt**.
- Replaced contradictory install guides with a short Mac walkthrough, Dock launch
  instructions, and current security-message help. Removed quarantine-clearing scripts
  and unsupported promises that unsigned downloads are safe.
- Updated Electron to 44.3.0 (macOS 13+), Next to 16.3.5, React to 19.3.0, packaging
  tools, and compatible locked dependencies. Larger unrelated major migrations remain separate.
- Native Apple Silicon and Intel jobs now exercise installation from a DMG, read-only
  app startup, relaunch, and data retention. Release jobs require signing credentials,
  notarization-ticket validation, and Gatekeeper assessment. Updater manifests retain
  both architectures. Publishing a signed release still requires configured credentials.

## 2026-09-12 - Vault add-to-canvas revoked its own URL; local browsing rescanned everything

Three reports, three unrelated causes.

**An asset added from the Asset Vault never appeared on the canvas.** The vault
handed `onSelect` a `blob:` URL taken from its own preview cache and then called
`onClose()`. Closing runs `clearPreviewState()`, which revokes every `blob:` URL
the grid owns — while fabric was still asynchronously decoding it. The image load
died mid-flight and the layer silently never arrived. The same hazard applied to
the 3D editor and the media preview, both of which dispatch a URL and immediately
close. Anything escaping the modal now gets a freshly minted URL the caller owns.

- Dropping a file onto the canvas also swallowed failures whole: a rejected
  upload fell straight through the success branch with no layer, no toast and no
  console entry, and a failed image decode had no `.catch()` at all. Both now
  report, including the server's own reason. Audio uploads, previously silent,
  say they landed in the library.

**Opening the Asset Vault rescanned the entire local store sixteen times.**
`loadAllLocalVaultRecords` looped four types x two categories x two scopes,
calling a lister that did a full `getAll()` each time — and the unified search
merges local records, so every search keystroke paid it again.

- One scan now, filtered in memory, behind a cache invalidated on write.
- Blob bytes moved out of the metadata records into their own IndexedDB store
  (schema v2, migrated in place; pre-split records still read through a
  fallback). Browsing reads metadata only; bytes are fetched for the one asset
  that needs them. The Asset Library also stopped minting an object URL for every
  local asset up front.
- Catalog warm-up moved to server start (`instrumentation.ts`): the first vault
  open after a restart used to pay for materialising the whole catalog snapshot
  and deriving a hash vector per asset. Both are memoised for the process, so
  doing it during boot means the user never waits for it. Fire-and-forget, and a
  broken catalog cannot stop the server coming up.

**Stamp letterforms were stair-stepped.** The relief thresholded artwork onto the
coarse extrusion grid and only then measured distances, with an approximate
chamfer sweep:

- Thresholding first discarded the sub-pixel edge position; nothing downstream
  could recover it. The signed distance field is now computed on the artwork
  raster and sampled onto the extrusion grid — a distance field is smooth and
  band-limited, so it is what downsamples cleanly.
- The chamfer sweep was replaced with the exact linear-time
  Felzenszwalb–Huttenlocher transform. The chamfer's level sets are octagons, so
  curves and diagonals carried a faint faceting.
- Anti-aliased coverage now refines the crossing to a fraction of a pixel inside
  the transition band.
- Cell size is derived from the draft run rather than fixed at 0.25 mm, because a
  wall spanning one row of vertices renders as a staircase however accurate the
  field is. Measured on a 40 mm disc at 8° draft, the mid-height isoline went
  from 4 sampled vertices around the whole circle to 104.
- Vertex colours are interpolated instead of bucketed into three flat tones,
  which was quantising letter edges to the grid in the preview independently of
  the geometry.

Tests: 222 suites / 1,773 passing. New coverage for preview-URL ownership, the
metadata/blob split and its cache, catalog warm-up, and wall resolution.

## 2026-09-12 - 3D Stamp Studio: inside-out solids, dead draft angle, square round dies

Every stamp the studio produced was geometrically inside out. The relief die
and all five lathe-turned handles were wound clockwise as seen from outside, so
their signed volume was negative: they rendered as hollow shells in the viewport
and exported STLs whose normals pointed into the solid. The existing manifold
suite could not see it — a consistently inverted mesh still has every edge shared
by exactly two triangles with opposite directions, so it passed all seven checks.
Only the primitive-built `t-bar` and `minimal-block` handles were correct, which
meant a single export could mix solids and voids.

- **Orientation fixed and now asserted.** Die faces, backplates, perimeter walls,
  lathe caps, sidewalls, and apex cones all wound counter-clockwise from outside.
  `stampMeshIntegrity.ts` computes signed volume, and every component test now
  requires it to be positive alongside the existing closure checks.
- **Draft angle was never applied.** `draftAngleDeg` was threaded from the slider
  through the builder into `createStampReliefGeometry` and then ignored; the
  sidewall profile was a fixed Hermite ramp between two hard-coded thresholds.
  The relief is now driven by a signed distance field, giving a wall run of
  exactly `reliefDepth * tan(draft)` — the surface a wall leaning back at that
  angle actually sweeps — and continuously sloped walls instead of a one-cell
  staircase. At 0° the ramp falls back to sub-cell width so edges stay
  anti-aliased.
- **Circular and oval dies were rectangular slabs.** Only the heightmap was
  masked to the shape, so a 30 mm round podium sat on a 30 × 30 mm square plate
  with 6 mm of rubber jutting out at each corner. Round and oval dies are now
  built on a polar grid with a true elliptical outline.
- **Podiums were larger than requested.** `ExtrudeGeometry` offsets the profile
  outwards by `bevelSize` and adds `bevelThickness` past each end, so a podium
  asked for 50 × 35 × 6 mm was modelled 53 × 38 × 7.5 mm and dipped 1.5 mm below
  the die mounting plane. The profile is now pre-shrunk and the solid occupies
  exactly `y = 0` to `y = thickness` within its stated footprint. Oval podiums
  also extruded as faceted 12-gons for want of a `curveSegments` value.
- **Metrics were fiction.** `isManifold` was hard-coded `true` and the viewport
  badge was static text. Total height was summed from the sliders, over-reporting
  a `finger-grip` stamp as 64.5 mm when the handle clamps itself to 12 mm and the
  real model is 21.5 mm. Both are now measured from the assembled mesh, and solid
  volume is reported as a material estimate.
- **Heightmap sampling aliased fine artwork.** A 512 px heightmap was point-sampled
  onto a 200-cell grid; it is now area-averaged when the source is finer, and grid
  density follows physical size at ~0.25 mm per cell.
- **Triangle budget roughly halved.** The flat backplate was tessellated at full
  die-face density; it is a plane, so it is now a centre fan. A 50 × 35 mm die
  dropped from ~160k to ~57k triangles, and the stamp test suite from 62 s to 9 s.
- **Arc text ignored glyph widths and letter spacing.** Characters advanced by a
  fixed 0.12 rad regardless of width, saturating into overlap on long strings,
  and `letterSpacing` was configured in presets but never applied. Each glyph now
  advances by its own measured width over the arc radius.
- **UI de-duplicated.** The build-plate and stamp-base toggles existed in four
  places (modal header, viewport overlay, and twice in the sidebar via a card
  rendered in both the Podium and Relief tabs); they now live only in the
  viewport overlay that owns them. Removed the unused `ReliefMode` type, the dead
  `dieDataUrl` prop and `baseplatePixels` counter, and mutation of prop-held
  meshes in a `useEffect`.
- **Text bend Arc Span had a dead spot at 180°.** The panel treated an explicit
  span of exactly 180 as "no span supplied" and recomputed it from bend strength,
  so the Arc Span slider silently jumped elsewhere at that one position.

Tests: 73 stamp tests (up from 58), including a new `stampReliefExtrusion` suite
covering draft-angle wall runs, contact-plateau flatness, heightmap sampling, and
triangle budgets. Full suite green at 220 suites / 1,759 tests.

## 2026-09-03 - Library updates, zero production vulnerabilities, mutation testing

- **Dependency Upgrades & Security Vulnerability Eradication:**
  - Upgraded Next.js to `16.3.4`, `@tiptap/*` suite (`react`, `starter-kit`, `extension-placeholder`) to `3.31.2`, Three.js to `0.185.1`, `@types/three` to `0.185.4`, `@react-three/drei` to `10.7.8`, Zod to `4.5.4`, React to `19.2.8`, PDF.js to `6.3.289`, and Jest to `30.5.1`.
  - Added security overrides in `package.json` for `fast-uri` (`^3.1.6`), `nanoid` (`^3.3.18`), and `qs` (`^6.16.0`), eliminating all active advisories and achieving **0 production vulnerabilities** in `npm run audit:dependencies`.
- **Mutation Testing Harness:**
  - Introduced `scripts/mutation-test.mjs` (`npm run test:mutation`) evaluating test quality against code mutations (relational and arithmetic inversions, boolean flips, and boundary conditions).
  - Both target core modules (`packages/foldcraft` mesh topology and `src/lib/selection` document selection masks) achieve a **100% mutant kill rate** (30/30 mutants caught and killed).
  - Added direct unit test assertions for `sceneToMaskIndex` boundary conditions, preventing undetected logic mutations.
- **Contract & API Hardening:**
  - Updated `/api/designs/save` schema to accept nullish design IDs gracefully (`id: z.string().max(300).nullish()`), fixing draft saves from the media overlay harness.
  - Verified full test suite pass across all layers: 223 test suites, 1,794 unit & integration tests, and 5 Playwright end-to-end tests.
- **Technology Reference Synchronized:**
  - Updated `src/features/about/technologyStack.ts` and its test suite to reflect `three@0.185`.

## 2026-08-18 - Low-poly unfold refused valid plans over a 0.17 nm overlap

A real 59 MB scanned soda can failed with `FOAMCUT_PLAN_INVALID` despite a
plan whose folds were all correctly signed, with nothing mirrored and every
face placed. One panel out of 33 was reported as self-overlapping, and that
discarded all 2,024 faces.

- **Root cause: the overlap test was not scale-invariant.** `polygonsOverlap`
  compared against `max(1, |projection|) * 1e-9` — an absolute floor applied
  to projections onto *un-normalised* axes, values that grow with the square
  of the coordinates. Segmentation tests overlap in model units; validation
  re-tests the same panels after scaling to finished millimetres (161x on this
  model). The two stages therefore disagreed about identical geometry:
  segmentation accepted the pair, validation rejected it.
- **What was actually touching:** two triangles sharing a corner, whose two
  copies of that corner had drifted 7e-7 mm apart through different chains of
  rigid transforms, leaving them interpenetrating by **1.7e-7 mm** — about
  1/2000th of the cutter's kerf.
- **Fix:** the separating axis is normalised, so the separation is a true
  distance, and the tolerance is a fraction of the polygons' own size. The
  same geometry now gets the same verdict at every scale.
- Pinned by a fixture taken from the failure itself (the real coordinates of
  faces 1214 and 1252) plus a scale-invariance property; reverting the epsilon
  fails 5 tests, and notably still *passes* in model units while failing in
  millimetres — the contradiction reproduced.
- The can now plans to verdict `warn` with zero issues and zero simulation
  violations, emitting 2 SVG + 2 G-code files.
- **Failures now explain themselves.** The verify stage carries its reasons
  (validation issues + simulation violations) on the progress event, the step
  monitor renders them in red on the step that judged the plan, and a refused
  plan logs as a warning rather than a raw console error. Fold-sign
  consistency is reported to 4 decimals — rounded to 2, a genuine 0.9985
  failure displayed as "1".

## 2026-08-18 - Low-poly unfold: visible steps, paper Unfold removed

- **Paper Unfold removed.** The old papercraft path (`src/lib/papercraft`,
  the Unfold menu entry, its hook, and its nine locale strings) produced
  incorrect nets and duplicated what Foldcraft now does correctly. The 3D
  model context menu carries a single action.
- **"Cut from foam" renamed to "Low-poly unfold"** across all 11 locales.
- **Live step monitor.** The pipeline reports six stages — read model,
  convert to low poly, unfold flat, plan fold grooves, lay out sheets, check
  the plan — into a panel docked at the bottom of the editor. Each stage
  shows its numbers (triangles read, flat faces, pieces/folds/seams, grooves,
  sheets, validation verdict), and the visual stages render thumbnails: a
  shaded isometric view of the model as read, the faceted low-poly version,
  and the unfolded flat pieces. Verified live on a 59 MB scanned can: the
  monitor walked all six steps while the window stayed responsive, and the
  verify step surfaced the validation failure instead of a silent error.
- **Library**: `buildFoldPlan` gains an `onProgress` listener
  (`FoldProgressEvent`: stage, status, stats, previewSvg) and a new
  `exportPreview` module (`meshPreviewSvg`, `panelsPreviewSvg`) — preview
  rendering is skipped entirely when no listener is attached. Events stream
  from the worker over postMessage; the sync fallback reports identically.
- **Vault fix**: "Add to Canvas" for a GLB tried to load the model file as an
  image and silently placed nothing. It now places the same tagged 3D
  placeholder the drag-drop path uses, so the one-click workflow works from
  the Asset Vault.
- Tests: 93 package (5 new), 1,678 app (2 new). Lint and typecheck clean.

## 2026-08-18 - Foam cut no longer freezes on dense models

- Traced with a real 56 MB generated top hat: **3.1 million triangles** across
  1,091 disconnected shells. The pipeline previously froze inside model
  loading before segmentation ever ran.
- **GLB loading**: accessor reads switched from per-element arrays to flat
  typed reads — 3.1M triangles now parse in 0.8 s.
- **Face budgets**: raw meshes decimate to 60k faces before any geometry stage
  runs (grid clustering, linear time), and panelling escalates tolerance and
  decimation until the panel count is workable. A coarser model that cuts
  beats a faithful one that never finishes; the report says what was done.
- **Debris filtering**: shells below 1% of the surface area are dropped —
  1,090 of the top hat's 1,091 shells were floating fragments that would each
  have become cut pieces.
- **Segmentation hot loops**: candidate frontier moved to a binary heap and
  overlap testing onto a spatial grid, removing two quadratic passes.
- **Off the main thread**: the whole plan now runs in a Web Worker (with a
  synchronous fallback where workers are unavailable), so even a
  many-second plan leaves the window responsive.
- tophat.glb end to end: never finished → **15 s, 99 panels, 4 sheets**, all
  correctness checks passing (verdict "warn" for decimation-induced refold
  drift, honestly reported).

## 2026-08-18 - Self-healing purge of the poisoned model cache

- The wrong-model fix now cleans up after the old bug on its own: cache
  entries written by the filename-keyed era (`volatile:model.glb`, pointing at
  whichever model was stored first under that name) are dropped from
  localStorage on first read, so stale sessions stop opening the wrong model
  without anyone having to clear site data. Content-hash and per-asset
  entries are kept.

## 2026-08-18 - Album graveyard fix, shelf details, 3D-view delete key

- **Fixed unwanted album accumulation**: every dashboard start action (Custom
  Size, Upload Media, Create 3D, Generate Image, template click) created one
  more empty "Album N" — browse to the editor and back a dozen times and the
  workspace held a dozen empty albums nobody asked for. Starting a design now
  reclaims an empty album on the active shelf (renamed and resized, so nothing
  stale leaks through) and only creates one when none is free. Pinned by a
  20-visit accumulation test.
- **Bookshelf description and location**: shelves now carry free-text details
  (e.g. "Client campaigns — Agency, Germany"), edited from an info button in
  the 3D view's shelf header and shown beside the shelf name. Persisted with
  the workspace; localized in 11 languages.
- **Delete key in the 3D stack view**: Delete/Backspace removes the selected
  page, album, or shelf at the current zoom level. Items holding content ask
  for confirmation first, and the confirm dialog now opens focused on its
  confirm button — so Delete → Enter completes the deletion, while empty items
  go straight away.
- **Dialogs are now truly modal**: keys no longer leak past an open dialog to
  the 3D view behind it (Enter used to answer the dialog AND dive into an
  item), and typing in a rename field no longer moves the 3D selection or
  triggers deletes.
- Sharing paths (linked layers within a shelf, shelf boundaries, duplicated
  shelves staying independent) re-verified against the existing store suites.

## 2026-08-18 - Machine build requirements + groove width fix

- Added `docs/FOLDCRAFT_MACHINE_BUILD.md`: the full build specification for the
  cutter — controller decision with evidence, axis specs derived from real cut
  data, grblHAL configuration, the complete verified G-code contract, camera
  registration, commissioning order, safety, and BOM.
- **The donor TwoTrees mainboard cannot be reused.** It carries at most four
  motor channels (X, Y1, Y2, unpopulated Z) with soldered drivers and no
  external step/dir breakout, against the six outputs an XYZAC machine with a
  ganged Y needs. Recommended replacement: Teensy 4.1 + T41U5XBB running
  grblHAL.
- **Fixed a groove-width bug**: the through-cut test checked only the low side
  of the dihedral range, so a fold near 360° — panels folded back on themselves
  — reached the width formula and produced a 595 mm groove, wider than the
  sheet. The test is now symmetric about 360°, with a half-angle cap as a
  backstop. Widest groove across the full circle is now 30.2 mm.

## 2026-08-18 - One-click "Cut from foam" in the editor

- Right-clicking a 3D model on the canvas now offers **Cut from foam** next to
  Unfold: one press runs the full Foldcraft pipeline (low-poly, segment,
  grooves for 6 mm EVA, pack, simulate, validate) and downloads cutter-ready
  files — layered SVG plus five-axis G-code per sheet — while a sheet preview
  lands on the canvas. Defaults are chosen for a maker with no computer
  experience: costume scale (280 mm), the reference ultrasonic cutter, no
  settings to understand.
- Files are only produced when the plan passes its own validation and the
  machine simulation; a failed plan reports why instead of exporting.
- Strings localised in all 11 UI languages; jsdom TextEncoder polyfill added
  for the model parsers under test.

## 2026-08-18 - Foldcraft: standalone unfold-and-cut library + machine design

- New `packages/foldcraft` — a zero-dependency, dual-licensed (PolyForm
  Noncommercial free / commercial paid) TypeScript library that unfolds 3D
  models into flat foam panels with machine-ready fold grooves. Built for reuse
  outside Image Express.
- Pipeline: GLB/STL/OBJ loading (own parsers, no three.js), vertex welding +
  outward orientation, low-poly panelization with guaranteed-flat panels,
  sharp-edge-first segmentation (cube → 1 panel vs 11 islands before),
  mirror-safe flattening with provably correct mountain/valley directions,
  per-fold V-groove geometry from material thickness, sheet packing, layered
  SVG with camera fiducials, five-axis grblHAL G-code (tilt A, swivel C), a
  toolpath simulator that rejects physical violations (it caught a real
  buried-blade rotation bug in the planner during development), overhead-camera
  homography registration, and hard validation that fails on flipped fold
  signs. 83 package tests; historic fold-sign and mirroring bugs pinned by
  mutation testing.
- Designed the reference machine in `docs/FOLDCRAFT_MACHINE.md`: a 600×600
  laser-frame conversion carrying an ultrasonic knife on programmable tilt and
  tangential-swivel axes, grblHAL on Teensy 4.1, overhead camera. The old
  `src/lib/papercraft` stays as a reference implementation.

## 2026-08-17 - One-click 3D origami unfold

- Added a context-sensitive **Unfold** action when right-clicking a 3D model on
  the canvas; empty-workspace right-click continues to open the circular tool
  selector.
- Added a client-side GLB/GLTF papercraft engine with automatic mesh
  simplification, adjacency-aware triangular unfolding, overlap rejection,
  island splitting, glue tabs, face labels, A4 packing, and millimetre SVG.
- Kept the fast path to two actions--right-click and Unfold--with fabrication
  controls remaining optional in Cricut Studio.
- Added all 11 locale strings and regression coverage for model targeting,
  context-menu routing, fold topology, tabs, and physical SVG dimensions.
- Fixed dense-model stack overflow by streaming mesh bounds instead of passing
  unbounded coordinate arrays to variadic `Math.min`/`Math.max`.
- Fixed triangulated primitives such as cubes unfolding into loose triangles:
  coplanar triangles are now placed as atomic panels, internal mesh diagonals
  are suppressed, and the cube regression requires six squares, five 90-degree
  folds, and seven glue seams on one sheet.
- Added an eight-candidate local unfold planner and 3D fold-back predictor with
  surface/topology fidelity scoring plus target mountain/valley fold angles.
- Fixed local and Google Drive models being stored on the canvas as short-lived
  browser `blob:` URLs. Model selections now materialize once into the existing
  authenticated asset store, and 3D edit/unfold attempts recover legacy blob
  layers by filename or report a localized, non-crashing expired-source error.
- Production builds now refuse to clean `.next` while a live Image Express
  server owns it, preventing missing-manifest/ENOENT failures in an open dev
  session. The production launcher can still perform its own guarded auto-build.

## 2026-08-17 — Unified Fabrication Studio and CNC planning

- Combined 3D generation, the 3D model library, Cricut Studio, and the CNC
  planner into one Fabrication tool family with click and right-click behavior.
- Added the same Fabrication entry to the workspace circular selector and the
  compact Tools menu, all routed through the existing shared tool controller.
- Added workflow/material libraries and a searchable 5-axis CNC foam-cutter BOM
  with saved acquisition progress, category/axis filters, safety flags, and CSV.
- Added registry, inventory, modal, toolbar, and circular-navigation tests;
  localized all new navigation and planner UI across all 11 dictionaries.

## 2026-08-17 — Cricut fabrication export

- Added a local raster-to-vector pipeline with monochrome thresholding, connected
  component extraction, closed contour tracing, hole preservation, and physical-unit
  node simplification.
- Added deterministic multi-strategy MaxRects nesting with optional part rotation,
  custom sheet dimensions, margins, spacing, and one SVG per material sheet.
- Added extruded-silhouette layer planning from target depth and stock thickness,
  per-layer registration score marks, and a JSON assembly manifest for multi-sheet ZIPs.
- Added a dedicated live export workspace plus focused geometry, nesting, SVG, and UI tests.

## 2026-08-11 — AI Campaign Manager: stored campaigns, plain-language rules, verify with auto-fix

**Backlog #3, in the shape the user actually specified**: campaigns holding
allowed fonts, palette colors, uploaded assets, reference images, and
requirements written in plain language. Multiple campaigns are stored
(`data/campaign/` server store as source of truth + localStorage cache,
mirroring the Brand Kit pattern) and reselectable. **Verify** audits the
canvas against the selected campaign — report-only or auto-fix — with
violations highlighted on canvas in severity colors.

- Maximum reuse over reinvention: `campaignToBrandProfile()` expresses a
  campaign as a synthetic BrandProfile, so the deterministic checks, the
  VLM/external/heuristic fallback chain, and the auto-fix machinery are all
  the brand engine's. Rules a campaign doesn't define are zeroed so the
  engine skips them; an empty font list means "no font constraint", not
  "every font violates" (filtered + score recomputed).
- Plain-language requirements reach the AI as `extraInstructions`, a new
  optional field on the existing `/api/ai/brand-manager/audit` route —
  backward compatible.
- Right-clicking the Super Agent toolbar button opens a compact picker:
  Super Agent or Campaign Manager (`AgentToolContextMenu`). The Campaign
  Manager is also in Tools → AI & 3D. The five same-shape AI modal mounts in
  Toolbar now share one portal (which is how the file stayed under its size
  ratchet despite the new tool).
- New: `src/lib/campaign/{campaignProfile,campaignAuditEngine}.ts`,
  `src/lib/server/campaign-store.ts`, `/api/ai/campaign-manager/profile`,
  `CampaignManagerModal`, `AgentToolContextMenu`; 36 strings × 11 locales.
- Tests: persistence (multi-campaign, active tracking, delete), adapter
  zeroing, empty-font/empty-color semantics, instruction builder, and modal
  flows (create/select/delete, report-only verify offline, auto-fix label).

## 2026-08-11 — AI Upscale: one tool, seven services, result as a layer

**A dedicated Upscale tool** (toolbar + Tools menu, id `ai-upscale`) that
routes one job through whichever service fits: local ComfyUI (default — the
existing `upscale-image` catalog workflow, free and private), Stability
conservative 4x, Fal.ai Clarity, Replicate Real-ESRGAN, Magnific/Freepik,
Topaz Labs, or Claid.ai. Source is the selected layer or the whole canvas; the
result is added as a **new layer** over the source's footprint (full resolution
retained, `aiProvider` tagged), never a destructive replace.

- One provider catalog (`src/lib/upscale/upscaleProviders.ts`) drives the
  Settings section, the modal, and key sync — adding a provider is one entry.
- Settings → Services grew an **Upscale Services** section: per-provider keys
  (account-synced through the open-shaped `/api/user/keys` record, no server
  change needed), one-line best-for guidance, and default service/scale/
  creativity preferences.
- External providers run through `/api/ai/upscale` (+ `/poll` for the async
  Replicate/Freepik flows), a provider-agnostic proxy following the Stability
  route conventions: caller's key in the Authorization header, never stored.
  Provider-returned result URLs are validated against the outbound URL policy
  before the server fetches them — a spoofed provider response must not become
  a read of the local network.
- i18n: all 33 new strings shipped in **all 11 locales**, plus the three
  `panel.*` keys 960b68d left English-only — the parity ratchet is green
  again.
- Tests: provider catalog/preferences, proxy adapters (fal sync flow, freepik
  task+poll flow, error mapping, SSRF-refusal), and the modal
  (source/key-gating/run/add-as-layer paths).

## 2026-08-09 — Dashboard: three collapsing rows, and the hydration bug they exposed

**The dashboard now matches the hierarchy it describes.** Two flat grids
(Albums, Saved Pages) became three collapsing bars — Pages, Albums,
Bookshelves, in that order, Pages open by default. Each opens into a
horizontal row of cards with left-drag panning, a scrub bar and side arrows.
`MoreItemsDropdown` went with them: it existed only to hide items past a
six-item cap the scrolling rows no longer need.

**The first version was built as a 3D rolodex, and it was removed.** Every
scroll frame ran a layout pass writing `transform`, `opacity` and `z-index`
onto every card, plus a React state update for the scrub position — visibly
choppy. Native scrolling replaced it; the only remaining scroll work is one
`transform` write to the scrollbar thumb, held in a ref, so scrolling triggers
zero renders.

**A `useState` initializer reading `localStorage` broke hydration.** The
accordion read its open/closed preference during the client's first render, so
any stored state other than the default disagreed with the server HTML. React's
recovery is to discard the tree and regenerate it client-side — which
re-created the root layout's inline `<head>` scripts and surfaced as
*"Encountered a script tag while rendering React component"* pointing at
`layout.tsx`, two levels away from the actual defect. Reproduced in a real
browser (1 script warning, 1 hydration failure), fixed with
`useSyncExternalStore` whose `getServerSnapshot` keeps hydration on the
default, verified back to 0/0. `layout.tsx` was correct throughout and was not
touched.

## 2026-08-09 — Thumbnails and previews: one cache-validator bug

**A thumbnail and the full-size original shared a cache validator.** They are
two representations of the same URL, and the ETag was built from size+mtime
only. Once a browser had cached a tile, revalidating the *original* matched the
*thumbnail's* tag and the server answered **304 with no body** — so the browser
rendered a 7 KB WebP where a 1.8 MB PNG was expected, or nothing at all.

That is why it took "a few clicks or navigations" to appear: it cannot happen
until enough browsing has cached a thumbnail. It explains the broken tiles, the
broken image in the details panel, and a preview window opening empty.
Reproduced against the running server (`304, 0 bytes`), fixed by including the
width in the validator, and pinned by tests.

**Tiles are now cacheable.** `no-cache` cost a network round trip per tile per
fresh open — measured at 841 ms of pure revalidation for 54 tiles, and a
library of 200 pays that queued six-at-a-time behind everything else. Grid
tiles get `max-age=300`; originals keep revalidating. Measured after: reopening
the vault made **0 tile requests** where it previously made 48.

Five minutes rather than a day, deliberately: the URL does not change when the
file does, so the max-age is exactly the window in which an edited image can
look stale.

## 2026-08-09 — Help → Technology: the stack, explained in the app

**A presentable technology reference, in the app.** Help → Technology opens a
searchable page covering 45 technologies across nine areas — foundation, canvas
and document model, 3D, AI and generation, the vault and its vector search, the
job queue, the API and security layer, MCP, and quality gates. Every entry says
what the thing does *here* and why it was chosen, naming the alternatives that
were rejected; the filter searches the reasoning too, so typing "better-sqlite3"
finds the entry explaining why it is not used.

**The content cannot go stale silently.** A test cross-checks every stated
version against package.json, so upgrading, replacing or removing a dependency
fails the build rather than leaving the app describing a stack it no longer has.

Two rendering bugs found and fixed while verifying it in the browser: the dialog
inherited the header's `backdrop-blur` as a containing block and anchored to the
header instead of the viewport (now portalled to `<body>`), and at `z-70` the
floating properties panel and tool flyouts painted straight through it (now
`z-2500`). The file-size ratchet also caught the prop-threading through
`EditorView` and `EditorHeaderMenus`; the Help menu owns the dialog instead, so
neither large file changed at all.

## 2026-08-09 — Tripo/Hitem3D results no longer crash the editor

**A finished 3D generation took the whole app down.** The job handed the
browser Tripo's signed CDN URL; the CDN sends no `Access-Control-Allow-Origin`,
so the GLTF loader was blocked, threw, and — with no error boundary above
`useGLTF` — the error reached the React root and the browser replaced the editor
with its own crash page. Reloading did not help, because the failed job was
restored from localStorage still holding the same URL.

Results are now **stored server-side the moment the job completes**, before the
client is told anything. The server has no CORS problem and copies the bytes
while the signature is still valid, so the generation also survives the link
expiring. The job's `resultUrl` is an app-local path; the provider URL never
reaches the browser. A store failure fails the job rather than falling back to
the provider URL.

**"Saved to server & added" was not true.** Nothing called the save endpoint —
the label was shown for any succeeded job, which is why a generation reported as
saved could not be found afterwards. Persisting registers the asset metadata,
which is what actually puts it in the collection.

**Old jobs are repaired on open** rather than left broken: a result URL that is
not same-origin is saved through the server on first click, and the job record
is updated so the next click and the next reload are free.

**A model that cannot load now says so.** `ModelErrorBoundary` wraps the 3D
canvas with a message and a Close button. Verified in-browser both ways: a
deliberately missing model shows the failure with the app fully alive, and a
real GLB still renders.

ThreeDLayerEditor grew past the file-size ratchet during this work; presets and
the failure panel were extracted rather than the baseline being raised (842 →
807 lines).

## 2026-08-08 — The indexing service: click once, runs itself, stoppable

**"Index & precache" now exists as a service.** A skinny strip at the bottom of
the vault starts it, streams what it is doing ("Prepared 1,036 thumbnails —
40,339 of 220,644 checked…") with a thin progress bar, and stops it. The run
chains bounded passes with a cursor until the whole catalog is thumbnailed and
embedded — no pass holds a queue lane for hours, interactive work always
preempts it, and a crash costs at most one pass because progress lives in the
cache and the vector store.

**Running jobs can now be stopped.** The queue's cancel endpoint previously
409'd anything that had started. Cancel now sets a cooperative flag; handlers
check it between batches and exit cleanly, and a stop that was *acknowledged*
finishes the job as `cancelled` — while a handler that never checks (a
generation mid-provider-call) still completes as `succeeded`, so a produced
result is never hidden behind a cancel. Verified live: Stop flipped the strip
to idle in under two seconds mid-pass.

**Resource discipline, measured:** four decodes then a 50 ms pause
(tunable via `IMAGE_EXPRESS_THUMB_PAUSE_MS`); a grid tile served in ~110 ms
while the service was indexing. Files sharp cannot decode (RAW, `.hdr`) are
remembered and skipped instead of re-read and re-failed every pass — a folder
of HDR panoramas previously made the service grind while producing nothing.

## 2026-08-08 — Preview reliability: the serve route, the reopen bug, tile retries

**Every reopen of the vault showed "No assets found".** Reproduced 100%
deterministically: the close-time reset restored `use3d: true, depth: 'room'` —
the old 3D-room default — but the flat grid only fills when `!use3d` and the
open-time auto-select is gated on `!use3d` too, so nothing recovered. The reset
now lands in the flat view; three consecutive close/reopen cycles verified at 48
tiles each, and a regression test pins it. (The old test asserted the buggy
state by name.)

**The app's own assets had no caching, no thumbnails, and blocked the server.**
`/api/assets/serve` sent `max-age=0, must-revalidate` with no validator — the
literal "refreshing every single time, no precaching" — read whole files with
`readFileSync` (one page of tiles = 48 event-loop stalls, everything else
queued, including `/api/queue/stream`), and had no `?w=`, so each generated
image cost its ~1 MB original per tile. It now streams with byte ranges,
answers `?w=` from the shared thumbnail cache (976 KB → 5.2 KB per tile,
measured), and carries a size+mtime ETag: unchanged files revalidate as a
bodiless 304 in ~8 ms, edited files are picked up immediately.

**A tile that failed once stayed broken forever.** The failure glyph added in
the previous pass was permanent, so a transient blip (recompile, dropped
connection) killed that tile until the vault was reopened. Tiles now retry with
backoff (3 attempts) before declaring the file broken.

**Stability under load, measured:** 7 passes of 96-way-concurrent thumbnail
generation over real drive files (~670 requests/pass) — server up throughout,
RSS plateauing ~2 GB. The earlier "server died during benchmarking" was
diagnosed: one death was `npm run verify` rewriting `.next` under the running
dev server (documented), one was a test-harness stdin artifact, and the
remaining risk was the synchronous serve route, now streaming. Double-click
still opens the full-size preview — verified in-browser, not assumed.

## 2026-08-08 — Vault previews: byte ranges, staged loading, a size slider

**Videos could not be previewed at all.** `/api/assets/vault/file` applied a
64 MB cap to every response, and on the indexed drives **11,620 of 16,136
videos exceed it** — each one answered 413 and showed a spinner that never
resolved. The route now serves byte ranges and advertises `Accept-Ranges`, so a
player fetches only what it plays and can seek. Measured on 24 drive videos:
whole-file 29.6 s / 43.3 MB with 3 refusals, head range 1.7 s / 256 KB with
none. An unsatisfiable range returns 416 with the real size rather than a
silent clamp.

**Two client paths were downloading whole files to draw one frame.** Video
poster capture used `preload="auto"`, which fetches the entire clip for a 256 px
still; it now uses `"metadata"`. On desktop, preview resolution went through
Electron IPC, which reads the file and base64-encodes it into a blob — several
times the file's size in memory, and a blob cannot seek. HTTP is now preferred
wherever the renderer is served over it.

**Grid loading is staged.** Tile artwork resolved in one sequential loop, so a
single slow clip held up every image behind it. It now runs in three stages —
known-instantly, source URLs, then decodes — each publishing as it completes. A
tile whose artwork genuinely fails shows a warning glyph instead of a permanent
spinner.

**Thumbnail size slider.** Six steps, persisted. Five of them map onto the same
256 px rendition the precache pass already generates, so resizing is instant
rather than regenerating every visible thumbnail.

**"Find similar" returned nothing, slowly.** It read the legacy `vectors.json`
while every embedding since the SQLite switch went to `vectors.db` — searching a
store that search itself had stopped filling. It now uses the same index, with
metadata affinity (folder, type, filename, date) as a fallback that works with
no indexing at all. Hash-text vectors were tried for that tier and rejected on
measurement: they ranked `River Stereo.wav` as the nearest match for
`underwater.mov`. The seed embedding now runs on a 2.5 s budget instead of the
45 s backfill default, which is what every click was paying with Ollama down:
**45 s → 3.2 s**.

*Historical note: running `npm run verify` while a dev server was up could
rewrite `.next` underneath it and make every route return 500. Builds now stop
before cleanup when a live server owns that directory.*

## 2026-08-08 — Operational floor: F-03, F-04, F-07 done; F-06 started

**Meshy 3D generations now finish.** Meshy returns an untextured preview first
and only produces textures after a *separate* refine task is started. The poll
loop treated the preview's terminal status as the end of the job, so every
Meshy generation shipped an untextured model — which read as a quality problem
rather than a missing pipeline step. The loop now starts the refine task,
retargets the poll and resets backoff; if refine cannot start, the preview is
kept and the reason logged.

**F-07 Diagnosability — done.** The desktop shell logged the packaged server's
stderr as a byte count only, so a failed startup recorded that 1,438 bytes of
error existed and nothing about what they said. It now logs the text. Redaction
moved out of `main.js` into `electron/logRedaction.js` as the shell's single
redaction path — `main.js` already had an inline redactor, so logging the text
would otherwise have created a second, divergent one. The extracted module
takes masked paths as an injected thunk instead of importing Electron's `app`,
making it testable without booting Electron; it had **no tests** before, despite
guarding the file users attach to support tickets. Now 19, including a bare
`sk-…` key that the inline version passed through.

**F-03 SQLite catalog store — landed, not yet wired.**
`src/lib/server/vaultCatalogDb.ts` replaces the 153 MB whole-file rewrite with
one row per asset and indexed columns for the filters the UI issues. Uses
`node:sqlite` over `better-sqlite3` so there is no native module to rebuild on
each Electron major. 13 tests, including a folder-prefix near-miss
(`d:/media-private` must not match `d:/media`) and a direct check that adding
one asset to a 2,000-row catalog writes a row, not the store. `vault-store.ts`
does not call it yet, so the JSON rewrite is still what ships.

**F-03 finished: the targeted write path, and a regression caught on the way.**
Wiring SQLite in behind the whole-catalog interface only bought ~1.5×, because
`writeVaultCatalog` is handed everything and must rediscover the delta by
scanning every row. `upsertVaultAssets`, `deleteVaultAssets` and
`readVaultAssetsByWatchRoot` let callers that already know what changed skip
that scan, and the two write-heavy jobs now use them: vault enrichment
(**342 ms → 0.5 ms**, it changes at most 24 assets per run and was handing back
all 200k) and the watch-root rescan (**885 ms → 109 ms**, it loaded every asset
on the machine to find one folder's records).

The same work exposed a regression I had introduced. Materialising the whole
catalog from rows costs a `JSON.parse` each — **903 ms against 257 ms** for the
single JSON document, 3.5× *dearer*. SQLite wins on writes and scoped queries
and loses on "give me everything". Search reads the whole catalog per query, and
the JSON path had an mtime-keyed cache making repeat reads free; the SQLite path
had none, so every search rebuilt 200k records. Fixed with an equivalent
snapshot cache invalidated by every write helper, pinned by tests that fail if
the invalidation is removed. It is a stopgap: the real fix is for search, the
similar-asset lookup and the sync route to stop asking for everything.

**F-09: the vector store was silently broken above ~34k assets.** Not slow —
broken. One 768-dim `nomic-embed-text` record serialises to 15.6 KB, so
`vectors.json` hit V8's 536 MB maximum string length at roughly **34,400
embedded assets**, where `JSON.stringify` throws `RangeError: Invalid string
length`. The search route caught that and logged a warning, so past that point
the index **stopped persisting for good** and semantic search could never
converge — with nothing in the UI to say so. At 200k assets the file would be
3.1 GB.

Replaced with `vectors.db`: one row per embedding as a float32 BLOB, stored
unit-length so cosine is a dot product. Search is two-stage — an int8 quantised
matrix is scanned coarsely, then the top candidates are rescored against exact
float32 vectors, so the lossy pass only ever shortlists.

| Operation | JSON | SQLite |
|---|---|---|
| Persist one backfill batch of 32 | 2,194 ms | **3.1 ms** |
| Cold load | 2,401 ms | **258 ms** |
| Ceiling | **throws at ~34,400** | none |

Two measured results corrected the obvious assumptions: pre-normalising bought
nothing on its own, and int8 is *slower* than float32 to score in JS (no SIMD)
— it earns its place on memory, 154 MB against 614 MB at 200k, at 100%
recall@40. No ANN index, deliberately: a full scan at 200k is ~100 ms, below
where HNSW earns its build cost and recall risk.

**F-06 started: two files split, ~400 lines out, 73 tests added.** Pure logic
left `ImageGeneratorModal` (4,013 → 3,759) and `AssetLibrary` (3,041 → 2,906).
The point was coverage, not line count — `resolveComfyQualityProfile` picks the
resolution and CFG a generation runs at, and asset merging decides whether a
private copy could be collapsed into a public one. Neither could be tested
without mounting a 3–4,000-line component, so neither had been.

**A random test failure, and a real bug behind it.** `npx jest` failed roughly
one run in two on the two suites reaching `getInstallerRuntimeStatus`, always
as a timeout, never as a bad assertion — and always passing under
`--runInBand`, which is what `npm run verify` uses, so the project's own gate
never saw it. The cause was contention, but chasing it surfaced a production
bug: the `ollama` CLI probe had **no timeout**, so an installed-but-wedged
binary would hang `/api/runtime/installer/status` indefinitely. The probe is now
bounded at 2s and memoised for 30s; the two tests got an explicit 20s budget,
since 5s was jest's generic default and never a considered one for work that
reloads a module graph and spawns a process. Verified across five consecutive
parallel full runs.

Gate at time of writing: **173 suites / 1142 tests passing**, `npm run verify`
green end to end.

---

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
