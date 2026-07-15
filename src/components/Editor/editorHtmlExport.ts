import * as fabric from 'fabric';
import JSZip from 'jszip';
import type { ToastOptions } from '@/providers/ToastProvider';
import type { DesignJson, SerializedFill, SerializedObject } from '@/components/Editor/editorView.types';
import { serializeCanvas } from '@/lib/fabric-utils';
import {
    buildHtmlExportDocument,
    buildHtmlExportMainScript,
    encodeDesignPayload,
    HTML_EXPORT_STYLES,
} from '@/components/Editor/editorHtmlExportTemplates';

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

    const designJson = serializeCanvas<DesignJson>(canvas, customHistoryProps);

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

    const designJsonBase64 = encodeDesignPayload(designJson);

    zip.file('styles.css', HTML_EXPORT_STYLES);

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

    const mainScript = buildHtmlExportMainScript(designJsonBase64);

    scriptsFolder?.file('main.js', mainScript);

    const html = buildHtmlExportDocument(fabricScriptTag, modelViewerScriptTag);

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
