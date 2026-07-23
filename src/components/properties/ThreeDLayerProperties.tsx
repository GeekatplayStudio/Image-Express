'use client';

import { useState } from 'react';
import * as fabric from 'fabric';
import { Box, Boxes, Scan, Sun } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { ExtendedFabricObject, ThreeDLayerSettings } from '@/types';
import UnwarpEditorModal, { type UnwarpEditorResult } from '@/components/UnwarpEditorModal';
import {
    autoAspect,
    flatSizeForQuad,
    metricAspect,
    type Vec2,
} from '@/lib/threeDLayer/homography';
import { cornersToPx, rewarpQuad, unwarpQuad } from '@/lib/threeDLayer/warpRender';
import { estimateDepth, luminancePseudoDepth } from '@/lib/threeDLayer/depth';
import { normalsFromDepth } from '@/lib/threeDLayer/normals';
import { loadGlobalLight } from '@/lib/threeDLayer/globalLight';
import { ThreeDRelightControls } from './ThreeDRelightControls';
import { ThreeDObjectControls } from './ThreeDObjectControls';
import { bakeObject, bakeRelight } from '@/lib/threeDLayer/bake';

interface ThreeDLayerPropertiesProps {
    canvas: fabric.Canvas | null;
    selectedObject: ExtendedFabricObject | null;
}

const DEFAULT_REWARP = { feather: 6, edgeHardness: 0.15, matchColors: false, seamless: false };

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/** Source pixels of an image layer at natural resolution. */
function layerSourceUrl(obj: ExtendedFabricObject): string | null {
    if (obj.type === 'image') {
        const img = obj as unknown as fabric.Image;
        const el = img.getElement() as HTMLImageElement | HTMLCanvasElement | undefined;
        if (el instanceof HTMLImageElement) return el.currentSrc || el.src;
        if (el instanceof HTMLCanvasElement) return el.toDataURL('image/png');
    }
    try {
        return obj.toDataURL({ format: 'png', multiplier: 1 });
    } catch {
        return null;
    }
}

