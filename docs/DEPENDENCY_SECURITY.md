# Dependency security policy

How advisory alerts are resolved and kept resolved in this repository.

## Current sweep (2026-10-04)

Raised by the host's dependency scanner against the deployed lockfile. Every
item is fixed by a real upgrade; nothing was waived.

| Advisory | Package (was) | Now | How |
|---|---|---|---|
| GHSA-vcvr-r3jv-pc5j (critical, RCE in `next/og` ImageResponse) | `next` 16.3.5 | **16.3.8** | Direct dependency, with `eslint-config-next` |
| CVE-2026-102276 / -102277 / -102278 (stack exhaustion, quadratic expansion) | `brace-expansion` 1.1.18 | **1.1.21** | Override `brace-expansion@1` |
| same | `brace-expansion` 2.1.4 | **2.1.7** | Override `brace-expansion@2` |
| same | `brace-expansion` 5.0.9 | **5.0.12** | Override `brace-expansion@5` |
| CVE-2026-86472 | `fast-uri` 3.1.7 | **3.1.8** | Override |
| CVE-2026-101911 / -101912 | `ip-address` 10.7.0 | **10.7.3** | New override `^10.7.1` |
| GHSA-p98j-92pf-mc4p | `dompurify` 3.4.15 | **3.4.16** | Override |

`npm audit --omit=dev` reports **0 vulnerabilities** and `audit:dependencies`
passes with **no active waivers** — the brace-expansion waiver below is retired.

**Why this stays fixed.** The floors live in `package.json` `overrides`, keyed
per major line where the lines are not API-compatible. `audit:overrides` (part
of `npm run verify`) fails if the lockfile ever resolves below a floor, which is
how an override silently regresses. CI and the release workflow run
`audit:dependencies`, and Dependabot opens weekly minor/patch updates.

**Still reported by a full `npm audit`, and why it is left.** `braces` 3.0.3
(GHSA-vfj7-8cjw-p6xm), reached only through `eslint-config-next` →
`fast-glob` → `micromatch`. It is lint tooling that never ships or runs in
production, 3.0.3 is the newest release, and the advisory range is `<=3.0.3` —
there is no patched version to move to. It is not in the production tree and
was not in the host's report.

**Not covered: `mobile-companion/`.** That sub-project has its own lockfile on
Expo 51 / React Native 0.74 and a full audit of it reports 69 advisories, most
of which need an Expo major upgrade. It is a separate prototype (R-19), is not
part of the deployed app, and was not changed here.

## Previous refresh (2026-09-13)

For the 0.2.2 installer work, Electron is updated to **44.3.0**, electron-builder
to **26.15.3**, electron-updater to **6.8.9**, Next/its ESLint config to **16.3.5**,
and React/React DOM to **19.3.0**. Compatible dependencies were refreshed in the
lockfile under npm 11. Full and production npm audits report **0 vulnerabilities**
at this check; the release workflow repeats the production audit.

The bundled runtime now requires macOS 13+. Package verification rejects stale
Next/React versions and stale app versions; launch smoke tests compare the actual
Electron runtime to the lockfile. `electron:ensure` checks the downloaded binary's
version rather than only its presence.

Unrelated major migrations (Transformers, TypeScript, ESLint, Lucide, Three.js,
and testing libraries) are not forced into the installer change. Latest-major
does not mean API-compatible; those upgrades require their own migration checks.

## Previous advisory sweep (2026-08-07)

`npm audit` reports **0 vulnerabilities**. The last advisory sweep resolved:

| Advisory | Package | Resolution |
|---|---|---|
| CVE-2026-70608 | `electron` 40.10.6 | Direct dep bumped to `^41.10.4` |
| GHSA-55q2-fjhq-7xh7 | `dompurify` 3.4.12 (via `jspdf`) | Override `^3.4.13` |
| CVE-2026-69207 + 3 more | `hono` 4.12.33 (via `@modelcontextprotocol/sdk`) | Override `^4.13.1` |
| GHSA-8x6c-cv3v-vp6g | `cacheable-request` 7.0.4 | Chain removed via `@electron/get` override — waiver retired |
| CVE-2026-14257 | `brace-expansion` 1.1.18 / 2.1.4 | Already patched in those builds; waived (see below) |

