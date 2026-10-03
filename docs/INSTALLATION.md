# Installation Guide

## Desktop app (recommended)

For Mac, follow **[Install Image Express on your Mac](MAC_INSTALL.md)**.
It covers downloading the correct `.dmg`, **Install and Open**, one-click Dock launch,
Mac security messages, updating, and uninstalling. Requires **macOS 13+**.
No Node.js, Git, Homebrew, or developer tools are needed for the desktop app.

For Windows, get `ImageExpress-Setup-<version>.exe` from the
[official Downloads page](https://github.com/GeekatplayStudio/Image-Express/releases),
double-click it, and use the Desktop or Start menu shortcut next time.
Verify the download and publisher if Windows blocks it; do not ignore malware warnings.

Only files attached to a **published release** are end-user installers. If there is no
installer for your platform yet, wait for the signed release. GitHub's **Source code**
download is intended for developers.

The first-use wizard lets you skip AI setup and start editing. Local ComfyUI/Ollama
and AI models are optional downloads; provider keys are needed only for cloud AI.

Desktop updates come from GitHub Releases. Save your work before accepting a restart.
User files are stored outside the installation, in:

- macOS: `~/Library/Application Support/Image Express/`
- Windows: `%APPDATA%/Image Express/`
- Linux: `~/.config/Image Express/`

Logs are in the `logs` subfolder. Include the app version, OS version, chip/processor,
and exact error in a support report. Review logs for personal information before sharing.

## Source installation (developers)

Install Git, Node.js 24+ (the tested Node 24 version is in `.nvmrc`), and npm 11.x first.
Source installs require a development toolchain and are not the novice desktop path.

```bash
git clone https://github.com/GeekatplayStudio/Image-Express.git
cd Image-Express
npm ci
npm run dev
```

Open `http://localhost:3000`. Use `npm run desktop:dev` to develop the Electron shell.
Use `npm run doctor:node` if your shell selects an older Node installation.

For an existing checkout, `install.bat` (Windows) or `bash install.command` (Mac)
can install dependencies and offer optional local AI setup. On Mac, Git and Node must
already be installed, or Homebrew must be available for Node installation. These scripts
are not signed applications and do not remove macOS download protection.
Setup logs are saved to `~/ImageExpress-setup.log` on Mac or
`%USERPROFILE%/ImageExpress-setup.log` on Windows.

Run later with `start.bat` on Windows or `bash start.command` on Mac.
`npm run launch` works on both. Source launch checks for updates when the tree is clean,
repairs dependencies if needed, and opens a browser.

```bash
npm run update              # update code and dependencies
npm run update -- --check   # check only
npm run update -- --libs    # refresh dependencies within declared ranges
```

The updater refuses dirty working trees and only fast-forwards Git history.
Do not run these source update commands for a packaged desktop installation.

## 1b) Indexing your drives into the Asset Vault

The Asset Vault can index local drives, network shares and folders, then find
assets by meaning with Smart search. **Scanning runs on the server**, so what
is reachable depends on where the app runs -- and the rule is deliberately
different for the two cases:

| Where it runs | Runtime profile | What can be indexed |
|---|---|---|
| Your own computer (desktop app, `npm run dev`, `npm start`) | `desktop-local` / `developer-local` | **Every drive you can see.** The server is your machine, so indexing exposes nothing you could not already open in Explorer/Finder. |
| A server other people reach | `self-hosted` | **Only folders the operator authorised.** The filesystem belongs to the operator, not the visitor. |

The profile is auto-detected (`NEXT_DESKTOP=1` -> desktop, `NODE_ENV=production`
-> self-hosted) and can be forced with `IMAGE_EXPRESS_RUNTIME`.

### On your own computer

Settings -> Storage -> watch roots. The desktop build opens a native folder
picker; in a browser there is no such dialog, so the panel lists your drives as
one-click chips and you can type or paste any path:

```text
D:\Photos\2026
\\NAS\media\renders         (UNC network share)
/Volumes/Archive            (macOS)
```

### On a self-hosted server

Authorise folders explicitly. **Unset means nothing is indexable** -- a
misconfigured server fails closed rather than exposing its filesystem:

```bash
IMAGE_EXPRESS_VAULT_ALLOWED_ROOTS="/srv/media,/mnt/shared"
```

Separate entries with `,` or `;`. Subfolders of an authorised root are allowed;
anything else is refused with HTTP 403, including `..` traversal and lookalike
siblings (authorising `/srv/media` does **not** expose `/srv/media-private`).
The check runs both when a folder is added and again at scan time, so
tightening the allowlist immediately applies to roots that were already saved.

> **Before exposing the app beyond localhost:** the vault API has no
> per-user authentication yet. `start.bat` / `start.command` bind to
> `127.0.0.1`, so a default install is only reachable from your own machine.
> If you put it behind a reverse proxy, set
> `IMAGE_EXPRESS_VAULT_ALLOWED_ROOTS` **and** add authentication in front of
> it.

### Getting search-by-meaning (not just filenames)

A scan stores a hash of the name/path, so Smart search initially behaves like
filename matching. True semantic search needs the enrichment pass, which
captions and embeds each image with a local vision model -- see the Ollama
section below. Enrichment reads files server-side, so it works in the browser
too.

## 2) Optional ComfyUI (Local or Cloud)

### Local ComfyUI (recommended for power users)
1. Install Python 3.10+.
2. Install ComfyUI and start it normally. Image Express proxies local ComfyUI traffic, so CORS flags are usually no longer required.
3. Ensure ComfyUI is reachable at `http://localhost:8188` (or set your custom URL in app settings).

In Image Express:
- Open Generative modal.
- Select `ComfyUI` provider.
- Click `Verify ComfyUI Connection`.
- The app now performs a **catalog sync** (Comfy version + workflow compatibility against registered workflows).
- If you configure local paths in Settings, the app can also scan server template workflows, custom workflow JSON folders, and managed `custom_nodes` / workflow-library repositories.
- For `img2img`, `inpaint`, `outpaint`, and `upscale`, the app exports the selected layer or AI zone as the source image. The visible AI zone overlay is hidden during capture, and nearly blank white captures are rejected before upload so ComfyUI does not receive an empty-looking source frame.

### Local Comfy folders (optional, but recommended)
Configure these paths in Settings when you want the app to inspect or manage your local Comfy workspace:
- `ComfyUI install path`
- `custom_nodes path`
- `workflow library path`

This enables repo install/update flows and custom workflow-folder scanning from the app UI.

- Relative values such as `custom_nodes` or `user\default\workflows` are resolved from the configured `ComfyUI install path`.
- If Image Express runs in Docker, the `ComfyUI install path` must be the path visible inside the container mount, not a host-only drive letter.

If Image Express runs in Docker while ComfyUI lives on the host machine:
- mount those folders into the container,
- use `host.docker.internal` instead of `localhost` for server-side Comfy access when needed.

### Comfy Cloud
- Set `Connection = Cloud`.
- Fill `Comfy Cloud URL` and `Comfy Cloud API Key`.
- Run connection verification.

Optional runtime env bootstrap:
```bash
export COMFY_CLOUD_URL="https://cloud.comfy.org"
export COMFY_CLOUD_API_KEY="your-comfy-cloud-key"
```

- For host runs, `.env.local` can contain those same values.
- For Docker runs, pass the variables with `docker run -e ...`.
- If Comfy Cloud returns `API key authentication is not available for free tier accounts`, the app is configured correctly but that account tier cannot use API-key auth yet.

## 3) Optional Local LLM for Visual Analysis

For local visual-analysis features, a local LLM runtime is optional.

### Option A: Ollama (easiest)
- Install Ollama for your OS.
- Pull a model, for example:
```bash
ollama pull qwen2.5:7b
```
- Keep Ollama running (`http://localhost:11434`).
- In Image Express Settings, save the Ollama base URL and model.
- The toolbar `AI Critique` panel can then review either the selected layer or the full canvas using that local runtime.
- The app validates model availability through `/api/ai/ollama/status` before critique requests are sent.
- If the saved model is missing, the app can now prompt to install it through Ollama from Settings, AI Critique, or the Ollama image-generation flow.
- The **Asset Library**'s optional AI indexing (toggle in its filter bar) reuses this same Ollama connection: it captions and tags new image uploads with any installed vision-capable model (e.g. `qwen2.5vl`, `llava`) so they become searchable by content, not just filename. Basic indexing (dimensions, embedded generation prompts from PNG metadata) always runs and needs no model at all — the vision step is the only part that needs Ollama.
- For mixed host/container setups, keep using your normal Ollama URL. Server-side Ollama routes now retry transient network failures per candidate and also retry `localhost` through `host.docker.internal`, plus `host.docker.internal` back to `localhost`, so the same saved setting works whether Image Express is running on the host or inside Docker on macOS/Windows.

### Option B: LM Studio
- Install LM Studio.
- Download a model and start the local server mode.
- Use the OpenAI-compatible endpoint exposed by LM Studio.

## 4) AI Edit Notes + Flux Klein Routing

When using AI Edit Notes with reference image editing:
- `NanoBanana` provider auto-routes to `nanobanana-2` model payload.
- Banana-backed generation and editing require server configuration for a Banana endpoint:
  - `BANANA_GENERATE_URL` for zone generation
  - optional `BANANA_EDIT_URL` for direct edit jobs, falling back to `BANANA_GENERATE_URL`
  - optional `BANANA_MODEL` override, defaulting to `nanobanana-2`
- `ComfyUI` provider auto-selects `img2img` task and prioritizes Flux Klein image-edit workflow:
  - `image_flux2_klein_image_edit_9b_base`
  - fallback `image_flux2_klein_image_edit_4b_base`
- Payload includes:
  - original image,
  - embedded notes image,
  - combined mask,
  - extracted additional notes text/json.

### Aspect sizing behavior (Comfy + Flux workflows)
- First aspect field is user-driven custom input.
- Model-adapted sizing preview indicates the bucketed render dimensions used for best latent-space alignment.
- If selected model/workflow changes, the UI warns when custom size is not ideal and shows the model-adapted target size.

### Job artifact lifecycle
- Intermediate `job_*` artifacts are treated as temporary working files.
- On completion/failure, upload-side intermediates are cleaned automatically.
- After final result retrieval, the `job_*.json` record is removed.
- Old terminal jobs are pruned automatically (default retention window: 6 hours).

## 5) Troubleshooting

### Install is very slow, or fails with ENOTEMPTY / EPERM / TAR_ENTRY_ERROR (Windows)

That is real-time antivirus scanning (Windows Defender) and/or the Windows
Search Indexer intercepting npm's file operations - `node_modules` holds over
a thousand small packages, and scanning each file as it is written slows the
install several times over and occasionally breaks it mid-write. The
installer detects this, retries brief glitches, and stops with instructions
when the interference is sustained instead of retrying forever.

The permanent fix is one command in an **Administrator** PowerShell (right-
click PowerShell -> "Run as administrator"). It excludes only this project
folder from real-time scanning - the rest of your system stays protected:

```powershell
Add-MpPreference -ExclusionPath "$env:USERPROFILE\ImageExpress"
```

(Adjust the path if you installed somewhere else.) Then run `npm run setup`
again. This is optional - installs succeed without it - but it is the
difference between ~5 minutes and 15-40 minutes on affected machines.


- If `npm` fails in PowerShell due policy, run commands via `npm.cmd`:
```powershell
cmd /c npm.cmd run build
```
- If Comfy workflow compatibility is partial, check the catalog sync message and install missing nodes/models.
- If local Comfy is unreachable, make sure ComfyUI is actually listening on port `8188` or update the saved URL.
- If Comfy server scans fail only on the server side, check whether the app runtime is inside Docker and whether `localhost` should be replaced with `host.docker.internal`.
- If local Comfy folders are unreadable, confirm the configured paths are mounted into the container or that the app is running directly on the host OS.
- If an image-based Comfy task says the captured source is almost blank, move the AI zone over real image content or select an actual image layer before rerunning the task.
- To inspect the exact prepared local Comfy prompt/model/workflow payload, open browser localStorage and read `image-express-comfy-last-request`.
- If `custom_nodes` or workflow scans fail with relative paths, verify that the saved `ComfyUI install path` points at the correct host path or container mount first.
