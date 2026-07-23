# Image Express Release Process

## Outcome

A version tag produces draft GitHub Release artifacts for Windows, macOS, and Linux:

- Windows x64 NSIS installer;
- macOS arm64 and x64 DMG/zip artifacts;
- Linux x64 AppImage and Debian package;
- native updater metadata and blockmaps;
- SHA-256 checksums;
- CycloneDX SBOM.

The workflow is `.github/workflows/release.yml`.

## Required protected configuration

Create a GitHub environment named `production-release` with required reviewer approval.

Configure signing secrets:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

`WIN_*` values are for Authenticode. `CSC_*` and `APPLE_*` values are for macOS Developer ID
signing and notarization.

Do not publish stable Windows or macOS artifacts when the corresponding signing credentials are
absent. Unsigned artifacts may be used only for internal development.

## Release checklist

1. Confirm `main` is clean and CI is green.
2. Update `package.json` to the intended SemVer version.
3. Update release notes and verify persisted-data migrations.
4. Run locally:

   ```bash
   npm ci
   npm run verify
   ```

5. Create and push an annotated matching tag:

   ```bash
   git tag -a v0.3.0 -m "Image Express 0.3.0"
   git push origin v0.3.0
   ```

6. Approve the protected `production-release` job after all platform package jobs pass.
7. Download the draft artifacts and verify signatures, checksums, install, launch, save/reopen,
   and update from the previous stable release.
8. Publish the draft GitHub Release.

## Local package verification

Build the package for the current operating system, then inspect required contents:

```bash
npm run desktop:pack
npm run desktop:verify-package
```

The verifier requires the Electron entry points, the isolated `electron-updater` runtime,
Next.js standalone server, static files, and bundled public resources.

## Data-safety requirement

Never publish an artifact unless:

- the application runs from a read-only installation directory;
- projects, assets, settings, credentials, logs, and installed packs use the OS user-data root;
- an N-1 installation updates to N without losing user data;
- uninstall preserves user work by default.
