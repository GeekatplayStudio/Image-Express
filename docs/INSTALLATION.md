# Installation Guide (PC & Mac)

This guide is the recommended **easy path** to run Image Express locally, with optional ComfyUI and local LLM setup.

## 1) Core App (Required)

### Native one-file installer (recommended)

Download exactly one platform installer from
**[GitHub Releases](https://github.com/GeekatplayStudio/Image-Express/releases/latest)**:

- Windows x64: `ImageExpress-Setup-<version>.exe`
- macOS Apple Silicon: `ImageExpress-<version>-arm64.dmg`
- macOS Intel: `ImageExpress-<version>-x64.dmg`
- Linux x64: `ImageExpress-<version>-x64.AppImage` or `.deb`

The native installer includes the application runtime. It does not install Git, Node.js, npm,
Homebrew, winget, or source code. After installation, launch Image Express from the normal
operating-system application icon.

### Source bootstrap (contributors and advanced users)

The repository also contains [`install.bat`](../install.bat) and
[`install.command`](../install.command). These scripts clone and build the current source and
therefore require development prerequisites. They are a fallback and contributor workflow, not
the primary consumer installer.

The source bootstrap checks for Git and Node.js 24+, installs dependencies, verifies the source
build, and can offer optional ComfyUI/Ollama setup.

Every step — and any error — is written to a log file you can hand to support if something goes wrong:
- Windows: `%USERPROFILE%\ImageExpress-setup.log`
- macOS: `~/ImageExpress-setup.log`

On macOS, downloaded source scripts may require right-clicking `.command` and choosing **Open**.
The signed/notarized DMG path should not require this workaround.

**If macOS says the file "can't be executed" or nothing happens**: browsers strip the execute permission from downloaded scripts. Skip the download entirely and paste this one line into Terminal (⌘-Space, type "Terminal") — it runs the exact same installer:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/GeekatplayStudio/Image-Express/main/install.command)
```

### Prerequisites (if installing manually instead)
- Node.js 24+
- npm 11+
- Git

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

Or download the packaged installer from the project's GitHub Releases page —
`ImageExpress-Setup-<version>.exe` (Windows, one-click) or the `.dmg` (macOS) — for
a native app with no terminal at all. If the desktop app fails to start, check
its startup log: `%APPDATA%\creative-flow\startup-trace.log` (Windows) or
`~/Library/Application Support/creative-flow/startup-trace.log` (macOS); failures
also write `startup-error.log` next to it.

### Running it again later

Use the matching **start** file in your install folder — no terminal required:

- **Windows**: `start.bat`
- **macOS**: `start.command`

Each run checks for updates, rebuilds only if needed, and opens the app in your browser.

### Updating

Three ways, pick whichever is easiest:
1. **Automatic**: the app checks for updates on every launch and asks before installing (toggle in Settings → Workspace → Updates → "Check for updates automatically").
2. **In-app manual check**: **Settings → Workspace → Updates** shows your current version and an "Update Now" button.
3. **From a terminal**:
   ```bash
   npm run update          # pull latest code + reinstall deps if changed
   npm run update:check    # just report whether an update exists
   ```

The updater is always safe: it refuses to run over uncommitted local changes and only fast-forwards, so it can never create a merge conflict or overwrite your work. The **start** file also pulls safe updates automatically on every run.

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
