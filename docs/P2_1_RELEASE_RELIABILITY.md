# P2.1 Release Reliability

Date: 2026-07-23  
Status: first cross-platform release-reliability slice implemented

## Outcome

P2.1 verifies that a produced desktop artifact is more than a correctly shaped archive. The
packaged application must start its embedded Next.js server, load the renderer, record all
readiness checkpoints, and remain free of startup errors.

## Packaged application smoke harness

`npm run desktop:smoke-package`:

1. locates the unpacked native executable produced by electron-builder;
2. starts it with an isolated temporary user-data directory;
3. waits for structured `electron-ready`, `server-ready`, and `window-ready` phases;
4. requires the renderer's `smoke.ready` checkpoint;
5. fails on `startup.error`, an early process exit, or a 60-second timeout;
6. terminates the isolated process tree and removes successful test data.

The smoke environment never displays the application window and is enabled only when
`IMAGE_EXPRESS_DESKTOP_SMOKE=1`. Normal launch, storage, and shutdown behavior are unchanged.

## Cross-platform automation

`.github/workflows/desktop-smoke.yml` packages and launches the real application on:

- Windows;
- macOS;
- Linux under Xvfb.

It runs on relevant pushes and pull requests, can be started manually, and has a weekly
scheduled run. The release workflow runs the same smoke command for every platform before
uploading installer artifacts.

The Linux hosted-runner launch uses Chromium's `--no-sandbox` test flag because the unpacked
`chrome-sandbox` helper cannot be installed setuid-root in an unprivileged CI workspace. This
flag is limited to the explicit smoke process and does not change normal packaged launches.

The structural `desktop:verify-package` check remains in place, so release artifacts must pass
both content inspection and real startup.

## Critical browser journeys

`npm run test:e2e:critical` covers five deterministic Chromium journeys without external AI or
cloud dependencies:

- full-artboard PNG export;
- full-artboard JPEG export;
- full-artboard PDF export;
- two-frame media-overlay ZIP export;
- variant conversion, save, server-side listing, persistence after page reload, PNG export, and
  cleanup.

CI installs the matching Playwright Chromium release and runs these journeys after the unit,
type, lint, architecture, build, and bundle gates.

## Local verification

```bash
npm run test:e2e:critical
npm run desktop:pack
npm run desktop:verify-package
npm run desktop:smoke-package
```

The local macOS arm64 artifact passed all three startup phases. Cross-platform execution is
owned by the new GitHub Actions matrix.

## Next reliability slices

1. Test an installed artifact, not only electron-builder's unpacked directory.
2. Add update-download/apply validation against a private test release channel.
3. Add first-launch, save, quit, reopen, and storage-migration coverage in the packaged shell.
4. Add provider-failure journeys with sanitized deterministic fixtures.
5. Preserve smoke diagnostics as CI artifacts on failure.
6. Validate signed/notarized Windows and macOS artifacts on clean virtual machines.