Verified with `audit:overrides`, `audit:dependencies`, the full test suite,
`build`, `desktop:pack`, `desktop:verify-package` and `desktop:smoke-package`
(`electron-ready → server-ready → window-ready` on Electron 41).

> **Install under the supported Node, or pinned overrides silently regress.**
> Running `npm install` under an older Node — and therefore an older npm — does
> not honour the major-scoped override keys. Doing so on npm 10 dropped
> `glob` back to `10.5.0` beneath the pinned `^13.0.6` floor, which
> `npm run audit:overrides` then failed on. If that happens, restore
> `package-lock.json` from git and reinstall under Node >=24. `npm run setup`
> re-execs under a supported Node and avoids this entirely.

## Where the fixes live

All transitive security fixes are pinned in the `overrides` block of [package.json](../package.json).
Overrides apply to every install and to `npm ci`, so a fix cannot be undone by a
transitive bump. Nothing is patched by hand in `node_modules`.

Some advisories are fixed on more than one release line, and those lines are not
API-compatible with each other. For those, the override key is scoped to a major
(`"brace-expansion@1"`, `"brace-expansion@2"`, `"brace-expansion@5"`) so each
consumer gets the patched build of the line it can actually load.

## Enforcement

| Gate | Command | What it protects |
|---|---|---|
| Override integrity | `npm run audit:overrides` | Fails if `package-lock.json` resolves any package below its pinned override floor — the way pinned fixes silently regress |
| Production advisories | `npm run audit:dependencies` | Fails on moderate-or-higher advisories in the production tree, minus documented waivers |

`audit:dependencies` runs the override check first, and `npm run verify` runs it
too, so the guard fires locally as well as in [CI](../.github/workflows/ci.yml).

## Waivers

[config/dependency-audit-exceptions.json](../config/dependency-audit-exceptions.json)
is the only place an advisory may be accepted. Each entry needs the advisory ID,
a technical reason, and an `expiresOn` date; the audit script fails once a date
passes, forcing a re-review rather than letting a waiver become permanent.

No advisory is currently waived; `config/dependency-audit-exceptions.json` is empty.

**Retired waiver — brace-expansion / GHSA-mh99-v99m-4gvg (CVE-2026-14257).**
Waived from 2026-08-07 because the patched 1.x and 2.x backports were still
inside the advisory's flat `<=5.0.7` range. Retired on 2026-10-04: with
1.1.21, 2.1.7 and 5.0.12 installed the audit no longer reports it. `5.x` still
cannot be forced onto `minimatch@3` (it exports an object, not a callable), which
is why the overrides stay keyed per major line.

**Retired waiver — cacheable-request / GHSA-8x6c-cv3v-vp6g.** Fixed properly on
2026-08-07 instead of waived. `@electron/get@5` dropped `got` from its
dependencies entirely, so overriding it removes the whole
`got@11 → cacheable-request@7` chain — 27 packages, `cacheable-request` no
longer in the tree at all. See the override table below.

## Adding a fix

1. Confirm the patched release is actually loadable by its consumers — check the
   module type and the export shape, not just the version number. A blanket
   major bump of a transitive dependency is the usual way to break a toolchain.
2. Add or raise the entry in `overrides`, scoping the key to a major if the
   release lines diverge.
3. Run `npm install`, then `npm run audit:dependencies`.
4. If the advisory cannot be cleared, add a waiver with an expiry instead of
   loosening the gate.

## Install scripts (npm 11 `allowScripts`)

npm 11 blocks package install scripts unless the package is covered by an
`allowScripts` policy, and prints a recurring warning for every uncovered
package. This repo now **declares** the policy in `package.json` — all seven
packages with install scripts are explicitly allowed — which silences that
warning permanently. Each entry was verified rather than assumed:

