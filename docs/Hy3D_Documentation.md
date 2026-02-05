# Hitem3D API Notes (hitems)

The `hitems` provider in this project maps to **Hitem3D** (Hitem3D.ai), not Hunyuan3D. The API is a hosted service that accepts image-to-3D requests and returns downloadable 3D model URLs once the task completes.

## Base URL
- **API Base:** `https://api.hitem3d.ai/open-api/v1`

## Create Task (Image-to-3D)
- **Endpoint:** `POST /submit-task`
- **Auth:** `Authorization: Bearer <api-key>`
- **Content-Type:** `multipart/form-data`
- **Required Fields:**
  - `images`: One or more image files
- **Common Fields:**
  - `request_type`: `3` (image-to-3D render)
  - `model`: `hitem3dv1.5` or `hitem3dv2.0`
  - `resolution`: `512` | `1024` | `1536` | `1536pro` (model-dependent)
  - `face`: `no` | `need` (face optimization)
  - `format`: `glb` | `fbx` | `obj` | `stl` | `ply`
  - `mesh_url`: `true` | `false`

**Response (success):**
```json
{
  "code": 0,
  "message": "success",
  "data": { "task_id": "task_XXXX" }
}
```

## Query Task
- **Endpoint:** `POST /query-task?task_id=<task_id>`
- **Auth:** `Authorization: Bearer <api-key>`

**Response (success):**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_status": 4,
    "process_pct": 100,
    "task_result": {
      "model_url": "https://...",
      "render_url": "https://..."
    }
  }
}
```

### Task Status Mapping
- `1` = created
- `2` = queueing
- `3` = processing
- `4` = success
- `-1` = failed

## Project Integration Notes
- Client sends a single image to `/api/ai/hitems` (proxy) and polls `/api/ai/hitems/<taskId>`.
- The proxy enforces defaults (`request_type=3`, `model=hitem3dv1.5`, `resolution=1024`, `format=glb`) unless overridden.
