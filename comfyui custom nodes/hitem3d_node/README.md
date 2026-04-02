# Hitem3D ComfyUI Custom Node

This folder contains a self-contained ComfyUI node that sends 1-4 images to Hitem3D (`api.hitem3d.ai`), polls task status, and downloads the generated 3D model file.

## Files

- `hitem3d_node.py`: the custom node implementation
- `__init__.py`: ComfyUI node mappings export
- `hitem3d_api_key.local.json`: local editable secrets/config file (git-ignored)
- `hitem3d_api_key.example.json`: sample config template

## Node Name

- `Hitem3D Generate Model (1-4 Images)`

## Inputs

- `image_1` (required), `image_2..image_4` (optional)
- `generation_type`: `normal | portrait | relief`
- `hitem_model`: `auto` or specific Hitem model
- `resolution`: `512 | 1024 | 1536 | 1536pro`
- `textured`: true/false
- `output_format`: `obj | glb | stl | fbx | usdz`
- `output_folder`: relative folder under ComfyUI output directory
- `output_name`: base filename
- `wait_for_result`: if false, returns only task ID
- `max_wait_seconds`, `poll_interval_seconds`, `face`, `mesh_url`, `multi_images_bit`

## Outputs

1. `saved_model_path`
2. `download_url`
3. `task_id`
4. `status_code`

## Setup

1. Edit `hitem3d_api_key.local.json` and set:
   - `api_key`: bearer token or `access_key:secret_key`
   - `app_id`: optional, only for accounts that need Appid
2. Copy `hitem3d_node` folder into your ComfyUI `custom_nodes` directory.
3. Restart ComfyUI.

## Notes

- For `generation_type=relief`, node enforces geometry-focused request behavior.
- `hitem_model=auto` selects a model from `generation_type`.
- Generated model is saved to `ComfyUI/output/<output_folder>/<output_name>.<ext>`.
