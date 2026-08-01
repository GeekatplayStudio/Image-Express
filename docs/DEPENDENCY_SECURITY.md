# Dependency security policy

How advisory alerts are resolved and kept resolved in this repository.

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

Only two advisories are currently waived, both dev-only and both because the
suggested version is not installable:

- **brace-expansion / GHSA-mh99-v99m-4gvg.** The patched backports `1.1.17` and
  `2.1.3` are pinned, but the advisory range is the flat `<=5.0.7`, so scanners
  keep reporting them. `5.0.8` cannot be forced everywhere: 5.x dropped the
  callable default export, so `minimatch@3` and `minimatch@9` fail with
  `expand is not a function`, and those are required by eslint, jest and
  electron-builder. Clearing the alert outright needs upstream tooling to move
  to `minimatch@10`.
- **cacheable-request / GHSA-8x6c-cv3v-vp6g.** Withdrawn upstream in 2023. It
  proxied the `http-cache-semantics` ReDoS, which is pinned to `^4.2.0`.
  `cacheable-request@10+` is ESM-only while its consumer `got@11` is CommonJS.

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

npm 11 blocks package install scripts unless the package is listed in
`allowScripts`. This repo deliberately keeps that default-deny in place — no
`allowScripts` entry exists — so `npm ci` prints an `allow-scripts` warning for
seven packages. Each was checked rather than assumed:

| Package | Script does | Why it stays blocked |
|---|---|---|
| `electron` | downloads the Electron binary | Provisioned explicitly by `npm run electron:ensure`, so web installs skip a several-hundred-MB download they never use |
| `canvas` | builds/downloads a native binding | Only reachable through `fabric`'s and `jsdom`'s optional Node canvas support; nothing renders server-side |
| `onnxruntime-node` | downloads native ONNX runtime | `@huggingface/transformers` is used **only** in the browser (WebGPU/WASM) — see `clipEmbedder.ts` and `threeDLayer/depth.ts` |
| `electron-winstaller` | selects a 7-zip build | Squirrel target only; this app ships NSIS |
| `core-js` | prints a funding notice | No build effect |
| `protobufjs` | generates CLI helpers | Runtime library path does not need them |
| `unrs-resolver` | verifies a napi binding | ESLint resolves fine without it |

Verified with all of `npm run lint`, `typecheck`, `test`, `build`,
`desktop:pack`, `desktop:verify-package` and `desktop:smoke-package` passing on
a clean `npm ci`. Approve a package (`npm approve-scripts <pkg>`) only after
re-checking that the build genuinely needs it.

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
| `"glob@10": "^13.0.6"` | `glob@10.5.0` under jest | Scoped to the 10.x line so `rimraf@2`'s callback-based `glob@7` is left alone. Verified by 148 suites / 864 tests plus coverage |

### Structurally unfixable

Checked against every version each package has ever published (`npm view <pkg>
versions`), not just `latest` — the distinction matters, because "latest" can
lag behind an unpublished fix, but here there is nothing to lag behind:

| Deprecated | Reached through | Why no override helps |
|---|---|---|
| `lodash.isequal@4.5.0` | `electron-updater` | **23 versions have ever been published; 4.5.0 is the last one.** The deprecation asks consumers to switch to `node:util.isDeepStrictEqual` — an API change only electron-updater can make |
| `whatwg-encoding@3.1.1` | `fabric → jsdom` | **10 versions have ever been published; 3.1.1 is the last one**, deprecated in favour of a different package (`@exodus/bytes`). Nothing to upgrade to |
| `rimraf@2.6.3`, and the `glob@7.2.3` + `inflight@1.0.6` it drags in | `electron-builder → app-builder-lib → electron-builder-squirrel-windows → electron-winstaller@5.4.4 (latest) → temp@0.9.4 (latest)` | `temp`'s latest release still pins `rimraf: ~2.6.2`. **rimraf 3.x is also deprecated with the identical message** — jumping to it buys nothing; only 4+ is clean, but 4+ replaced the callback API `temp` calls, so forcing it breaks directory cleanup during Squirrel packaging. Same story for glob: **7.x and 8.x are both deprecated**; only 9+ is clean, which is the same API break. `inflight` has had exactly one release, ever — there is no newer version to move to. The Squirrel package itself cannot be dropped: checked its newest release (26.15.7, one patch ahead of what we use) and it still requires `electron-winstaller`; it is also a **non-optional peerDependency** of `app-builder-lib`, installed even though this app ships NSIS, not Squirrel |

The rule these follow: an override can change a version, it cannot change an
API or remove a dependency. When the latest published version *is* the
deprecated one, the warning can only be retired by the parent package.

Re-check this table whenever `electron-builder`, `electron-updater`, `jsdom` or
`jest` move a major.

## Windows install failures (`ENOTEMPTY`, `EPERM`, `TAR_ENTRY_ERROR`)

`npm ci` deletes and rebuilds `node_modules` itself, reconciling against
whatever is already on disk. A real-time antivirus scanner or the Windows
Search Indexer can be holding a handle on a file inside `node_modules` at that
exact moment — both were confirmed running during an install that failed this
way — and npm's own delta-uninstall then exits non-zero:
`ENOTEMPTY: directory not empty, rmdir '...\node_modules\core-js\modules'`.
The many `npm warn tar ... ENOENT` lines that usually surround it are
non-fatal extraction warnings from the same race and are not themselves the
failure.

`scripts/ensure-deps.mjs` handles this at the source rather than papering over
it: it removes `node_modules` itself with Node's own retry/backoff-capable
`fs.rmSync` (`maxRetries`/`retryDelay` exist in that API specifically for this
Windows failure mode) before invoking `npm ci`, turning every install into a
clean extract-into-empty-directory instead of a reconcile-against-a-possibly-
locked-tree. If an install still doesn't leave a working tree (`npm ci` exits
non-zero, or exits 0 but `next`/`react` are missing — seen on this machine),
the whole attempt retries up to three times with full, un-suppressed npm
output on every attempt before failing.

An admin can eliminate the underlying race by excluding the project folder
from real-time scanning (optional, only ever speeds installs up):

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
