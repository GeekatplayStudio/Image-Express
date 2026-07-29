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

## Out of scope

[mobile-companion/](../mobile-companion) is a separate Expo workspace with its
own lockfile. Dependabot is configured for `/` only, so its tree is not scanned
and is not covered by these overrides.
