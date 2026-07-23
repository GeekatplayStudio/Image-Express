# Image Express One-Click Distribution Roadmap

Date: 2026-07-23  
Status: P0 foundation implemented; signing and cross-platform release validation remain

## Goal

A person who does not understand Git, Node.js, npm, terminals, or source code should be able to:

1. open the Image Express download page;
2. download one file appropriate for their operating system;
3. double-click it;
4. complete a familiar signed installer;
5. launch Image Express from the Start menu, desktop, Applications folder, Dock, or application
   launcher;
6. receive safe updates without losing projects or settings.

The user should not install development tools or compile the application.

## Important product decision

There cannot be one executable file that runs natively on every operating system. Windows,
macOS, and Linux require different formats, architectures, signing systems, and installation
behavior.

“One click on any platform” should mean:

- one simple download page;
- automatic operating-system detection;
- one recommended file per supported platform;
- the same product behavior and branding after installation.

Recommended files:

| Platform | Primary download | Secondary |
|---|---|---|
| Windows 10/11 x64 | signed `ImageExpress-Setup-x.y.z.exe` | portable zip only if requested |
| macOS Apple Silicon | signed/notarized `ImageExpress-x.y.z-arm64.dmg` | zip for updater |
| macOS Intel | signed/notarized `ImageExpress-x.y.z-x64.dmg` | zip for updater |
| Linux x64 | `ImageExpress-x.y.z.AppImage` | `.deb` for Ubuntu/Debian |

Windows arm64 and additional Linux architectures can be added after demand and test capacity
justify them.

## Why the installer must contain the built application

The current `install.bat` and `install.command` download source code, install Git and Node, run
`npm install`, optionally install local AI runtimes, build the app, and launch a web server.
That is a useful contributor bootstrap, but it is not a reliable consumer installer.

Consumer installation must not:

- require GitHub to be online after the installer is downloaded;
- install Git or Node globally;
- execute the newest unverified source from `main`;
- compile on the user's machine;
- depend on Homebrew, winget, Xcode Command Line Tools, PowerShell policy, shell executable bits,
  npm registry health, or native module toolchains;
- ask about ComfyUI/Ollama before the core application has launched;
- expose terminal windows during normal start;
- rebuild every time the user launches.

The native installer should contain a tested, versioned application artifact. “Get the latest”
is handled by the release page and signed auto-updater, not by `git pull`.

## P0 implementation completed on 2026-07-23

- A native Electron package contains the tested Next.js standalone application. End users do not
  need Git, Node.js, npm, Homebrew, winget, or a terminal.
- Windows uses a one-click per-user NSIS installer, macOS uses DMG/zip, and Linux uses AppImage
  plus Debian package targets.
- A tag-driven GitHub Actions release workflow builds all three operating-system families,
  generates update metadata, checksums, and an SBOM, and creates a protected draft release.
- The application has a custom product icon and a configured GitHub update provider.
- Mutable data is stored under Electron's OS user-data directory. A non-destructive migration
  moves legacy desktop state into the branded `Image Express` location and migrates bundled
  assets/data only when their destination is empty.
- Privileged local maintenance routes use explicit runtime profiles. Desktop calls require a
  random per-launch capability token; self-hosted deployments cannot invoke machine-maintenance
  operations.
- Docker persistence is rooted in `/data` and the server binds loopback explicitly for local use.
- A package verifier asserts the Electron shell, isolated updater dependencies, Next standalone
  server, static resources, and public resources.
- The complete source gate passes: lint has no errors, production type-check succeeds, all 122
  test suites pass (755 tests passed, one skipped), and the optimized build succeeds.
- A fresh unsigned macOS arm64 package was structurally verified and smoke-tested to HTTP 200.
  Its installed size is approximately 419 MB, reduced from an initially detected 1.3 GB package.

## Current state

Implemented:

- Electron shell;
- Next.js standalone build;
- electron-builder NSIS, DMG/zip, and AppImage targets;
- loopback desktop server with dynamic port selection;
- startup logs;
- Windows one-click NSIS options;
- updater UI bridge and event handlers;
- source bootstrap scripts;
- Docker build.

Verified during this audit:

- `npm run build` succeeds;
- `npm run desktop:pack` succeeds on macOS arm64;
- the packaged app starts and responds with HTTP 200;
- the generated macOS `.app` is approximately 419 MB.

Missing or incomplete:

