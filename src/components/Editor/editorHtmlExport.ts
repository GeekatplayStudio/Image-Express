import * as fabric from 'fabric';
import JSZip from 'jszip';
import type { ToastOptions } from '@/providers/ToastProvider';
import type { DesignJson, SerializedFill, SerializedObject } from '@/components/Editor/editorView.types';

type ExportHtmlBundleArgs = {
    canvas: fabric.Canvas;
    baseName: string;
    timestamp: string;
    customHistoryProps: string[];
    toast: (options: ToastOptions) => void;
    downloadBlob: (blob: Blob, filename: string) => void;
    getDisplayName: (url: string) => string;
};

export async function exportHtmlBundle({
    canvas,
    baseName,
    timestamp,
    customHistoryProps,
    toast,
    downloadBlob,
    getDisplayName,
}: ExportHtmlBundleArgs) {
    const zip = new JSZip();
    const assetsFolder = zip.folder('assets');
    const libsFolder = zip.folder('libs');
    const scriptsFolder = zip.folder('scripts');

    const designJson = (canvas as unknown as { toJSON: (properties?: string[]) => DesignJson }).toJSON(customHistoryProps);

    const metadata = {
        canvasWidth: canvas.getWidth(),
        canvasHeight: canvas.getHeight(),
        backgroundColor: typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : undefined,
        workspaceBackground: undefined as string | undefined,
        artboard: undefined as
            | {
                  width: number;
                  height: number;
                  left: number;
                  top: number;
                  fill?: string;
                  rx?: number;
                  ry?: number;
                  shadow?: {
                      color?: string;
                      blur?: number;
                      offsetX?: number;
                      offsetY?: number;
                  };
              }
            | undefined,
        mediaAssets: [] as Array<{ type: 'video' | 'audio'; label: string; path: string }>,
    };

    const workspaceBackground = (canvas as unknown as { getWorkspaceBackground?: () => string | undefined; workspaceBackground?: string }).getWorkspaceBackground?.()
        ?? (canvas as unknown as { workspaceBackground?: string }).workspaceBackground;

    if (typeof workspaceBackground === 'string' && workspaceBackground.trim().length > 0) {
        metadata.workspaceBackground = workspaceBackground;
    }

    const artboardRect = (canvas as unknown as { artboardRect?: fabric.Rect }).artboardRect;
    if (artboardRect) {
        metadata.artboard = {
            width: artboardRect.width ?? artboardRect.getScaledWidth?.() ?? canvas.getWidth(),
            height: artboardRect.height ?? artboardRect.getScaledHeight?.() ?? canvas.getHeight(),
            left: artboardRect.left ?? 0,
            top: artboardRect.top ?? 0,
            fill: typeof artboardRect.fill === 'string' ? artboardRect.fill : undefined,
            rx: typeof artboardRect.rx === 'number' ? artboardRect.rx : undefined,
            ry: typeof artboardRect.ry === 'number' ? artboardRect.ry : undefined,
            shadow: artboardRect.shadow
                ? {
                      color: artboardRect.shadow.color,
                      blur: artboardRect.shadow.blur,
                      offsetX: artboardRect.shadow.offsetX,
                      offsetY: artboardRect.shadow.offsetY
                  }
                : undefined
        };
    }

    designJson.metadata = metadata;

    const assetMap = new Map<string, string>();
    const usedNames = new Set<string>();
    const assetPromises: Array<Promise<void>> = [];

    const sanitizeSegment = (segment: string) => segment.replace(/[^a-z0-9._-]/gi, '_');

    const ensureExtension = (name: string, fallback: string) => {
        if (name.includes('.')) return name;
        return `${name}.${fallback}`;
    };

    const getUniqueFileName = (rawName: string) => {
        const parts = rawName.split('.');
        const ext = parts.length > 1 ? `.${parts.pop()}` : '';
        const base = sanitizeSegment(parts.join('.') || 'asset');
        let extension = sanitizeSegment(ext.replace('.', ''));
        if (!extension) extension = 'bin';
        let candidate = `${base}.${extension}`;
        let counter = 1;
        while (usedNames.has(candidate)) {
            candidate = `${base}-${counter}.${extension}`;
            counter += 1;
        }
        usedNames.add(candidate);
        return candidate;
    };

    const deriveFileName = (url: string, contentType: string | null) => {
        const withoutQuery = url.split('?')[0];
        const urlName = withoutQuery.split('/').pop() || '';
        let clean = sanitizeSegment(decodeURIComponent(urlName));
        if (!clean) {
            if (contentType?.includes('image/')) clean = `image.${contentType.split('/')[1]?.split(';')[0] ?? 'png'}`;
            else if (contentType?.includes('video/')) clean = `video.${contentType.split('/')[1]?.split(';')[0] ?? 'mp4'}`;
            else if (contentType?.includes('audio/')) clean = `audio.${contentType.split('/')[1]?.split(';')[0] ?? 'mp3'}`;
            else if (contentType?.includes('model/')) clean = `model.${contentType.split('/')[1]?.split(';')[0] ?? 'glb'}`;
            else clean = 'asset.bin';
        }
        return ensureExtension(clean, 'bin');
    };

    const decodeDataUrl = (dataUrl: string) => {
        const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
        if (!match) return null;
        const mimeType = match[1] || 'application/octet-stream';
        const isBase64 = Boolean(match[2]);
        const dataPart = match[3] || '';

        try {
            let buffer: ArrayBuffer;
            if (isBase64) {
                const binary = atob(dataPart);
                const view = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i += 1) {
                    view[i] = binary.charCodeAt(i);
                }
                buffer = view.buffer;
            } else {
                const decoded = decodeURIComponent(dataPart.replace(/\+/g, '%20'));
                buffer = new TextEncoder().encode(decoded).buffer;
            }

            const extension = mimeType.split('/')[1]?.split(';')[0] ?? 'bin';
            return { buffer, mimeType, extension };
        } catch (error) {
            console.error('Failed to decode data URL asset:', error);
            return null;
        }
    };

    const queueAsset = (url: string | undefined, setter: (relative: string) => void, manifest?: { record?: { type: 'video' | 'audio'; label: string; path: string } }) => {
        if (!url || !assetsFolder) {
            if (url) setter(url);
            if (manifest?.record) manifest.record.path = url || '';
            return;
        }

        if (url.startsWith('data:')) {
            const decoded = decodeDataUrl(url);
            if (!decoded) {
                setter(url);
                if (manifest?.record) manifest.record.path = url;
                return;
            }

            const assetKey = url;
            if (assetMap.has(assetKey)) {
                const existingPath = assetMap.get(assetKey)!;
                setter(existingPath);
                if (manifest?.record) manifest.record.path = existingPath;
                return;
            }

            const inferredName = `inline-asset.${decoded.extension || 'bin'}`;
            const fileName = getUniqueFileName(inferredName);
            assetsFolder.file(fileName, decoded.buffer);
            const relativePath = `assets/${fileName}`;
            assetMap.set(assetKey, relativePath);
            setter(relativePath);
            if (manifest?.record) manifest.record.path = relativePath;
            return;
        }

        const resolveAbsoluteUrl = (input: string) => {
            try {
                if (typeof window === 'undefined') return input;
                return new URL(input, window.location.href).toString();
            } catch {
                return input;
            }
        };

        const absoluteUrl = resolveAbsoluteUrl(url);
        const assetKey = absoluteUrl || url;

        if (assetMap.has(assetKey)) {
            const existing = assetMap.get(assetKey)!;
            setter(existing);
            if (manifest?.record) manifest.record.path = existing;
            return;
        }

        const isCrossOrigin = (() => {
            if (typeof window === 'undefined') return false;
            try {
                return new URL(absoluteUrl).origin !== window.location.origin;
            } catch {
                return false;
            }
        })();

        const candidates: string[] = [];
        if (isCrossOrigin) {
            candidates.push(`/api/export/proxy?url=${encodeURIComponent(absoluteUrl)}`);
        }
        candidates.push(absoluteUrl);
        if (url.startsWith('blob:')) {
            candidates.push(url);
        }

        const promise = (async () => {
            let lastError: unknown = null;
            for (const candidate of candidates) {
                try {
                    const response = await fetch(candidate, { credentials: 'include', mode: 'cors' });
                    if (!response.ok) throw new Error(`Failed to fetch asset: ${candidate}`);
                    const buffer = await response.arrayBuffer();
                    const contentType = response.headers.get('content-type');
                    const fileName = getUniqueFileName(deriveFileName(absoluteUrl, contentType));
                    assetsFolder.file(fileName, buffer);
                    const relativePath = `assets/${fileName}`;
                    assetMap.set(assetKey, relativePath);
                    setter(relativePath);
                    if (manifest?.record) manifest.record.path = relativePath;
                    return;
                } catch (error) {
                    lastError = error;
                }
            }

            console.error('Asset bundling failed:', lastError);
            setter(url);
            if (manifest?.record) manifest.record.path = url;
        })();

        assetPromises.push(promise);
    };

    let includes3DModel = false;

    const processFill = (fill: unknown) => {
        if (!fill || typeof fill !== 'object') return;
        const fillData = fill as SerializedFill;

        if (typeof fillData.src === 'string') {
            queueAsset(fillData.src, (newPath) => {
                fillData.src = newPath;
            });
        }

        if (typeof fillData.source === 'string') {
            queueAsset(fillData.source, (newPath) => {
                fillData.source = newPath;
            });
        }

        if (Array.isArray(fillData.colorStops)) {
            fillData.colorStops.forEach((stop) => {
                if (stop && typeof stop.src === 'string') {
                    queueAsset(stop.src, (newPath) => {
                        stop.src = newPath;
                    });
                }
            });
        }
    };

    const processObject = (obj: SerializedObject) => {
        if (!obj) return;

        if (obj.type === 'image' && typeof obj.src === 'string') {
            queueAsset(obj.src, (newPath) => {
                obj.src = newPath;
            });
        }

        if (obj.is3DModel && typeof obj.modelUrl === 'string') {
            includes3DModel = true;
            queueAsset(obj.modelUrl, (newPath) => {
                obj.modelUrl = newPath;
            });
        }

        if (obj.mediaType && typeof obj.mediaSource === 'string') {
            const record = {
                type: obj.mediaType as 'video' | 'audio',
                label: obj.name || getDisplayName(obj.mediaSource),
                path: ''
            };
            metadata.mediaAssets.push(record);
            queueAsset(obj.mediaSource, (newPath) => {
                obj.mediaSource = newPath;
            }, { record });
        }

        if (obj.clipPath) {
            processObject(obj.clipPath);
        }

        if (Array.isArray(obj.objects)) {
            obj.objects.forEach((nested) => processObject(nested));
        }

        if (Array.isArray(obj.paths)) {
            obj.paths.forEach((pathItem) => processObject(pathItem));
        }

        processFill(obj.fill);
        processFill(obj.stroke);
        processFill(obj.backgroundColor);
        processFill(obj.overlayFill);
    };

    if (Array.isArray(designJson.objects)) {
        designJson.objects.forEach((object) => processObject(object));
    }

    const backgroundImage = designJson.backgroundImage;
    if (backgroundImage && typeof backgroundImage.src === 'string') {
        queueAsset(backgroundImage.src, (newPath) => {
            backgroundImage.src = newPath;
        });
    }

    const overlayImage = designJson.overlayImage;
    if (overlayImage && typeof overlayImage.src === 'string') {
        queueAsset(overlayImage.src, (newPath) => {
            overlayImage.src = newPath;
        });
    }

    if (designJson.clipPath) {
        processObject(designJson.clipPath);
    }

    await Promise.all(assetPromises);

    zip.file('design.json', JSON.stringify(designJson, null, 2));

    const encodeDesignPayload = () => {
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

    const designJsonBase64 = encodeDesignPayload();

    const styles = `:root { color-scheme: light dark; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --workspace-bg: #0b1120; --canvas-shadow: 0 40px 120px rgba(8, 15, 35, 0.55); --media-border: rgba(148, 163, 184, 0.28); --media-surface: rgba(12, 18, 32, 0.94); --workspace-pattern: radial-gradient(#4d4d4d 1px, transparent 1px); }
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

    zip.file('styles.css', styles);

    let fabricScriptTag = '<script src="https://cdn.jsdelivr.net/npm/fabric@7.1.0/dist/fabric.min.js"></script>';
    try {
        if (libsFolder) {
            const fabricResponse = await fetch('https://cdn.jsdelivr.net/npm/fabric@7.1.0/dist/fabric.min.js');
            if (fabricResponse.ok) {
                libsFolder.file('fabric.min.js', await fabricResponse.text());
                fabricScriptTag = '<script src="libs/fabric.min.js"></script>';
            }
        }
    } catch (error) {
        console.warn('Falling back to CDN fabric.js for HTML export:', error);
    }

    let modelViewerScriptTag = includes3DModel
        ? '<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>'
        : '';

    if (includes3DModel) {
        try {
            if (libsFolder) {
                const modelViewerResponse = await fetch('https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js');
                if (modelViewerResponse.ok) {
                    libsFolder.file('model-viewer.min.js', await modelViewerResponse.text());
                    modelViewerScriptTag = '<script type="module" src="libs/model-viewer.min.js"></script>';
                }
            }
        } catch (error) {
            console.warn('Falling back to CDN model-viewer for HTML export:', error);
        }
    }

    const mainScript = `const DESIGN_DATA_BASE64 = '${designJsonBase64}';

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

    scriptsFolder?.file('main.js', mainScript);

    const html = `<!DOCTYPE html>
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

    zip.file('index.html', html);

    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const archiveName = baseName ? `${baseName}.zip` : `design-${timestamp}.zip`;
        downloadBlob(zipBlob, archiveName);
    } catch (error) {
        console.error('Failed to generate HTML export bundle:', error);
        toast({ title: 'Export failed', description: 'Unable to generate HTML export.', variant: 'destructive' });
    }
}
