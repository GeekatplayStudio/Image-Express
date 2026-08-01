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

`npm ci` reports six deprecated packages. All are transitive, dev/build-time
only, and carry **no** advisory (`npm audit` reports 0 vulnerabilities). They are
listed here so a reviewer does not re-investigate them each release:

| Deprecated | Reached through | Status |
|---|---|---|
| `glob@7.2.3`, `inflight@1.0.6` | `electron-builder → @electron/asar@3`, `electron-winstaller → temp → rimraf@2`, `jest → babel-plugin-istanbul → test-exclude@6` | Upstream. Our own direct `@electron/asar` is on 4.x (glob@13); electron-builder pins its own copy |
| `rimraf@2.6.3` | `electron-builder → electron-builder-squirrel-windows → electron-winstaller → temp` | Upstream, and only on the Squirrel path this app does not target |
| `glob@10.5.0` | `jest@30` reporters/config/runtime | Upstream; latest Jest still ships it |
| `lodash.isequal@4.5.0` | `electron-updater` | Hard dependency, still present in the newest 6.8.x |
| `whatwg-encoding@3.1.1` | `fabric → jsdom@26` | Current jsdom still depends on it |
| `boolean@3.2.0` | `@huggingface/transformers → onnxruntime-node → global-agent` | Still present in transformers 4.x |

None can be cleared with an `overrides` entry without breaking a consumer — the
`glob` majors are not API-compatible (7 is callback-based, 9+ is not), and the
rest have no drop-in replacement. Re-check when the parent packages move.

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
