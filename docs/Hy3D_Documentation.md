# Hitem3D API Notes (hitems)

The `hitems` provider in this project maps to **Hitem3D** (Hitem3D.ai), not Hunyuan3D. The API is a hosted service that accepts image-to-3D requests and returns downloadable 3D model URLs once the task completes.

## Base URL
- **API Base:** `https://api.hitem3d.ai/open-api/v1`

## Authentication
- Use an **access token** in the `Authorization: Bearer <accessToken>` header.
- Obtain the access token via `POST /auth/token` with **Basic Auth** (`client_id:client_secret`).
- Tokens expire; refresh by calling `/auth/token` again.
- Some accounts require an `Appid` header; if you receive empty/unauthorized responses, set `Appid` in Settings.

## Create Task (Image-to-3D)
- **Endpoint:** `POST /submit-task`
- **Auth:** `Authorization: Bearer <accessToken>`
- **Content-Type:** `multipart/form-data`
- **Required Fields:**
  - `images`: One or more image files
**Common Fields:**
- `request_type`: `1` (geometry only) | `2` (texture-only) | `3` (geometry + texture, default)
  - Note: v2.0 models do not support request_type = 2.
- `model`: `hitem3dv1.5` | `hitem3dv2.0` (model-dependent)
- `resolution`: `512` | `1024` | `1536` | `1536pro` (model-dependent)
- `face`: optional face count (100000–2000000). Recommended:
  - 512³: 500000
  - 1024³: 1000000
  - 1536³ / 1536³ Pro: 2000000
- `format`: `1` (obj) | `2` (glb) | `3` (stl) | `4` (fbx) | `5` (usdz)
- `mesh_url`: optional boolean (vendor-specific)

**Response (success):**
```json
{ "code": 200, "msg": "success", "data": { "task_id": "task_XXXX" } }
```

## Query Task
- **Endpoint:** `GET /query-task?task_id=<task_id>`
- **Auth:** `Authorization: Bearer <accessToken>`

**Response (success):**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "url": "https://.../model.glb",
    "cover_url": "https://.../preview.png"
  }
}
```

## Project Integration Notes
- Client sends a single image to `/api/ai/hitems` (proxy) and polls `/api/ai/hitems/<taskId>`.
- The proxy enforces defaults (`request_type=3`, `model=hitem3dv1.5`, `resolution=1024`, `format=2`) unless overridden.
- In Settings, `hitems_api_key` can be either a raw access token or `client_id:client_secret` (the proxy will fetch and refresh tokens automatically).
- In Settings (3D Services), Hitem supports **AK/SK mode** and **Token mode**, with a built-in **Validate Setup** action.
- In AK/SK mode, the first field is Access Key (`ak_...`) and the second is Secret Key (`sk_...`).
- The proxy now rejects placeholder/missing auth values (`Bearer`, `undefined`, `null`) with HTTP `401` and a clear setup message.
- The token resolver now handles Hitem business errors (`code`/`msg`) even when HTTP status is `200`, so invalid credentials return actionable messages (for example, `client credentials are invalid`) instead of ambiguous token parsing errors.
- If upstream responds `200` but omits `task_id` (or returns an empty body), the proxy returns HTTP `502` with `message`/`detail` so UI shows actionable setup guidance instead of ambiguous empty payloads.

## Quality Presets (UI)
- 512: Eco / fastest
- 1024: Balanced (default)
- 1536: High
- 1536pro: Max fidelity
