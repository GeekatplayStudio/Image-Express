# Hy3D / Hitems3D / Hunyuan3D Documentation Summary

Based on the codebase aliases ("Hy3D", "hitems") and current 3D AI landscape, the service matches **Tencent Hunyuan3D (v2.0)**. 

## 1. Service Identity
- **Official Name:** Tencent Hunyuan3D
- **Common Abbreviation:** Hy3D
- **Aliases in Project:** `hitems`, `hiitems3d`
- **Latest Version:** 2.0 (Released Jan 2025)
- **Architecture:** Unified framework for Text-to-3D and Image-to-3D generation.

## 2. Official Resources
- **Code Repository:** [https://github.com/Tencent/Hunyuan3D](https://github.com/Tencent/Hunyuan3D)
- **Project Page:** [https://3d.hunyuan.tencent.com](https://3d.hunyuan.tencent.com)
- **HuggingFace:** [https://huggingface.co/tencent/Hunyuan3D-2](https://huggingface.co/tencent/Hunyuan3D-2)

## 3. Connection & API
"Hy3D" is primarily an open-weights model, not a SaaS with a single global API URL like Meshy. To use it, you generally use a **Self-Hosted API** or **Inference Provider**.

### Option A: Self-Hosted (Recommended for "Hy3D" implementations)
If you run the official Gradio app or Docker container:
- **Base URL:** `http://localhost:8080` (or your GPU server IP)
- **Authentication:** None (default) or Basic Auth / Bearer Token (if configured via Nginx/Proxy).
- **Format:** JSON payload to Gradio endpoints.

### Option B: Tencent Cloud API
- **Base URL:** `https://hunyuan.tencentcloudapi.com`
- **Authentication:** Tencent Cloud Auth v3 (Requires `SecretId`, `SecretKey`, `SessionToken`).
- **Complexity:** High (requires complex request signing).

### Option C: Third-Party Wrappers (Replicate/Fal.ai)
- **Base URL (Replicate example):** `https://api.replicate.com/v1/predictions`
- **Authentication:** `Authorization: Bearer <your-api-key>` (Matches your `hitems_api_key` pattern).

## 4. Endpoints (Standard Model Implementation)

### Text-to-3D
- **Input:** Prompt (string)
- **Output:** GLB/OBJ file URL
- **Typical Endpoint:** `/v1/generation/text-to-3d` (if using standard wrappers) or `/predict` (Gradio).

### Image-to-3D (Strongest Feature)
- **Input:** Image URL or Base64
- **Output:** GLB/OBJ file URL
- **Parameters:**
  - `image`: Source image
  - `steps`: Generation steps (default ~50)
  - `guidance_scale`: (default ~5.0)

## 5. Implementation Strategy for `Adobe-Express-Remake`
Since `ThreeDGenerator.tsx` is missing the `hitems` implementation:
1.  **Determine Backend:** Are you self-hosting Hunyuan3D 2.0 or using a provider?
2.  **API Route:** Create `src/app/api/ai/hitems/route.ts` to proxy requests to your backend.
3.  **Auth:** Use the `hitems_api_key` from Settings to authenticate against your chosen backend (or pass it as the Replicate/Provider key).
