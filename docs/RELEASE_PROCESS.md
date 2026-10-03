# Release Image Express

## What a release produces

The Release workflow verifies the app, packages Windows/Linux and both native Mac
architectures, tests the packages, and creates a **draft GitHub Release** for a `v*` tag.
It includes installers, updater ZIPs/metadata, a Mac installation guide, SHA-256
checksums, and a CycloneDX SBOM. A manual workflow run on `main` produces artifacts
without creating a release. Publishing the draft makes installers and updates public.

## One-time Mac signing setup

Use an Apple Developer Program account. In Apple's developer portal, create a
**Developer ID Application** certificate. Export the certificate **with its private key**
from Keychain Access as a password-protected `.p12`. A Mac App Store distribution
certificate is not a substitute. Encode the `.p12` as base64 for `CSC_LINK`.

Create an App Store Connect API key permitted to notarize software, and keep its
downloaded `AuthKey_*.p8`, key ID, and issuer ID. Add these repository **Actions secrets** at
[GitHub Settings](https://github.com/GeekatplayStudio/Image-Express/settings/secrets/actions):

| Secret | Value |
|---|---|
| `CSC_LINK` | Base64-encoded Developer ID Application `.p12`, including its private key |
| `CSC_KEY_PASSWORD` | The `.p12` export password |
| `APPLE_API_KEY` | Full contents of `AuthKey_*.p8` |
| `APPLE_API_KEY_ID` | API key ID |
| `APPLE_API_ISSUER` | App Store Connect issuer ID |

Do not commit these files, put them in release notes, or paste them into support messages.
The workflow writes the `.p8` secret to a private temporary file and passes its path
to electron-builder. It imports the certificate, signs with hardened runtime enabled,
and uses electron-builder's notarization integration to submit and staple the app.

Missing credentials stop a release package job. Signing must succeed (`forceCodeSigning`),
and the Mac installation gate requires `codesign --verify`, `stapler validate`, and
Gatekeeper `spctl --assess` to pass. **Desktop smoke** is a separate workflow for
internal unsigned testing and does not prove that a download passes Gatekeeper.

[Apple Developer ID](https://developer.apple.com/developer-id/) ·
[Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

## Windows signing and release environment

The all-platform release also requires `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`
for the existing file-based Authenticode integration. If your certificate uses a hardware
token/cloud signer, configure the corresponding electron-builder integration first;
do not use the Mac certificate on Windows. Missing Windows credentials block that job.

The draft job targets the `production-release` GitHub environment. Configure required
reviewers there if your repository requires a release review.

## Cut a release

1. Check that `main` CI and Desktop smoke pass, including both Mac architectures.
2. Bump the app version and lockfile together, update `docs/CHANGELOG.md`, and commit.
3. Run `npm ci`, `npm run audit:dependencies`, and `npm run verify`.
4. Tag the exact tested commit with `v` plus the package version and push the tag.
   For example, for package version `0.2.2`:

   ```bash
   git tag -a v0.2.2 -m "Image Express 0.2.2"
   git push origin v0.2.2
   ```

5. Wait for Release. Approve the environment job if configured, then inspect the draft.
6. Complete the manual Mac checks below and the Windows/Linux installation checks.
7. Publish the draft. Update the README's release-availability note only after the
   downloadable installers are actually public.

Never reuse a tag or overwrite an installer already offered by the updater.
Installer versions and updater metadata must agree. Build Mac arm64 and Intel on
matching runners; the collector combines `latest-mac.yml` so both ZIP URLs survive.

## Mac acceptance checklist (record results for each architecture)

Use a normal user account on an Apple Silicon Mac and an Intel Mac with supported
macOS. No Node, npm, Git, Homebrew, or developer tools should be necessary.

- Download the draft DMG through Safari or Chrome, preserving macOS quarantine.
- Open it in Finder. Read **Start Here.txt**, open Image Express, approve the normal
  first-open confirmation, and click **Install and Open**. Check the Dock/Finder flow.
- Test the alternate drag-to-Applications method and canceling installation.
- Eject the image, disconnect the network, and open the installed editor from the Dock.
- Save a project, quit with ⌘Q, reopen, and verify it is still editable.
- Test replacement while an older copy is running, then after quitting it.
- Test an N-1 → N update and verify projects, assets, settings, and optional AI installs.
- Confirm that restricted installation permissions show a useful message.
- Record Mac model/chip, macOS version, artifact SHA-256, results, and any warnings.

The automated Mac test covers DMG extraction, native architecture, a read-only bundle,
first/repeated startup without developer tools on PATH, data retention, and (for Release)
signature/ticket/Gatekeeper assessment. It does not click Finder dialogs or prove the
experience on every macOS version. Do not describe internal unsigned test artifacts as
signed, notarized, or ready for novice users.
