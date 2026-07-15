# Installation Guide (PC & Mac)

This guide is the recommended **easy path** to run Image Express locally, with optional ComfyUI and local LLM setup.

## 1) Core App (Required)

### Prerequisites
- Node.js 20+
- npm 10+
- Git

### Install + Run
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

### Updating
```bash
npm run update          # pull latest code + reinstall deps if changed
npm run update:check    # just report whether an update exists
```
Or check **Settings → Workspace → Updates** in the app. See the README's "Updating" section for details.

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
