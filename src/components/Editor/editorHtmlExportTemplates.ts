import type { DesignJson } from '@/components/Editor/editorView.types';

export const HTML_EXPORT_STYLES = `:root { color-scheme: light dark; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --workspace-bg: #0b1120; --canvas-shadow: 0 40px 120px rgba(8, 15, 35, 0.55); --media-border: rgba(148, 163, 184, 0.28); --media-surface: rgba(12, 18, 32, 0.94); --workspace-pattern: radial-gradient(#4d4d4d 1px, transparent 1px); }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--workspace-bg); color: #e2e8f0; display: flex; align-items: center; justify-content: center; font-family: inherit; }
main { width: 100%; display: flex; justify-content: center; padding: 2.5rem 1.5rem; position: relative; }
main::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: var(--workspace-pattern); background-size: 20px 20px; opacity: 0.18; }
.canvas-wrapper { position: relative; box-shadow: var(--canvas-shadow); border-radius: 18px; overflow: hidden; background: transparent; backdrop-filter: saturate(120%); }
canvas { display: block; width: 100%; height: auto; background: transparent; }
#media-overlay { position: absolute; inset: 0; pointer-events: none; }
#media-overlay > * { pointer-events: auto; }
.media-element { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 16px; border: 1px solid var(--media-border); background: var(--media-surface); box-shadow: 0 20px 60px rgba(15, 23, 42, 0.45); overflow: hidden; }
.media-element[data-media-type="video"] video,
.media-element[data-media-type="model"] model-viewer { width: 100%; height: 100%; display: block; object-fit: cover; background: #020617; }
.media-element[data-media-type="audio"] { padding: 16px 20px; min-height: 76px; }
.media-element[data-media-type="audio"] audio { width: 100%; }
@media (max-width: 900px) { main { padding: 1.5rem; } }
`;