| Package | Script does | Why allowing it is safe |
|---|---|---|
| `electron` | downloads the Electron binary | The script runs but no-ops: installs set `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, and `npm run electron:ensure` provisions the binary on demand for desktop builds |
| `canvas` | `prebuild-install` (downloads a prebuilt native binding) | canvas is an **optionalDependency** of fabric — if the script fails (offline, no prebuilt for the platform), npm skips the package and the install still succeeds |
| `onnxruntime-node` | post-install platform setup | Transformers.js is used only in the browser (WebGPU/WASM); the node runtime is never loaded by app code |
| `electron-winstaller` | selects a 7-zip build | Tiny local script; Squirrel target only (this app ships NSIS) |
| `core-js` | prints a notice | No build effect |
| `protobufjs` | generates CLI helpers | Harmless |
| `unrs-resolver` | verifies a napi binding | Harmless |

Verified with `npm run verify`, `desktop:pack`, `desktop:verify-package` and
`desktop:smoke-package` passing on a clean install with the policy declared.
When a NEW package with an install script appears in the tree, npm warns again
— vet it before adding it to `allowScripts`.

## Deprecation warnings on install

`npm ci` prints a warning for every transitive package whose author marked it
deprecated. None of them is an error, none carries an advisory (`npm audit`
reports 0 vulnerabilities), and all are dev/build-time only. They were still
worth attacking one by one, because "upstream's problem" is easy to say and
sometimes wrong.

### Cleared by an override

| Override | Removes | Why it is safe |
|---|---|---|
| `"@electron/asar": "$@electron/asar"` | `glob@7` + `inflight` under electron-builder | asar 4 uses `glob@13`. The `$name` form is required because asar is also a direct dependency; a literal version there is an `EOVERRIDE` error. Verified by `desktop:pack` + `verify-package` + `smoke-package` |
| `"test-exclude": "^8.0.0"` | `glob@7` + `inflight` under jest | test-exclude 8 uses `glob@13`. Verified by the full suite **and** `jest --coverage`, which is the code path that actually calls it |
| `"global-agent": "^4.1.3"` | `boolean@3.2.0` | global-agent 4 dropped the dependency outright |
| `"glob@10": "^13.0.6"` | `glob@10.5.0` under jest and rimraf | Scoped to the 10.x line. Verified by 148 suites / 864 tests plus coverage |
| `"rimraf": "^5.0.5"` | `rimraf@2.6.3` + `glob@7.2.3` + `inflight@1.0.6` under electron-winstaller's `temp` | rimraf 5 is promise-based while `temp` calls the rimraf 2 callback API — but that call only ever happens on the **Squirrel** packaging path, and this app ships NSIS, so the module is never even loaded. Verified by `desktop:pack` + `verify-package` + `smoke-package` (the NSIS path end to end) |
| `"@electron/get": "^5.1.0"` | `got@11` + `cacheable-request@7` + `http-cache-semantics` (27 packages) under electron-builder | v5 dropped `got` outright. It is ESM-only (`"type": "module"`) while `app-builder-lib` does a plain `require("@electron/get")`, which works because `require(esm)` is supported from Node 22.12+ and this repo requires Node >=24 — probed directly before adopting, and both APIs app-builder-lib calls (`downloadArtifact`, `ElectronDownloadCacheMode`) exist in v5. Verified by `desktop:pack` + `verify-package` + `smoke-package` |

### Structurally unfixable

Checked against every version each package has ever published (`npm view <pkg>
versions`), not just `latest` — the distinction matters, because "latest" can
lag behind an unpublished fix, but here there is nothing to lag behind:

| Deprecated | Reached through | Why no override helps |
|---|---|---|
| `lodash.isequal@4.5.0` | `electron-updater` | **23 versions have ever been published; 4.5.0 is the last one.** The deprecation asks consumers to switch to `node:util.isDeepStrictEqual` — an API change only electron-updater can make |
| `whatwg-encoding@3.1.1` | `fabric → jsdom` | **10 versions have ever been published; 3.1.1 is the last one**, deprecated in favour of a different package (`@exodus/bytes`). Nothing to upgrade to |

These two are the only deprecation warnings a clean install prints now.
The rule these follow: an override can change a version, it cannot change an
API or remove a dependency. When the latest published version *is* the
deprecated one, the warning can only be retired by the parent package.

Re-check this table whenever `electron-builder`, `electron-updater`, `jsdom` or
`jest` move a major.

## Never run `npm install` while the app is running

A running dev/prod server holds `node_modules/next/dist/server/lib` open, and
`onnxruntime-node` stays locked too. npm's cleanup phase then fails with
`EPERM`/`EBUSY` **after it has already removed packages**, leaving a tree that
is neither the old nor the new one.

Observed symptom: `tsc` suddenly "is not recognized", `npx jest` starts
resolving out of the npm cache instead of `node_modules`, and `typecheck`,
`lint` and `test` all fail at once — while 758 packages still look fine. The
debug log is the tell:

```
warn cleanup [Error: EPERM: operation not permitted, rmdir '…\node_modules\next\dist\server\lib']
warn cleanup [Error: EBUSY: resource busy or locked, rmdir '…\node_modules\onnxruntime-node']
```

**Fix:** stop every server on the project's ports first, then reinstall.

```bash
npm install
```

This is the same family as the packaging `EBUSY` below — a live handle beating
a file operation — but it corrupts the dependency tree rather than one build
artifact, so it looks like a broken toolchain rather than a locking problem.

## Windows install failures (`ENOTEMPTY`, `EPERM`, `TAR_ENTRY_ERROR`) and slow installs

Real-time file scanning (Windows Defender / Search Indexer — both confirmed
running during failed installs on a dev machine) intercepts npm's file
operations. Consequences observed and measured, worst first:

- `npm ci` / `npm install` **fail outright** with `ENOTEMPTY`/`EPERM` when the
  scanner holds a handle during a delete/rename.
- Extraction **into a brand-new empty directory** still sprays
  `npm warn tar TAR_ENTRY_ERROR ENOENT/UNKNOWN` warnings — proof the scanner
  intercepts file *creates*, not just deletes. Usually non-fatal, but it has
  produced an exit-0 install with `react` missing entirely.
- Installs that take ~5 minutes on a quiet machine took **13+ minutes per
  attempt** under sustained scanning.

`scripts/ensure-deps.mjs` defends in layers:

1. **Rename-then-delete** for clearing `node_modules` (same pattern
   `launch.mjs` uses for `.next`): renaming the top directory is instant when
   possible; deleting the renamed `node_modules.stale-*` leftover happens
   off the critical path and tolerates failure (swept on later runs). A locked
   rename falls back to a retried in-place delete, and a failed delete is
   *survived*, not crashed on — npm reconciles in place as a last resort.
2. **Verified success**: exit 0 is not trusted; `next`/`react` presence is
   checked after every attempt, and the integrity marker is recomputed from
   the files' hashes **at write time** (it was once captured pre-install,
   which made every lockfile-regenerating install loop forever).
3. **Failure classification** from npm's own debug log (waiting for it to
   flush, and only accepting a log newer than the attempt): a lockfile
   out-of-sync error (`EUSAGE`) goes **straight** to `npm install` to
   regenerate the lock — retrying `npm ci` against a stale lock can never
   succeed. File-lock errors retry.
4. **Fail-fast on sustained interference**: when an attempt ground on for
   over 3 minutes and still died on a file lock, more retries provably waste
   time (measured: 3 × ~13 min, all ENOTEMPTY) — the script stops and prints
   the actual fix instead.

The actual fix — run once in an **Administrator** PowerShell; it excludes only
this project folder from real-time scanning and makes every install several
times faster:

```powershell
Add-MpPreference -ExclusionPath "D:\path\to\Image-Express"
```

## Removing a dependency

A package is removed only when nothing imports it and nothing resolves it by
name (test environments, PostCSS plugins and CSS `@import` all count as usage).
These are kept despite having no `import` statement, and must not be "cleaned up":

- `jest-environment-jsdom` — resolved by name from `testEnvironment: 'jsdom'`
- `tailwindcss` — loaded via `@import "tailwindcss"` in `src/app/globals.css`
- `ts-node` — how Jest loads the TypeScript `jest.config.ts`

## Out of scope

[mobile-companion/](../mobile-companion) is a separate Expo workspace with its
own lockfile. Dependabot is configured for `/` only, so its tree is not scanned
and is not covered by these overrides.
