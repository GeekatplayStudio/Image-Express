# Desktop packaging and runtime

For end-user instructions, use [Mac installation](MAC_INSTALL.md) or the
[installation guide](INSTALLATION.md). The source bootstrap scripts are developer tools.
Installer availability is determined by the files on the
[published Releases page](https://github.com/GeekatplayStudio/Image-Express/releases).

## Packages

| Platform | Package | Installation |
|---|---|---|
| macOS 13+, Apple Silicon | `ImageExpress-<version>-arm64.dmg` | Open app → Install and Open, or drag to Applications |
| macOS 13+, Intel | `ImageExpress-<version>-x64.dmg` | Same steps |
| Windows x64 | `ImageExpress-Setup-<version>.exe` | One-click per-user NSIS, shortcuts, launch after install |
| Linux x64 | `.AppImage` / `.deb` | Native package |

Mac ZIPs and updater metadata also ship; users should download the DMG. Each Mac
architecture is built on a matching runner so native dependencies match the app.
The release collector merges the two Mac updater manifests instead of overwriting one.

## Mac installation behavior

Before starting the server, `electron/macInstallation.js` checks whether the packaged
app is in Applications. If it is outside Applications, **Install and Open** delegates
the move and relaunch to Electron's `app.moveToApplicationsFolder()`. Cancel quits;
a failed move explains the drag installation method. Replacement requires confirmation,
and a running installed copy must be quit first. Installed apps and development builds
do not show the installation prompt.

macOS can still show its normal first-open confirmation or request installation
authorization. We do not remove quarantine attributes or disable Gatekeeper.
The DMG includes an Applications shortcut and **Start Here.txt**.

## Runtime and storage

Electron starts the Next.js standalone server as a child process using its own
binary and `ELECTRON_RUN_AS_NODE`. End users do not install Node, npm, Git, or Homebrew.
The shell selects an available local port starting at 3927 and opens the app window.
Optional local AI runtimes and models are separate installations.

Projects, assets, settings, logs, and optional ComfyUI installs live under the OS
user-data directory, outside the application bundle:

- macOS: `~/Library/Application Support/Image Express/`
- Windows: `%APPDATA%/Image Express/`
- Linux: `~/.config/Image Express/`

Structured startup logs are in `logs/desktop.jsonl`. Legacy `creative-flow` data is
copied to the branded directory when needed. Replacing the app preserves user data;
uninstalling does not delete that data by default.

`next.config.ts` excludes local assets, secrets, source workspaces, and old package
output from standalone tracing. Packaging explicitly includes `.next/static`, public
resources, Next/React runtime modules, the isolated updater runtime, and optional
AI installer scripts. `desktop:verify-package` checks required contents and rejects
known data leaks or a standalone tree larger than 400 MB.

## Updates

Packaged apps use `electron-updater` and published GitHub Releases. The app checks
shortly after startup and every six hours, downloads available updates, and reports
when a restart can apply them. Draft releases are not offered to users.
Source checkouts instead use `npm run update`; do not mix these mechanisms.

## Build and test

Use Node 24+ and npm 11. Install the locked dependencies with `npm ci`.

```bash
npm run test:packaging
npm run desktop:pack
npm run desktop:verify-package
npm run desktop:smoke-package
```

On a Mac, build for its native architecture (`--arm64` or `--x64`):

```bash
npm run desktop:dist:mac -- --arm64 --publish never
npm run desktop:smoke-mac-install -- --signed
```

Signing needs the credentials in [RELEASE_PROCESS.md](RELEASE_PROCESS.md).
For internal development only, Desktop smoke CI explicitly uses ad-hoc signing
with hardened runtime disabled; it does **not** claim Gatekeeper approval.
Release builds require Developer ID signing, notarization, and Gatekeeper assessment.

The Mac installation test mounts the actual DMG read-only, checks its instructions
and Applications link, copies the app to a path with spaces, ejects the DMG, makes
the installed bundle read-only, launches twice with developer tools removed from PATH,
and checks that saved data survives. Signed tests also verify signatures, the stapled
notarization ticket, and Gatekeeper with a download-quarantine attribute present.
The smoke app uses a fresh temporary user profile and skips only the interactive
installation prompt and automatic network update check.

These automated checks do not replace the browser/Finder acceptance test on a clean
Mac described in the release checklist. A Windows build cannot establish Mac compatibility.