- no Git tags or release history;
- GitHub release workflow is implemented but has not yet run from a release tag;
- no signed Windows artifacts;
- no signed/notarized macOS artifacts;
- Linux artifact verification must run on the release runner;
- GitHub is configured as the update provider; the feed becomes live with the first published
  release;
- no packaged-artifact E2E test in CI;
- no clean-machine installer tests;
- no rollback/recovery process.

## Target installation experience

### Windows

1. User clicks **Download for Windows**.
2. Browser downloads one signed `.exe`.
3. User double-clicks it.
4. Windows displays the verified publisher.
5. Installer installs per-user without administrator rights where possible.
6. It creates Start menu and optional desktop shortcuts.
7. It launches Image Express.
8. Future launches use the installed app icon with no console.

Recommended NSIS behavior:

- assisted one-page installer is preferable to a completely silent installer for trust;
- show install progress, version, publisher, and destination;
- per-user installation by default;
- optional desktop shortcut, Start menu entry always;
- run after finish;
- preserve user data on uninstall by default;
- separate checkbox or later confirmation for deleting all projects/settings;
- write an installation log accessible from the support page.

### macOS

1. User clicks the Apple Silicon or Intel download selected automatically.
2. Browser downloads a signed and notarized `.dmg`.
3. User opens it and drags Image Express to Applications.
4. The first launch opens normally without bypass instructions.
5. Dock icon and application icon use Image Express branding.
6. Updates are signed and applied through the app.

The goal is to eliminate “right-click Open,” `xattr`, Terminal, and Gatekeeper workaround
instructions. That requires an Apple Developer ID certificate and notarization.

### Linux

1. User downloads an AppImage.
2. A small instruction explains how to mark it executable if the desktop environment requires
   it.
3. Ubuntu/Debian users can choose a `.deb` that adds an application-menu entry.

Linux packaging varies substantially. Publish the tested distributions and desktop environments
rather than promising every Linux system.

## Required architecture changes before public installers

### 1. Persistent user-data root

This is the first blocker.

Packaged source/resources are read-only. Mutable data must be rooted in an operating-system
location:

| Data | Windows | macOS | Linux |
|---|---|---|---|
| settings/database | `%APPDATA%\Image Express` | `~/Library/Application Support/Image Express` | `$XDG_CONFIG_HOME/image-express` |
| large assets/projects | `%LOCALAPPDATA%\Image Express` or Documents | `~/Library/Application Support/Image Express` or Documents | `$XDG_DATA_HOME/image-express` |
| cache | `%LOCALAPPDATA%\Image Express\Cache` | `~/Library/Caches/Image Express` | `$XDG_CACHE_HOME/image-express` |
| logs | application data logs directory | `~/Library/Logs/Image Express` | `$XDG_STATE_HOME/image-express/logs` |

Exact choices should follow Electron's `app.getPath` values rather than manually constructing
paths.

Implementation:

1. Add a typed path/config module shared by all server persistence adapters.
2. Electron resolves paths from `app.getPath(...)`.
3. Electron passes them to the child server through environment variables.
4. Server code never uses `process.cwd()` for user data.
5. Docker uses `/data` with a documented volume.
6. Development uses an ignored local data root.
7. Add migration from legacy `public/assets` and `data`.

### 2. Runtime capability profiles

Set an explicit profile at startup:

- `IMAGE_EXPRESS_RUNTIME=desktop-local`;
- `IMAGE_EXPRESS_RUNTIME=developer-local`;
- `IMAGE_EXPRESS_RUNTIME=self-hosted`.

Desktop-only actions must require a random capability token generated by Electron at launch.
Self-hosted mode must disable Git update, npm dependency mutation, local installer, and other
host-machine management routes.

### 3. Correct packaged dependencies

`electron-updater` must be included in the Electron app bundle. Do not catch its absence and
silently present an unavailable production feature.

Add a packaging assertion that opens `app.asar` and verifies:

- Electron main/preload files;
- `electron-updater` and required dependencies;
- product icon;
- Next standalone server;
- `.next/static`;
- bundled public resources;
- version and update configuration.

### 4. Branding

Create production assets:

- Windows `.ico` containing required resolutions;
- macOS `.icns`;
- Linux PNG icon set;
- installer/sidebar/background artwork if desired;
- stable app name, bundle ID, publisher name, copyright, and protocol/file associations.

The current package uses Electron's default icon and must not ship publicly that way.

### 5. Versioning

Use SemVer and Git tags:

```text
0.3.0-alpha.1
0.3.0-beta.1
0.3.0
```

