Local Comfy workspace for Image Express.

Drop custom Comfy assets here and the app will use this folder as a staging area.

Layout:
- custom_nodes/: clone or copy custom node repos here.
- user/default/workflows/: drop workflow JSON files and optional .manifest.json files here.
- models/: optional local model staging folders that mirror the ComfyUI install layout.

When a Comfy install path is configured, library refreshes and installer bundle syncs copy supported folders from this workspace into that install.