export function ThreeDLayerProperties({ canvas, selectedObject }: ThreeDLayerPropertiesProps) {
    const { t } = useI18n();
    const [editorSrc, setEditorSrc] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [depthProgress, setDepthProgress] = useState<string | null>(null);

    const ext = selectedObject;
    const settings = ext?.is3DLayer ? ext.threeDLayerSettings : undefined;
    const isImageLayer = !!ext && ext.type === 'image' && !ext.isAdjustmentLayer && !ext.is3DLayer;
    // Unwarp starts from plain image layers; relight also works on unwarp
    // layers (light the flattened surface, as the reference tools do).
    const canUnwarp = isImageLayer;
    const canRelight = isImageLayer || settings?.mode === 'unwarp';
    if (!ext || (!isImageLayer && !settings)) return null;

    const handleCreateObject = async () => {
        if (!canvas) return;
        setBusy(true);
        try {
            // A baked 3D-model layer carries its GLB url — convert it to a
            // live object layer; anything else starts with the placeholder.
            const modelUrl = ext.is3DModel && ext.modelUrl ? ext.modelUrl : '__placeholder';
            const layerSettings: ThreeDLayerSettings = {
                mode: 'object',
                modelUrl,
                object: { rotationY: 30, scale: 1, cameraFovV: 40, cameraElevation: 12, shadowOpacity: 0.35 },
            };
            const img = await fabric.FabricImage.fromURL(
                // 1x1 transparent seed; the bake below replaces the pixels.
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            );
            const objExt = img as unknown as ExtendedFabricObject;
            objExt.is3DLayer = true;
            objExt.threeDLayerSettings = layerSettings;
            objExt.name = t('layer3d.objectLayerName');
            await bakeObject(objExt, layerSettings, loadGlobalLight());
            img.scaleToWidth(Math.min((canvas.width || 800) * 0.4, 480));
            canvas.centerObject(img);
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
        } finally {
            setBusy(false);
        }
    };

    const openEditor = () => {
        const src = settings?.sourceRef ?? layerSourceUrl(ext);
        if (src) setEditorSrc(src);
    };

    const handleApplyUnwarp = async (result: UnwarpEditorResult) => {
        const src = editorSrc;
        setEditorSrc(null);
        if (!canvas || !src) return;
        setBusy(true);
        try {
            const image = await loadImage(src);
            const size = { width: image.naturalWidth, height: image.naturalHeight };
            const quadPx = cornersToPx(result.corners, size);
            const aspect = (result.aspectMode === 'metric' && metricAspect(quadPx, size, result.focal35))
                || autoAspect(quadPx);
            const flatSize = flatSizeForQuad(quadPx, aspect);
            const flat = unwarpQuad(image, quadPx, flatSize);

            if (settings && ext.is3DLayer) {
                // Re-adjusting an existing 3D layer: swap its pixels and settings.
                const img = ext as unknown as fabric.Image;
                const el = await loadImage(flat.toDataURL('image/png'));
                img.setElement(el);
                ext.threeDLayerSettings = {
                    ...settings,
                    corners: result.corners,
                    aspectMode: result.aspectMode,
                    focal35: result.focal35,
                    gridDivisions: result.gridDivisions,
                    flatSize,
                };
                ext.set('dirty', true);
                canvas.requestRenderAll();
                canvas.fire('object:modified', { target: ext } as never);
                return;
            }

            const flatImg = await fabric.FabricImage.fromURL(flat.toDataURL('image/png'));
            const layerSettings: ThreeDLayerSettings = {
                mode: 'unwarp',
                sourceRef: src,
                corners: result.corners,
                aspectMode: result.aspectMode,
                focal35: result.focal35,
                gridDivisions: result.gridDivisions,
                flatSize,
                rewarp: { ...DEFAULT_REWARP },
            };
            const flatExt = flatImg as unknown as ExtendedFabricObject;
            flatExt.is3DLayer = true;
            flatExt.threeDLayerSettings = layerSettings;
            flatExt.name = t('layer3d.layerName');
            // Track the source layer so rewarp can land back on it.
            (layerSettings as ThreeDLayerSettings & { sourceLayerId?: string }).sourceLayerId = ext.id;

            const maxW = (canvas.width || 800) * 0.6;
            if (flatImg.width! > maxW) flatImg.scaleToWidth(maxW);
            flatImg.set({ left: (ext.left ?? 0) + 24, top: (ext.top ?? 0) + 24 });
            canvas.add(flatImg);
            canvas.setActiveObject(flatImg);
            canvas.requestRenderAll();
        } finally {
            setBusy(false);
        }
    };

    const handleCreateRelight = async () => {
        if (!canvas) return;
        const src = layerSourceUrl(ext);
        if (!src) return;
        setBusy(true);
        setDepthProgress(t('layer3d.relight.loadingModel'));
        try {
            const sourceImg = await loadImage(src);
            let depth: HTMLCanvasElement;
            let depthSource: 'model' | 'fallback' = 'model';
            try {
                depth = await estimateDepth(src);
            } catch (err) {
                // Model unavailable (offline / unsupported) — degrade to the
                // luminance pseudo-depth so the tool still works, but say so.
                console.warn('3D layer: depth model failed, using luminance fallback', err);
                depth = luminancePseudoDepth(sourceImg);
                depthSource = 'fallback';
            }
            setDepthProgress(t('layer3d.relight.generatingNormals'));
            const normals = normalsFromDepth(depth);

            const relightImg = await fabric.FabricImage.fromURL(src);
            const layerSettings: ThreeDLayerSettings = {
                mode: 'relight',
                sourceRef: src,
                depthRef: depth.toDataURL('image/png'),
                normalRef: normals.toDataURL('image/png'),
                depthSpace: 'disparity',
                depthSource,
                useGlobalLight: true,
                lights: [],
                ambient: { color: '#ffffff', intensity: 0.35 },
            };
            const relightExt = relightImg as unknown as ExtendedFabricObject;
            relightExt.is3DLayer = true;
            relightExt.threeDLayerSettings = layerSettings;
            relightExt.name = t('layer3d.relightLayerName');
            relightImg.set({
                left: ext.left, top: ext.top,
                scaleX: ext.scaleX, scaleY: ext.scaleY,
                angle: ext.angle, originX: ext.originX, originY: ext.originY,
            });
            await bakeRelight(relightExt, layerSettings, loadGlobalLight());
            canvas.add(relightImg);
            canvas.setActiveObject(relightImg);
            canvas.requestRenderAll();
        } finally {
            setBusy(false);
            setDepthProgress(null);
        }
    };

    const updateRewarp = (patch: Partial<NonNullable<ThreeDLayerSettings['rewarp']>>) => {
        if (!settings) return;
        ext.threeDLayerSettings = {
            ...settings,
            rewarp: { ...DEFAULT_REWARP, ...settings.rewarp, ...patch },
        };
        canvas?.fire('object:modified', { target: ext } as never);
    };

    const handleRewarp = async () => {
        if (!canvas || !settings?.sourceRef || !settings.corners || !settings.flatSize) return;
        setBusy(true);
        try {
            const original = await loadImage(settings.sourceRef);
            const size = { width: original.naturalWidth, height: original.naturalHeight };
            const quadPx = cornersToPx(settings.corners, size);
            // Render the flat layer at its native pixel size, including any
            // filters/adjustments the user applied to it on the canvas.
            const mult = 1 / Math.max(ext.scaleX ?? 1, 1e-6);
            const editedUrl = ext.toDataURL({ format: 'png', multiplier: mult });
            const edited = await loadImage(editedUrl);
            const { element } = rewarpQuad(original, edited, quadPx, settings.flatSize, {
                ...DEFAULT_REWARP,
                ...settings.rewarp,
            });

            const resultImg = await fabric.FabricImage.fromURL(element.toDataURL('image/png'));
            const sourceLayerId = (settings as ThreeDLayerSettings & { sourceLayerId?: string }).sourceLayerId;
            const sourceLayer = sourceLayerId
                ? (canvas.getObjects() as ExtendedFabricObject[]).find((o) => o.id === sourceLayerId)
                : undefined;
            if (sourceLayer) {
                resultImg.set({
                    left: sourceLayer.left,
                    top: sourceLayer.top,
                    scaleX: sourceLayer.scaleX,
                    scaleY: sourceLayer.scaleY,
                    angle: sourceLayer.angle,
                    originX: sourceLayer.originX,
                    originY: sourceLayer.originY,
                    flipX: sourceLayer.flipX,
                    flipY: sourceLayer.flipY,
                });
            } else {
                canvas.centerObject(resultImg);
            }
            (resultImg as unknown as ExtendedFabricObject).name = t('layer3d.rewarpLayerName');
            canvas.add(resultImg);
            canvas.setActiveObject(resultImg);
            canvas.requestRenderAll();
        } finally {
            setBusy(false);
        }
    };

    const rewarp = { ...DEFAULT_REWARP, ...settings?.rewarp };

    // Compact tool row: one icon per 3D tool instead of stacked buttons —
    // most layers never use these, so they should take a single line.
    const toolButton = (title: string, onClick: () => void, icon: React.ReactNode, testId: string) => (
        <button
            onClick={onClick}
            disabled={busy}
            title={title}
            aria-label={title}
            data-testid={testId}
            className="p-1.5 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
        >
            {icon}
        </button>
    );

    return (
        <div className="p-3 border-b border-border space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Box size={13} />
                {t('layer3d.section')}
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                    {canUnwarp && toolButton(t('layer3d.unwarp.open'), openEditor, <Scan size={13} />, 'layer3d-tool-unwarp')}
                    {canRelight && toolButton(t('layer3d.relight.open'), () => { void handleCreateRelight(); }, <Sun size={13} />, 'layer3d-tool-relight')}
                    {isImageLayer && toolButton(t('layer3d.object.open'), () => { void handleCreateObject(); }, <Boxes size={13} />, 'layer3d-tool-object')}
                </div>
            </div>
            {depthProgress && (
                <p className="text-[10px] text-muted-foreground">{depthProgress}</p>
            )}

            {settings?.mode === 'object' && (
                <ThreeDObjectControls canvas={canvas} layer={ext} settings={settings} />
            )}

            {settings?.mode === 'relight' && (
                <ThreeDRelightControls canvas={canvas} layer={ext} settings={settings} />
            )}

            {settings && settings.mode === 'unwarp' && (
                <div className="space-y-2.5">
                    <button
                        onClick={openEditor}
                        disabled={busy}
                        className="w-full px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-secondary transition-colors text-left disabled:opacity-50"
                    >
                        {t('layer3d.rewarp.adjust')}
                    </button>
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{t('layer3d.rewarp.feather')}</span>
                            <span>{rewarp.feather}px</span>
                        </div>
                        <input
                            type="range" min={0} max={64} value={rewarp.feather}
                            onChange={(e) => updateRewarp({ feather: parseInt(e.target.value) })}
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{t('layer3d.rewarp.edgeHardness')}</span>
                            <span>{Math.round(rewarp.edgeHardness * 100)}%</span>
                        </div>
                        <input
                            type="range" min={0} max={100} value={Math.round(rewarp.edgeHardness * 100)}
                            onChange={(e) => updateRewarp({ edgeHardness: parseInt(e.target.value) / 100 })}
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                            type="checkbox"
                            checked={rewarp.matchColors}
                            onChange={(e) => updateRewarp({ matchColors: e.target.checked })}
                        />
                        {t('layer3d.rewarp.matchColors')}
                    </label>
                    <button
                        onClick={handleRewarp}
                        disabled={busy}
                        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {busy ? t('layer3d.working') : t('layer3d.rewarp.apply')}
                    </button>
                </div>
            )}

            {editorSrc && (
                <UnwarpEditorModal
                    imageSrc={editorSrc}
                    initialCorners={settings?.corners as Vec2[] | undefined}
                    initialAspectMode={settings?.aspectMode}
                    initialFocal35={settings?.focal35}
                    initialGridDivisions={settings?.gridDivisions}
                    onCancel={() => setEditorSrc(null)}
                    onApply={(r) => { void handleApplyUnwarp(r); }}
                />
            )}
        </div>
    );
}