The release version must be the same in:

- `package.json`;
- app About screen;
- installer filename;
- Electron bundle metadata;
- update metadata;
- Git tag and GitHub Release.

Commit count can remain diagnostic metadata but should not be the public update version.

## Automated release pipeline

Create `.github/workflows/release.yml`, triggered by a version tag or manual draft release.

### Pipeline topology

```text
tag vX.Y.Z
    |
    +-- verify source
    |     npm ci
    |     lint
    |     typecheck
    |     unit/integration tests
    |     production build
    |
    +-- Windows runner
    |     package x64 NSIS
    |     sign
    |     install in clean VM
    |     launch and smoke-test
    |
    +-- macOS runner
    |     package arm64 and x64
    |     sign
    |     notarize and staple
    |     mount/install/launch smoke-test
    |
    +-- Linux runner
    |     package AppImage and deb
    |     launch under virtual display
    |
    +-- release
          checksums
          SBOM
          update metadata
          GitHub draft release
          human approval
          publish
```

### Workflow requirements

- use Node 24 and `npm ci`;
- cache npm downloads, never cache final `node_modules` as a release artifact;
- build each native artifact on its native OS;
- store signing credentials only in GitHub encrypted environments/secrets;
- use a protected `production-release` environment requiring approval;
- upload intermediate artifacts for diagnosis;
- generate SHA-256 checksums;
- generate an SPDX or CycloneDX SBOM;
- attach release notes and known issues;
- never publish when lint/tests/smoke checks fail;
- retain artifacts and logs long enough to debug user reports.

### Suggested npm scripts

```json
{
  "typecheck": "tsc --noEmit",
  "verify": "npm run lint && npm run typecheck && npm test -- --runInBand && npm run build",
  "dist:win": "electron-builder --win nsis --x64",
  "dist:mac": "electron-builder --mac dmg zip --x64 --arm64",
  "dist:linux": "electron-builder --linux AppImage deb --x64",
  "test:package": "node scripts/verify-package.mjs",
  "test:desktop-smoke": "playwright test -c playwright.desktop.config.ts"
}
```

Exact scripts can differ, but validation and packaging should be separate so the release job does
not rebuild unpredictably between tests.

## Signing and platform trust

### Windows

Required:

- Authenticode code-signing certificate;
- stable publisher identity;
- timestamp server;
- signing verification in CI (`Get-AuthenticodeSignature` or `signtool verify`).

An EV certificate may improve initial SmartScreen reputation but has higher cost and hardware or
cloud key requirements. Standard code signing is still far better than unsigned distribution.

### macOS

Required:

- Apple Developer Program membership;
- Developer ID Application certificate;
- hardened runtime;
- suitable entitlements;
- notarization;
- staple the notarization ticket to the DMG/app;
- verify with `codesign`, `spctl`, and `stapler validate`.

Do not ask users to bypass Gatekeeper in the primary installation guide.

### Linux

Publish checksums and optionally sign releases with a project signing key. For `.deb`, use a
repository only if the team is ready to maintain its metadata and signing lifecycle.

## Auto-update design

Use GitHub Releases as the initial electron-builder publish provider unless a dedicated update
CDN is required.

Required work:

1. Add the electron-builder `publish` configuration.
2. Include `electron-updater` in the packaged Electron runtime.
3. Upload platform artifacts and generated `latest*.yml`/blockmap metadata.
4. Sign all update artifacts.
5. use stable, beta, and alpha channels deliberately.
6. let users choose automatic checking; downloading/installing must be clear.
7. never update while work is unsaved.
8. verify available disk space before download.
9. preserve user data outside the app directory.
10. log update stages and provide a manual-download fallback.

Recommended UX:

- check after the app becomes usable, not before first paint;
- show version, download size, and release notes;
- download in the background only with user preference;
- prompt **Restart to Update** after the download;
- on failure, keep the current working version;
- expose **Check for Updates** and **Open Release Page**;
- do not mix native release updates with `git pull`.

macOS update support generally uses the signed zip metadata alongside the DMG offered to new
users. Windows uses NSIS update metadata. Verify both in clean-machine tests.

## Installation and update test matrix

Every release candidate should pass:

