'use client';

// In-panel 3D lighting workspace for a placed 3D model layer (is3DModel):
// the same lighting controls as the 3D View Editor — drag the sun around
// the object on the live preview, presets, shadows, rotate/scale — editing
// the SELECTED layer in place. It never creates new layers. Rendering uses
// the headless bake (bakeModelWithSettings) so preview and layer pixels are
// always the same picture; the full modal editor is one click away.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, Wand2, Box as BoxIcon, Maximize2 } from 'lucide-react';
import * as fabric from 'fabric';
import { useI18n } from '@/providers/I18nProvider';
import type { ExtendedFabricObject, ThreeDSettings } from '@/types';
import { bakeModelWithSettings } from '@/lib/threeDLayer/objectBake';
import { setLayerElementPreservingSize } from '@/lib/threeDLayer/bake';
import {
    LIGHT_PRESETS,
    MiniSlider,
    MiniToggle,
    SectionTitle,
    vecScaleTo,
    type LightPreset,
} from '@/components/ThreeDLayerEditor';

interface ThreeDModelLayerPanelProps {
    canvas: fabric.Canvas | null;
    layer: ExtendedFabricObject;
    /** Open the full-size 3D View Editor for this layer (existing modal). */
    onOpenFullEditor?: (modelUrl: string, layer: ExtendedFabricObject) => void;
}

const DEFAULTS: ThreeDSettings = {
    lightPosition: { x: 5, y: 5, z: 5 },
    lightIntensity: 1.2,
    lightColor: '#ffffff',
    castShadowEnabled: true,
    castShadowBlur: 22,
    castShadowIntensity: 0.35,
    contactShadowEnabled: true,
    contactShadowBlur: 8,
    contactShadowIntensity: 0.6,
    resolution: { width: 1024, height: 1024 },
    ambientIntensity: 0.35,
    modelRotationY: 0,
    modelScale: 1,
};

const toSpherical = (p: { x: number; y: number; z: number }) => {
    const r = Math.hypot(p.x, p.y, p.z) || 1;
    return {
        azimuth: Math.atan2(p.z, p.x),
        elevation: Math.asin(Math.min(1, Math.max(-1, p.y / r))),
    };
};

const fromSpherical = (azimuth: number, elevation: number) => ({
    x: Math.cos(elevation) * Math.cos(azimuth),
    y: Math.sin(elevation),
    z: Math.cos(elevation) * Math.sin(azimuth),
});

