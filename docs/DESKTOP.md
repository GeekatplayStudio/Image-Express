# Image Express — Desktop & Install Modes

Image Express runs in three ways. All three share the same code, the same setup
wizard, and the same theme/ambience pack system.

No native artifact is published to GitHub Releases yet (the release workflow
produces them — see "Building the installers" below — but nothing has been
published from it). Until that changes, **`install.bat` / `install.command`
are the primary user-facing install path**, including for non-technical
users: double-click, answer a few questions, done. See the README and
[INSTALLATION.md](INSTALLATION.md) for the exact walkthrough, including the
macOS Gatekeeper workaround.

Once a native artifact is published, it will look like this:

| Artifact | What it does |
|---|---|
| `ImageExpress-Setup-<version>.exe` | Windows per-user application installer |
| `ImageExpress-<version>-<arch>.dmg` | macOS drag-to-Applications installer |
| `ImageExpress-<version>-x64.AppImage` / `.deb` | Linux application packages |

| Mode | Who it's for | How |
|---|---|---|
| **Source bootstrap** (current recommended path) | Everyone, including non-technical users | `install.bat` / `install.command` |
| **Desktop app** (not yet published) | Everyone, once released | Download one native artifact from Releases |
| **Server (web app)** | Teams hosting it themselves | `npm run build && npm run start` behind any reverse proxy |

## Source bootstrap (`install.bat` / `install.command`)

A single small self-contained file (the Windows one embeds its PowerShell body
after a `#PS1#` marker — no companion files). Nothing is bundled; everything is
downloaded on demand. Re-running updates an existing install instead of
overwriting it, and if the file is double-clicked *inside* an existing checkout
it installs in place. **Fully tested end-to-end** (fresh clone → install →
`start.bat` → app answering HTTP 200):

1. Installs **Git** and **Node 24+** if missing (winget / Homebrew). If a supported
   Node is already installed but shadowed on `PATH` by a version manager
   (nvm/nvm4w, volta, fnm, asdf), the installer finds and uses it rather than
   installing another copy.
2. **Shallow-clones** the app from GitHub (`--depth 1`, no history, no submodules —
   the ComfyUI custom-node submodules and all models/assets stay out; the repo has
   **zero tracked files over 1 MB**).
3. `node scripts/ensure-deps.mjs --force` + `npm run qa:install` verification.
4. Chains into the interactive super-installer: ComfyUI local install? Ollama?
   (models always opt-in, never default).
5. Theme-pack support note (gumroad), desktop shortcut prompt, launch prompt.

## Updates

- **In-app**: Settings → Updates shows the running commit; "Update Now" applies
  `git pull --ff-only` + dependency install via `POST /api/system/update`
  (refuses on a dirty tree), then asks for a restart.
- **Auto-check**: on every app start (6 s after load) the app checks the remote
  and offers the update in a dialog. Toggle: "Check for updates automatically
  when the app starts" in Settings → Updates (localStorage
  `image-express-update-autocheck`).

## Bundled built-in themes

`public/themes/` ships with the app (committed): **Clarity — High Contrast**
(low-vision: AAA contrast, thick borders, bold yellow focus rings) and
**Rococo** (soft pastel salon: cream, muted rose/sage, gilded double-border
buttons, serif type). Built-ins are listed from `public/themes/*/theme.json`,
served statically at `/themes/<id>/`, can't be uninstalled, and their ids can't
be shadowed by installed packs.

## Desktop architecture

The desktop app is an Electron shell ([electron/main.js](../electron/main.js)) that
boots the **Next.js standalone server inside the Electron process** — no separate
Node install, no terminal, nothing for the user to configure:

- `next.config.ts` uses `output: "standalone"` with an extensive
  `outputFileTracingExcludes` list — runtime data, local user assets (`public/assets`),
  authoring workspaces, `.git`, and packaging output must never ship. Keep that list
  updated when adding new root-level folders.
