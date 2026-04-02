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

## 2) Optional ComfyUI (Local or Cloud)

### Local ComfyUI (recommended for power users)
1. Install Python 3.10+.
2. Install ComfyUI and start it with CORS enabled.
3. Ensure ComfyUI is reachable at `http://localhost:8188` (or set your custom URL in app settings).

In Image Express:
- Open Generative modal.
- Select `ComfyUI` provider.
- Click `Verify ComfyUI Connection`.
- The app now performs a **catalog sync** (Comfy version + workflow compatibility against registered workflows).
- If you configure local paths in Settings, the app can also scan server template workflows, custom workflow JSON folders, and managed `custom_nodes` / workflow-library repositories.

### Local Comfy folders (optional, but recommended)
Configure these paths in Settings when you want the app to inspect or manage your local Comfy workspace:
- `ComfyUI install path`
- `custom_nodes path`
- `workflow library path`

This enables repo install/update flows and custom workflow-folder scanning from the app UI.

If Image Express runs in Docker while ComfyUI lives on the host machine:
- mount those folders into the container,
- use `host.docker.internal` instead of `localhost` for server-side Comfy access when needed.

### Comfy Cloud
- Set `Connection = Cloud`.
- Fill `Comfy Cloud URL` and `Comfy Cloud API Key`.
- Run connection verification.

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

### Option B: LM Studio
- Install LM Studio.
- Download a model and start the local server mode.
- Use the OpenAI-compatible endpoint exposed by LM Studio.

## 4) AI Edit Notes + Flux Klein Routing

When using AI Edit Notes with reference image editing:
- `NanoBanana` provider auto-routes to `nanobanana-2` model payload.
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
- If local Comfy is unreachable from browser, start ComfyUI with CORS enabled.
- If Comfy server scans fail only on the server side, check whether the app runtime is inside Docker and whether `localhost` should be replaced with `host.docker.internal`.
- If local Comfy folders are unreadable, confirm the configured paths are mounted into the container or that the app is running directly on the host OS.