export const encodeDesignPayload = (designJson: DesignJson) => {
    try {
        const jsonString = JSON.stringify(designJson);
        const utf8 = new TextEncoder().encode(jsonString);
        const chunkSize = 0x8000;
        let binary = '';
        for (let i = 0; i < utf8.length; i += chunkSize) {
            const chunk = utf8.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        if (typeof globalThis !== 'undefined' && typeof globalThis.btoa === 'function') {
            return globalThis.btoa(binary);
        }
        if (typeof btoa === 'function') {
            return btoa(unescape(encodeURIComponent(jsonString)));
        }
    } catch (error) {
        console.error('Failed to encode design payload for HTML export:', error);
    }
    return '';
};

export const buildHtmlExportMainScript = (designJsonBase64: string) => `const DESIGN_DATA_BASE64 = '${designJsonBase64}';

const decodeDesignData = () => {
    if (!DESIGN_DATA_BASE64) return null;
    try {
        const binary = atob(DESIGN_DATA_BASE64);
        if (typeof TextDecoder !== 'undefined') {
            const length = binary.length;
            const bytes = new Uint8Array(length);
            for (let i = 0; i < length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(bytes));
        }
        const escaped = binary.replace(/(.)/g, (match, char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0'));
        return JSON.parse(decodeURIComponent(escaped));
    } catch (error) {
        console.error('Failed to decode design payload for export viewer:', error);
        return null;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const canvasEl = document.getElementById('artboard');
    const overlayEl = document.getElementById('media-overlay');
    const wrapperEl = document.querySelector('.canvas-wrapper');

    if (!canvasEl || !overlayEl) return;

    const canvas = new fabric.Canvas(canvasEl, { preserveObjectStacking: true });
    const designData = decodeDesignData();

    if (!designData) {
        return;
    }

    const metadata = designData.metadata || {};

    if (metadata.workspaceBackground) {
        document.documentElement.style.setProperty('--workspace-bg', metadata.workspaceBackground);
    }

    const syncDimensions = () => {
        overlayEl.style.width = \`${'${'}canvas.getWidth()}px\`;
        overlayEl.style.height = \`${'${'}canvas.getHeight()}px\`;
        canvasEl.style.width = \`${'${'}canvas.getWidth()}px\`;
        canvasEl.style.height = \`${'${'}canvas.getHeight()}px\`;
        canvasEl.width = canvas.getWidth();
        canvasEl.height = canvas.getHeight();
        if (wrapperEl) {
            wrapperEl.style.width = \`${'${'}canvas.getWidth()}px\`;
            wrapperEl.style.height = \`${'${'}canvas.getHeight()}px\`;
        }
    };

    const applyArtboard = () => {
        if (!metadata.artboard) return;

        const info = metadata.artboard;
        const artboard = new fabric.Rect({
            left: typeof info.left === 'number' ? info.left : 0,
            top: typeof info.top === 'number' ? info.top : 0,
            width: typeof info.width === 'number' ? info.width : canvas.getWidth(),
            height: typeof info.height === 'number' ? info.height : canvas.getHeight(),
            fill: info.fill || '#ffffff',
            originX: 'left',
            originY: 'top',
            rx: typeof info.rx === 'number' ? info.rx : 0,
            ry: typeof info.ry === 'number' ? info.ry : 0,
            selectable: false,
            evented: false,
            excludeFromExport: true
        });

        if (info.shadow) {
            artboard.set('shadow', new fabric.Shadow({
                color: info.shadow.color || 'rgba(0,0,0,0.2)',
                blur: typeof info.shadow.blur === 'number' ? info.shadow.blur : 20,
                offsetX: typeof info.shadow.offsetX === 'number' ? info.shadow.offsetX : 0,
                offsetY: typeof info.shadow.offsetY === 'number' ? info.shadow.offsetY : 0,
                includeDefaultValues: false
            }));
        }

        canvas.add(artboard);
        canvas.sendToBack(artboard);
        canvas.requestRenderAll();
    };

    const renderMediaOverlays = () => {
        overlayEl.innerHTML = '';
        const objects = canvas.getObjects();

        objects.forEach((obj, index) => {
            if (!obj) return;

            const mediaType = obj.mediaType as 'video' | 'audio' | undefined;
            const mediaSource = typeof obj.mediaSource === 'string' ? obj.mediaSource : undefined;
            const isModel = Boolean(obj.is3DModel && typeof obj.modelUrl === 'string');
            const modelUrl = isModel ? (obj.modelUrl as string) : undefined;

            if (!mediaType && !isModel) return;
            if (mediaType && !mediaSource) return;

            const container = document.createElement('div');
            container.className = 'media-element';
            container.dataset.mediaType = isModel ? 'model' : mediaType;

            const scaledWidth = typeof obj.getScaledWidth === 'function'
                ? obj.getScaledWidth()
                : (typeof obj.width === 'number' ? obj.width * (typeof obj.scaleX === 'number' ? obj.scaleX : 1) : 0);
            const scaledHeight = typeof obj.getScaledHeight === 'function'
                ? obj.getScaledHeight()
                : (typeof obj.height === 'number' ? obj.height * (typeof obj.scaleY === 'number' ? obj.scaleY : 1) : 0);
            const center = typeof obj.getCenterPoint === 'function'
                ? obj.getCenterPoint()
                : { x: typeof obj.left === 'number' ? obj.left : 0, y: typeof obj.top === 'number' ? obj.top : 0 };
            const angle = typeof obj.angle === 'number' ? obj.angle : 0;

            container.style.width = \`${'${'}scaledWidth}px\`;
            container.style.height = \`${'${'}scaledHeight}px\`;
            container.style.left = \`${'${'}center.x}px\`;
            container.style.top = \`${'${'}center.y}px\`;
            container.style.transform = \`translate(-50%, -50%) rotate(${'${'}angle}deg)\`;
            container.style.transformOrigin = 'center center';
            container.style.zIndex = String(1000 + index);

            const assignBorderRadius = (target) => {
                if (!target) return;
                const rx = typeof target.rx === 'number' ? target.rx : undefined;
                const ry = typeof target.ry === 'number' ? target.ry : undefined;
                const radius = Math.max(rx || 0, ry || 0);
                if (radius > 0) {
                    container.style.borderRadius = \`${'${'}radius}px\`;
                }
            };

            const groupObjects = obj.type === 'group' ? obj._objects : undefined;

            if (obj.type === 'group' && Array.isArray(groupObjects)) {
                const backgroundRect = groupObjects.find((child) => child && child.type === 'rect');
                assignBorderRadius(backgroundRect);
            } else {
                assignBorderRadius(obj);
            }

            let interactive = null;

            if (isModel && modelUrl) {
                const viewer = document.createElement('model-viewer');
                viewer.setAttribute('src', modelUrl);
                viewer.setAttribute('camera-controls', '');
                viewer.setAttribute('auto-rotate', '');
                viewer.setAttribute('shadow-intensity', '1');
                viewer.style.width = '100%';
                viewer.style.height = '100%';
                interactive = viewer;
            } else if (mediaType === 'video' && mediaSource) {
                const video = document.createElement('video');
                video.src = mediaSource;
                video.controls = true;
                video.preload = 'metadata';
                video.playsInline = true;
                video.setAttribute('playsinline', 'true');
                video.setAttribute('webkit-playsinline', 'true');
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                interactive = video;
            } else if (mediaType === 'audio' && mediaSource) {
                const audio = document.createElement('audio');
                audio.src = mediaSource;
                audio.controls = true;
                audio.preload = 'metadata';
                audio.style.width = '100%';
                interactive = audio;
            }

            if (!interactive) return;

            container.appendChild(interactive);
            overlayEl.appendChild(container);

            if (typeof obj.set === 'function') {
                obj.set('visible', false);
            }
        });

        canvas.requestRenderAll();
    };
    if (metadata.backgroundColor) {
        canvas.setBackgroundColor(metadata.backgroundColor, () => canvas.renderAll());
    }

    if (typeof metadata.canvasWidth === 'number' && typeof metadata.canvasHeight === 'number') {
        canvas.setDimensions({ width: metadata.canvasWidth, height: metadata.canvasHeight });
    }

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    canvas.loadFromJSON(designData, () => {
        applyArtboard();
        syncDimensions();
        renderMediaOverlays();
    });

    window.addEventListener('resize', () => {
        syncDimensions();
        renderMediaOverlays();
    });
});
`;

export const buildHtmlExportDocument = (fabricScriptTag: string, modelViewerScriptTag: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Image Express Export</title>
    <link rel="stylesheet" href="styles.css" />
    ${fabricScriptTag}
    ${modelViewerScriptTag}
</head>
<body>
    <main>
        <div class="canvas-wrapper">
            <canvas id="artboard"></canvas>
            <div id="media-overlay"></div>
        </div>
    </main>
    <script src="scripts/main.js"></script>
</body>
</html>`;