| Scenario | Windows | macOS arm64 | macOS x64 | Linux |
|---|---:|---:|---:|---:|
| fresh install with no development tools | required | required | required | required |
| launch from OS icon | required | required | required | required |
| create/save/reopen project | required | required | required | required |
| paths with spaces/non-ASCII username | required | required | required | required |
| no network after install | required | required | required | required |
| update from previous stable | required | required | required | required |
| user data survives update | required | required | required | required |
| uninstall preserves projects | required | required | required | required |
| reinstall discovers existing data | required | required | required | required |
| corrupted settings recovery | required | required | required | required |
| port 3927 already occupied | required | required | required | required |
| low disk space | required | required | required | required |
| updater network interruption | required | required | required | required |
| signed/notarized verification | required | required | required | n/a/checksum |

Use clean VMs, not only developer machines. The release should not depend on Git, Node, Python,
Homebrew, winget, Xcode tools, or an npm cache being present.

## First-run experience

Core app first; optional engines later.

Recommended first launch:

1. Welcome and choose local or self-hosted connection mode.
2. Confirm user-data location and backup explanation.
3. Open a sample project or create a blank project.
4. Offer optional AI provider setup from a clearly labeled step.
5. Offer local AI engines from Settings after the app is usable.

ComfyUI, Ollama, Python models, and large downloads must be separate optional components. The
installer should display size, disk location, license/source, and removal instructions before
downloading them.

## Role of the current bootstrap scripts

Keep but reposition:

```text
scripts/bootstrap/install-windows.bat
scripts/bootstrap/install-macos.command
scripts/bootstrap/start-windows.bat
scripts/bootstrap/start-macos.command
```

Audience:

- contributors;
- source-build testers;
- recovery/fallback;
- unsupported platforms where native packages are unavailable.

Improvements if retained:

- use `npm ci`, not `npm install`, for a clean locked install;
- validate npm major version as well as Node;
- do not continue silently after a failed Git update;
- do not run the optional AI installer in the core bootstrap by default;
- bind the local server to `127.0.0.1`;
- create a real native launcher only for source-build mode;
- show checksum/commit information;
- state clearly that this is the source installation, not the recommended consumer path.

For macOS, a downloaded `.command` file commonly loses executable permission and invokes
Gatekeeper concerns. It should never be advertised as easier than a notarized DMG.

## Docker and self-hosted distribution

Docker is not a replacement for the desktop installer and should have its own guide.

Required improvements:

- publish versioned multi-architecture images to GHCR;
- use `/data` as a persistent volume;
- require a unique session secret;
- disable local machine installers, Git updates, and dependency updates;
- document reverse proxy, TLS, upload limits, and backups;
- add a health endpoint;
- run as the existing non-root user;
- scan images for vulnerabilities;
- pin base image by digest in release builds;
- document supported CPU architectures.

Example target:

```bash
docker run --name image-express \
  -p 127.0.0.1:3000:3000 \
  -v image-express-data:/data \
  -e IMAGE_EXPRESS_SESSION_SECRET="<random-secret>" \
  ghcr.io/geekatplaystudio/image-express:0.3.0
```

Public internet exposure should require a documented reverse proxy and authentication setup.

## Support and recovery

Add these application actions:

- **Help -> Open Logs Folder**
- **Help -> Copy Diagnostics**
- **Help -> Open User Data Folder**
- **Settings -> Backup**
- **Settings -> Restore**
- **Settings -> Check for Updates**
- **Settings -> Reset UI Settings**

Diagnostics should include:

- application and OS version;
- architecture;
- runtime profile;
- data/log/cache paths;
- last startup and updater status;
- enabled provider names, never keys;
- recent redacted errors;
- disk-space summary.

Recovery rules:

- keep user projects outside the program directory;
- write important JSON atomically using temp + rename;
- keep a last-known-good settings copy;
- version persisted schemas;
- back up before migrations;
- never delete projects during uninstall by default.

## Phased implementation roadmap

### Phase 0: Make the baseline honest and green

Estimated effort: 2-4 engineering days

- fix lint and all failing Jest suites;
- update CI to Node 24;
- add `typecheck` and a single `verify` command;
- mark native downloads/updates as preview or planned in docs until released;
- record current package size and startup benchmarks;
- choose public supported OS versions.

Exit criteria:

- CI is green on a clean clone;
- documentation has no unverified release claims.

### Phase 1: Protect user data and runtime permissions

Estimated effort: 5-10 engineering days

- implement typed application paths;
- move all mutable storage out of source/package resources;
- implement legacy migration and backup;
- add desktop/developer/self-hosted runtime profiles;
- add Electron per-launch capability token;
- guard privileged routes;
- bind source-local launches to loopback by default.

Exit criteria:

