# Installation Guide (PC & Mac)

This guide is the recommended **easy path** to run Image Express locally, with optional ComfyUI and local LLM setup.

## 1) Core App (Required)

### The installer (recommended — this is the current, working way to install)

No native `.exe`/`.dmg` installer is published yet, so use
[`install.bat`](../install.bat) (Windows) or [`install.command`](../install.command) (macOS) —
these are the real installer, not a fallback. They install Git and Node.js
24+ if you don't have them (or use one a version manager has hidden on
`PATH`), download the app, install its dependencies, verify the build, and
can offer optional ComfyUI/Ollama setup. No terminal knowledge, no
understanding of Git/Node/npm required.

Every step — and any error — is written to a log file you can hand to support if something goes wrong:
- Windows: `%USERPROFILE%\ImageExpress-setup.log`
- macOS: `~/ImageExpress-setup.log`

#### Windows

1. [Open `install.bat` on GitHub](https://github.com/GeekatplayStudio/Image-Express/blob/main/install.bat) and click the **⬇ download icon** near the top-right of the file view.
2. Double-click the downloaded `install.bat` in your Downloads folder.
3. If a blue **"Windows protected your PC"** screen appears, click **More info**, then **Run anyway**. That screen appears for any free/open-source app without a paid Microsoft publisher certificate — it is not a virus warning.
4. Press **Enter** at each question in the window that opens to accept the suggested answer.

#### macOS

The simplest way avoids every Gatekeeper ("unidentified developer") warning
entirely, because it never downloads a file through the browser at all —
paste this one line into **Terminal** (press <kbd>⌘ Cmd</kbd>+<kbd>Space</kbd>, type `Terminal`, press Return):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/GeekatplayStudio/Image-Express/main/install.command)
```

Press Return, then press **Return** again at each question it asks to accept
the suggested default.

**If you'd rather download and double-click the file instead:** get
[`install.command`](https://github.com/GeekatplayStudio/Image-Express/blob/main/install.command)
from GitHub (the **⬇** icon on that page), then in Finder **right-click**
(not double-click) it and choose **Open**. macOS will say it can't verify the
developer — click **Open** anyway; this is normal for any open-source app not
sold through the App Store, not a sign of malware.

If macOS still won't run it — a stronger message mentioning malware, or no
"Open" option is offered — go to **Apple menu → System Settings → Privacy &
Security**, scroll to the blocked-file notice near the bottom, click **Open
Anyway**, confirm with your password or Touch ID, then right-click →
**Open** the file once more in Finder.

If double-clicking does nothing at all (some browsers strip the file's
permission to run), that's exactly what the Terminal one-liner above avoids —
use it instead; it always works.

### Prerequisites (if installing manually instead)
- Node.js 24+ (the repo pins 24.14.1 in `.nvmrc`)
- npm 11.x (ships with Node 24+)
- Git

Check what your shell will actually use — a version manager (nvm, nvm4w, volta,
fnm) often puts an older Node first on `PATH` even when a newer one is
installed:

```bash
npm run doctor:node
```

It prints the running version, the required minimum, and the location of a
supported Node if one is installed elsewhere.

You do not have to fix your shell: `npm run setup`, `npm run build`,
`npm run dev`, `npm start`, `npm run update` and every `desktop:*` script
re-execute themselves under a supported Node when they find one, and use that
Node's npm rather than whatever the shell provides. Only `npm install` run
directly is outside our reach -- it prints npm's own `EBADENGINE` warning and
can write a subtly different lockfile, so prefer:

```bash
npm run setup
```

To fix the shell permanently instead, point your version manager at the pinned
release (`.nvmrc`):

```bash
nvm install 24.14.1 && nvm use 24.14.1
```

### Manual install + run
```bash
git clone https://github.com/GeekatplayStudio/Image-Express.git
cd Image-Express
npm install
npm run dev
```

Open `http://localhost:3000`.

### Desktop Shell (Optional but easy for non-dev users)
```bash
npm run desktop:dev
```

A packaged native installer (one-click `.exe` / drag-to-Applications `.dmg`,
no terminal at all) isn't published yet — see [DESKTOP.md](DESKTOP.md) for how
to build one yourself in the meantime. If the desktop app fails to start,
check its startup log: `%APPDATA%\creative-flow\startup-trace.log` (Windows)
or `~/Library/Application Support/creative-flow/startup-trace.log` (macOS);
failures also write `startup-error.log` next to it.

### Running it again later

Use the matching **start** file in your install folder — no terminal required:

- **Windows**: `start.bat`
- **macOS**: `start.command`

Each run checks for updates, rebuilds only if needed, and opens the app in your browser.

### Updating

Source installs stay current with one command (or automatically on every start):

```bash
npm run update              # pull latest code + refresh npm deps when needed
npm run update -- --check   # report only (exit 2 if commits are waiting)
npm run update -- --libs    # also bump libraries within package.json ranges
npm run update -- --main    # switch to main first, then update (everyday installs)
```

Safe by design: refuses to overwrite uncommitted local edits, and only fast-forwards (`git pull --ff-only`).
`start.bat` / `start.command` / `npm run launch` also auto-pull when the tree is clean, then verify `node_modules`.

Packaged desktop releases use the separate native GitHub Releases updater — do not mix the two.

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