export function ThreeDModelLayerPanel({ canvas, layer, onOpenFullEditor }: ThreeDModelLayerPanelProps) {
    const { t } = useI18n();
    const modelUrl = layer.modelUrl!;
    const [settings, setSettings] = useState<ThreeDSettings>({ ...DEFAULTS, ...layer.threeDSettings });
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [activePreset, setActivePreset] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const bakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bakeBusy = useRef(false);
    const pendingSettings = useRef<ThreeDSettings | null>(null);
    const dragRef = useRef<{ startX: number; startY: number; azimuth: number; elevation: number } | null>(null);

    const layerId = layer.id;
    useEffect(() => {
        setSettings({ ...DEFAULTS, ...layer.threeDSettings });
        setActivePreset(null);
        setPreviewUrl(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layerId]);

    const runBake = useCallback(async (next: ThreeDSettings, applyToLayer: boolean) => {
        if (bakeBusy.current) {
            pendingSettings.current = next;
            return;
        }
        bakeBusy.current = true;
        try {
            const result = await bakeModelWithSettings(modelUrl, next, next.resolution ?? DEFAULTS.resolution);
            setPreviewUrl(result.toDataURL('image/png'));
            setFailed(false);
            if (applyToLayer && canvas) {
                setLayerElementPreservingSize(layer, result);
                layer.threeDSettings = next;
                canvas.requestRenderAll();
                canvas.fire('object:modified', { target: layer } as never);
            }
        } catch (e) {
            console.error('3D layer panel bake failed', e);
            setFailed(true);
        } finally {
            bakeBusy.current = false;
            if (pendingSettings.current) {
                const queued = pendingSettings.current;
                pendingSettings.current = null;
                void runBake(queued, applyToLayer);
            }
        }
    }, [canvas, layer, modelUrl]);

    // First paint: preview only (don't touch the layer until the user edits).
    useEffect(() => {
        void runBake({ ...DEFAULTS, ...layer.threeDSettings }, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layerId, modelUrl]);

    const update = useCallback((patch: Partial<ThreeDSettings>) => {
        setSettings((prev) => {
            const next = { ...prev, ...patch };
            if (bakeTimer.current) clearTimeout(bakeTimer.current);
            bakeTimer.current = setTimeout(() => { void runBake(next, true); }, 250);
            return next;
        });
    }, [runBake]);

    useEffect(() => () => { if (bakeTimer.current) clearTimeout(bakeTimer.current); }, []);

    const applyPreset = (preset: LightPreset) => {
        setActivePreset(preset.name);
        update({
            lightPosition: vecScaleTo(preset.direction, 7),
            lightIntensity: preset.intensity,
            lightColor: preset.color,
            ambientIntensity: preset.ambient,
        });
    };

    // Drag on the preview orbits the sun around the object (like the modal's
    // gizmo): horizontal = azimuth, vertical = elevation.
    const onPointerDown = (e: React.PointerEvent) => {
        const s = toSpherical(settings.lightPosition ?? DEFAULTS.lightPosition);
        dragRef.current = { startX: e.clientX, startY: e.clientY, azimuth: s.azimuth, elevation: s.elevation };
        (e.target as Element).setPointerCapture(e.pointerId);
        setActivePreset(null);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const azimuth = d.azimuth + (e.clientX - d.startX) * 0.02;
        const elevation = Math.min(1.45, Math.max(-0.2, d.elevation + (d.startY - e.clientY) * 0.012));
        const dir = fromSpherical(azimuth, elevation);
        update({ lightPosition: vecScaleTo(dir, 7) });
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (dragRef.current) (e.target as Element).releasePointerCapture(e.pointerId);
        dragRef.current = null;
    };

    return (
        <div className="space-y-2.5">
            <div
                className="relative h-52 rounded-md overflow-hidden border border-border/60 bg-secondary/20 checkerboard-bg cursor-grab active:cursor-grabbing select-none"
                style={{ touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                data-testid="layer3d-model-preview"
            >
                {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                        {failed ? t('layer3d.model.failed') : t('layer3d.working')}
                    </div>
                )}
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full backdrop-blur pointer-events-none whitespace-nowrap">
                    {t('layer3d.model.dragHint')}
                </div>
                {onOpenFullEditor && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenFullEditor(modelUrl, layer); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={t('view3d.title')}
                        aria-label={t('view3d.title')}
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-background/80 border border-border/60 text-muted-foreground hover:text-foreground backdrop-blur"
                    >
                        <Maximize2 size={12} />
                    </button>
                )}
            </div>

            <SectionTitle icon={<Wand2 size={12} />}>{t('view3d.lightPresets')}</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
                {LIGHT_PRESETS.map((preset) => (
                    <button
                        key={preset.name}
                        onClick={() => applyPreset(preset)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[10px] transition-colors text-left ${activePreset === preset.name
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted hover:bg-muted/70 border-transparent'}`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: preset.swatch }} />
                        {t(preset.labelKey)}
                    </button>
                ))}
            </div>

            <SectionTitle icon={<Sun size={12} />}>{t('view3d.light')}</SectionTitle>
            <MiniSlider label={t('view3d.intensity')} value={settings.lightIntensity} min={0} max={4} step={0.05}
                onChange={(v) => update({ lightIntensity: v })} format={(v) => v.toFixed(2)} />
            <MiniSlider label={t('view3d.ambient')} value={settings.ambientIntensity ?? 0.35} min={0} max={1.5} step={0.05}
                onChange={(v) => update({ ambientIntensity: v })} format={(v) => v.toFixed(2)} />
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">{t('view3d.color')}</span>
                <input type="color" value={settings.lightColor}
                    onChange={(e) => update({ lightColor: e.target.value })}
                    className="w-8 h-5 bg-transparent cursor-pointer" />
            </div>

            <SectionTitle icon={<Sun size={12} />}>{t('view3d.shadows')}</SectionTitle>
            <MiniToggle label={t('view3d.castShadow')} checked={settings.castShadowEnabled}
                onChange={(v) => update({ castShadowEnabled: v })} />
            {settings.castShadowEnabled && (
                <>
                    <MiniSlider label={t('view3d.castBlur')} value={settings.castShadowBlur} min={0} max={60} step={1}
                        onChange={(v) => update({ castShadowBlur: v })} />
                    <MiniSlider label={t('view3d.castIntensity')} value={settings.castShadowIntensity} min={0} max={1} step={0.05}
                        onChange={(v) => update({ castShadowIntensity: v })} format={(v) => v.toFixed(2)} />
                </>
            )}

            <SectionTitle icon={<BoxIcon size={12} />}>{t('view3d.model')}</SectionTitle>
            <MiniSlider label={t('view3d.rotate')} value={settings.modelRotationY ?? 0} min={0} max={360} step={1}
                onChange={(v) => update({ modelRotationY: v })} format={(v) => `${Math.round(v)}°`} />
            <MiniSlider label={t('view3d.scale')} value={settings.modelScale ?? 1} min={0.2} max={3} step={0.05}
                onChange={(v) => update({ modelScale: v })} format={(v) => v.toFixed(2)} />
        </div>
    );
}
