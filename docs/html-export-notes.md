# HTML Export Notes

## Feature Overview

The HTML export feature packages the current canvas into a standalone bundle (ZIP) that renders an offline replica of the editor view. The bundle includes:

- `index.html` with the Fabric.js runtime and our overlay script.
- `design.json` containing the serialized Fabric document plus metadata (canvas size, background colors, media manifest).
- `styles.css` mirroring the workspace visuals.
- `scripts/main.js` responsible for restoring the Fabric canvas and overlaying live media/3D elements.
- An `assets/` directory containing every binary referenced by the design.
- Optionally a `libs/` directory with local copies of Fabric.js and model-viewer when the export requires them.

## Asset Collection Coverage

The export pipeline traverses the Fabric JSON graph and queues every binary source so it is rewritten to a local path before bundling. Supported sources include:

- Raster/vector images used by Fabric image objects.
- 3D model thumbnails (`is3DModel`) and their `modelUrl` references (GLB/GLTF).
- Media placeholders created in the editor (`mediaType` and `mediaSource`).
- Canvas background, overlay, and clip-path imagery (`backgroundImage`, `overlayImage`, `clipPath`).
- Nested group/object arrays (`objects`, `paths`) and clip-path hierarchies.
- Gradient/pattern fills and strokes with embedded textures (`fill`, `stroke`, `backgroundColor`, `overlayFill`, `colorStops`).
- Inline data URLs, blob URLs, and cross-origin assets (via the export proxy).

If a download attempt fails, the pipeline logs the error and leaves the original URL in place so the exported viewer can still attempt to load it from the network.

## Cross-Origin Handling

Remote assets are fetched server-side through `/api/export/proxy` to avoid CORS issues during export. The proxy:

1. Validates the target URL and allowed protocols (http/https).
2. Streams the upstream response, copying critical headers such as `content-type`.
3. Returns the binary data to the client-side bundler, which writes it into the ZIP.

When the proxy is unavailable or the upstream request fails, the exporter falls back to the original URL.

## Playback Fidelity

The exported viewer:

- Recreates the Fabric canvas, reapplying canvas and workspace backgrounds.
- Synchronizes exact pixel dimensions with the original viewport.
- Hides media placeholders in Fabric and overlays real `<video>`, `<audio>`, or `<model-viewer>` elements at the same position, rotation, and scale.
- Downloads Fabric locally (when possible) to keep the bundle offline-friendly.

## QA Checklist

- Create a design containing local uploads, remote URLs, video, audio, and GLB content.
- Run **Export → HTML Bundle** and unzip the archive.
- Open `index.html` without a network connection; confirm all imagery, media playback, and 3D previews render in-place.
- Verify the `assets/` directory includes the expected binaries and there are no duplicate copies for repeated references.

## Known Considerations

- Custom fonts that are not embedded in the design will rely on system availability; font packaging is not yet implemented.
- Extremely large remote assets may slow down the export due to full binary downloads.
- If the proxy returns an error, check the console logs for the failing URL and ensure the upstream server allows direct access.