- On launch the shell picks a **free port automatically** (starting at 3927,
  scanning upward), then runs the standalone server as a **child Node process**
  (Electron's own binary via `ELECTRON_RUN_AS_NODE`) — never `require()`d
  in-process, which hangs with Next 16 turbopack builds. A server crash cannot
  take the shell down, and a busy port can never break startup.
- Startup diagnostics are appended to `%APPDATA%/creative-flow/startup-trace.log`
  (and `startup-error.log` on failures) — the first thing to ask a user for when
  the desktop app misbehaves.
- electron-builder gotcha: `extraResources` entries silently skip `node_modules`
  and dot-directories — that's why `.next/standalone/node_modules`,
  `.next/standalone/.next`, and the full `next/dist/compiled/next-server` runtime
  are copied via their own explicit entries in package.json `build`.
- Auto-updates via `electron-updater` (checks shortly after startup and every
  6 hours; download + install are user-confirmed from the in-app updater UI).
- Installed theme/ambience packs live in the app's working `data/` directory and
  survive updates.

## Building the installers

```bash
npm run desktop:dist:win   # → dist/ImageExpress-Setup-<version>.exe  (one-click NSIS)
npm run desktop:dist:mac   # → dist/ImageExpress-<version>-<arch>.dmg (run on macOS)
npm run desktop:pack       # unpacked build in dist/ for smoke-testing (no installer)
npm run desktop:verify-package   # asserts package contents and size budget
npm run desktop:smoke-package    # launches the packaged app and waits for its window
```

Every `desktop:*` script first runs `scripts/ensure-electron.mjs`, which
downloads the Electron runtime binary on demand. Dependency installs
deliberately skip that download (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`) so a
web-only install stays fast, and npm 11 blocks the package's install script
anyway — see [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md).

`desktop:verify-package` is the guard against packaging regressions. Next.js
traces the whole project root into `.next/standalone` (`appPaths.ts` resolves
from `process.cwd()`), and `extraResources` copies that into the installer, so
anything missing from `outputFileTracingExcludes` in `next.config.ts` ships to
users. That once put `3d-models/`, previous `dist-*` builds and `tree.glb`
inside the app — a 2.6 GB package. The verifier now fails on known-bad entries
and on a 400 MB standalone budget (a healthy build is ~120 MB).

- The Windows installer is **one-click**: no directory prompts, no options,
  launches the app when done (`nsis.oneClick` in package.json `build`).
- macOS dmg targets both `x64` and `arm64`.
- Code signing: unsigned builds work but trigger SmartScreen/Gatekeeper warnings.
  For distribution, set the standard electron-builder env vars
  (`CSC_LINK`/`CSC_KEY_PASSWORD`, and notarization credentials on macOS).
- Auto-update feed: add a `publish` block (e.g. `{ "provider": "generic",
  "url": "https://<your-host>/updates" }`) to `build` in package.json and upload
  the artifacts + `latest.yml` from `dist/` there.

## First-run setup wizard

The in-app wizard (Settings → Open Setup Wizard; auto-opens on first run) walks
users through everything — accompanied by an animated border-collie assistant
with step-by-step quips:

1. **Welcome** — what will and won't be configured.
2. **Asset Storage** — local / hybrid / cloud.
3. **Cloud Connection** — Google Drive today; other providers listed as planned.
4. **API Keys** — optional provider keys (stored locally, never sent to us).
5. **Runtime Check** — detects Ollama / ComfyUI / other local AI dependencies and
   installs anything missing **silently in one click** via the built-in installer
   (`/api/runtime/installer`).
6. **Extras** — optional theme packs & animated super packs (with previews) that
   support development: https://geekatplay.gumroad.com/
7. **Finish** — summary of everything configured.

## npm / server modes

- `install.bat` (Windows) / `install.command` (macOS) — checks/installs the right
  Node version and dependencies.
- `start.bat` / `start.command` — builds if needed and launches the local server +
  opens the browser.
- Server deployments: `npm run build && npm run start` (respects `PORT`), or use
  the standalone output (`.next/standalone`) in a container.