- packaged app can run from a read-only directory;
- save/reopen works;
- update simulation does not touch user data;
- privileged routes reject incorrect runtime/capabilities.

### Phase 2: Produce branded local installers

Estimated effort: 3-6 engineering days

- create icon assets;
- finalize product metadata;
- include all required Electron dependencies;
- produce Windows, macOS arm64/x64, and Linux artifacts;
- add package-content verification;
- add artifact launch smoke tests.

Exit criteria:

- each artifact installs/launches on a clean VM with no development tools;
- no terminal appears;
- app launches from a normal OS icon.

### Phase 3: Signing, notarization, and GitHub Releases

Estimated effort: 4-8 engineering days plus certificate acquisition

- obtain platform signing identities;
- add protected CI secrets/environments;
- create release workflow;
- sign Windows artifacts;
- sign, notarize, and staple macOS artifacts;
- generate checksums and SBOM;
- publish an alpha draft release.

Exit criteria:

- platform verification tools accept every artifact;
- GitHub Release is generated reproducibly from a tag.

### Phase 4: Native auto-update

Estimated effort: 4-7 engineering days

- configure GitHub publish provider;
- package updater dependencies;
- upload update metadata;
- implement channel selection and update UX;
- test update from N-1 to N on all platforms;
- test interruption, insufficient disk, and rejected update.

Exit criteria:

- signed N-1 installs, detects N, updates, restarts, and preserves all user data;
- failed updates leave N-1 usable.

### Phase 5: Public beta hardening

Estimated effort: 1-2 weeks of testing/fixes

- run the full clean-VM matrix;
- test non-ASCII paths, limited users, offline launch, and proxy/firewall conditions;
- add support diagnostics and backup/restore;
- measure package size and lazy-load opportunities;
- publish concise user installation pages;
- recruit beta users with different hardware.

Exit criteria:

- no P0/P1 installer, data-loss, or updater defects;
- support can diagnose failures from redacted logs;
- installation success target is met.

### Phase 6: Stable release and maintenance

Ongoing:

- publish signed stable releases from tags;
- maintain N-1 update coverage;
- monitor crash/support patterns with explicit opt-in;
- rotate and protect signing credentials;
- publish security and release policies;
- regularly test a clean install, update, backup, restore, and uninstall.

## Work breakdown checklist

### Code

- [ ] Add `src/platform/paths` or equivalent path service.
- [ ] Replace user-data `process.cwd()` usage.
- [ ] Add persistence migrations.
- [ ] Add runtime profile configuration.
- [ ] Add local capability authentication.
- [ ] Guard filesystem/process/update/install routes.
- [ ] Bind source launcher to loopback.
- [ ] Include `electron-updater`.
- [ ] Configure update publisher.
- [ ] Add custom icons and metadata.
- [ ] Add atomic settings/project writes.
- [ ] Add backup/restore.

### CI/release

- [ ] Repair current quality gate.
- [ ] Use Node 24.
- [ ] Add Windows/macOS/Linux package jobs.
- [ ] Add package-content assertions.
- [ ] Add clean-install smoke tests.
- [ ] Add signing verification.
- [ ] Add notarization.
- [ ] Add checksums.
- [ ] Add SBOM.
- [ ] Add protected draft-release approval.
- [ ] Add N-1 update tests.

### Product/documentation

- [ ] Decide supported OS versions/architectures.
- [ ] Buy/configure signing identities.
- [ ] Create a simple OS-detecting download page.
- [ ] Simplify README to native downloads first.
- [ ] Move source bootstrap to contributor documentation.
- [ ] Document user-data and backup locations.
- [ ] Document update channels and rollback.
- [ ] Document self-hosted security requirements.
- [ ] Publish privacy and security policies.

## Success metrics

Initial targets:

- at least 95% clean-machine install success during beta;
- median first launch under 10 seconds on supported hardware;
- zero required external development tools;
- zero unsigned public Windows/macOS artifacts;
- zero user projects stored inside the application directory;
- 100% N-1 -> N update success in the automated matrix;
- zero data loss across install/update/uninstall test scenarios;
- support diagnostics produced in under two clicks;
- release pipeline reproducible from a clean tag.

## Recommended next implementation step

Do not start with installer cosmetics. Start with:

1. green CI;
2. the typed user-data path service;
3. runtime capability profiles;
4. persistence migration tests.

Once those foundations pass in a packaged app, build the signed automated release pipeline.
This order prevents a polished installer from distributing an application that cannot safely
store or update user work.
