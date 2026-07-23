'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Plus, Sun, Trash2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { ExtendedFabricObject, ThreeDLayerLight, ThreeDLayerSettings } from '@/types';
import { renderRelight } from '@/lib/threeDLayer/relightShader';
import { applyLensBlur } from '@/lib/threeDLayer/lensBlur';
import {
    globalLightAsLayerLight,
    loadGlobalLight,
    saveGlobalLight,
    subscribeGlobalLight,
    type GlobalLightState,
} from '@/lib/threeDLayer/globalLight';

interface ThreeDRelightControlsProps {
    canvas: fabric.Canvas | null;
    layer: ExtendedFabricObject;
    settings: ThreeDLayerSettings;
}

type RelightCache = { source?: HTMLCanvasElement; depth?: HTMLCanvasElement; normals?: HTMLCanvasElement };
type LayerWithCache = ExtendedFabricObject & { __relightCache?: RelightCache };

const DEFAULT_AMBIENT = { color: '#ffffff', intensity: 0.35 };
export const LOCAL_SUN_ID = 'local-sun';

function loadCanvas(src: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d')!.drawImage(img, 0, 0);
            resolve(c);
        };
        img.onerror = reject;
        img.src = src;
    });
}

/** All lights the bake actually uses for a given settings snapshot. */
export function effectiveLights(settings: ThreeDLayerSettings, global: GlobalLightState): ThreeDLayerLight[] {
    const locals = settings.lights ?? [];
    if (settings.useGlobalLight) {
        return [globalLightAsLayerLight(global), ...locals.filter((l) => l.kind === 'point')];
    }
    return locals;
}

export async function bakeRelight(layer: LayerWithCache, settings: ThreeDLayerSettings, global: GlobalLightState) {
    if (!settings.sourceRef || !settings.depthRef || !settings.normalRef) return;
    const cache = layer.__relightCache ?? (layer.__relightCache = {});
    cache.source = cache.source ?? await loadCanvas(settings.sourceRef);
    cache.depth = cache.depth ?? await loadCanvas(settings.depthRef);
    cache.normals = cache.normals ?? await loadCanvas(settings.normalRef);
    let result = renderRelight(
        cache.source,
        cache.normals,
        cache.depth,
        effectiveLights(settings, global),
        { ...DEFAULT_AMBIENT, ...settings.ambient },
    );
    if (settings.lensBlur?.enabled) {
        result = applyLensBlur(result, cache.depth, settings.lensBlur);
    }
    (layer as unknown as fabric.Image).setElement(result as unknown as HTMLImageElement);
    layer.set('dirty', true);
}

function Slider({ label, value, display, min, max, step, onChange }: {
    label: string; value: number; display: string;
    min: number; max: number; step: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{label}</span>
                <span>{display}</span>
            </div>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
            />
        </div>
    );
}

export function ThreeDRelightControls({ canvas, layer, settings: settingsProp }: ThreeDRelightControlsProps) {
    // The parent doesn't re-render on our own updates — always read the
    // layer's live settings, falling back to the prop for the first paint.
    const settings = layer.threeDLayerSettings ?? settingsProp;
    const { t } = useI18n();
    const [global, setGlobal] = useState<GlobalLightState>(() => loadGlobalLight());
    const [, forceRender] = useState(0);
    const bakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleBake = useCallback((nextSettings: ThreeDLayerSettings, nextGlobal?: GlobalLightState) => {
        if (bakeTimer.current) clearTimeout(bakeTimer.current);
        const g = nextGlobal ?? loadGlobalLight();
        bakeTimer.current = setTimeout(() => {
            void bakeRelight(layer as LayerWithCache, nextSettings, g).then(() => {
                canvas?.requestRenderAll();
            });
        }, 150);
    }, [canvas, layer]);

    const update = useCallback((patch: Partial<ThreeDLayerSettings>) => {
        const next = { ...layer.threeDLayerSettings, ...patch } as ThreeDLayerSettings;
        layer.set('threeDLayerSettings', next);
        forceRender((n) => n + 1);
        scheduleBake(next);
    }, [layer, scheduleBake]);

    const updateGlobal = useCallback((patch: Partial<GlobalLightState>) => {
        const next = { ...loadGlobalLight(), ...patch };
        saveGlobalLight(next);
        setGlobal(next);
    }, []);

    // Global sun changes re-bake every relight layer on the canvas that
    // follows it (not just the selected one).
    useEffect(() => subscribeGlobalLight((state) => {
        setGlobal(state);
        if (!canvas) return;
        (canvas.getObjects() as LayerWithCache[])
            .filter((o) => o.is3DLayer && o.threeDLayerSettings?.mode === 'relight' && o.threeDLayerSettings.useGlobalLight)
            .forEach((o) => {
                void bakeRelight(o, o.threeDLayerSettings!, state).then(() => canvas.requestRenderAll());
            });
    }), [canvas]);

    // Commit to history once sliders stop moving.
    useEffect(() => () => {
        if (bakeTimer.current) clearTimeout(bakeTimer.current);
        canvas?.fire('object:modified', { target: layer } as never);
    }, [canvas, layer]);

    const localSun = (settings.lights ?? []).find((l) => l.id === LOCAL_SUN_ID);
    const pointLights = (settings.lights ?? []).filter((l) => l.kind === 'point');
    const useGlobal = settings.useGlobalLight !== false;
    const sun = useGlobal
        ? { azimuth: global.azimuth, elevation: global.elevation, intensity: global.intensity, color: global.color, shadows: global.shadows }
        : {
            azimuth: localSun?.azimuth ?? 120,
            elevation: localSun?.elevation ?? 45,
            intensity: localSun?.intensity ?? 1,
            color: localSun?.color ?? '#ffffff',
            shadows: localSun?.shadows ?? { enabled: true, strength: 0.5, softness: 0.3, range: 0.15 },
        };

    const setSun = (patch: Partial<typeof sun>) => {
        if (useGlobal) {
            updateGlobal(patch as Partial<GlobalLightState>);
            return;
        }
        const nextSun: ThreeDLayerLight = {
            id: LOCAL_SUN_ID, kind: 'directional',
            color: patch.color ?? sun.color,
            intensity: patch.intensity ?? sun.intensity,
            azimuth: patch.azimuth ?? sun.azimuth,
            elevation: patch.elevation ?? sun.elevation,
            shadows: patch.shadows ?? sun.shadows,
        };
        update({ lights: [nextSun, ...pointLights] });
    };

    const setPointLight = (id: string, patch: Partial<ThreeDLayerLight>) => {
        update({
            lights: (settings.lights ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)),
        });
    };

    const ambient = { ...DEFAULT_AMBIENT, ...settings.ambient };

    return (
        <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                <Sun size={12} />
                {t('layer3d.relight.sun')}
                <div className="flex-1" />
                <label className="flex items-center gap-1.5 font-normal cursor-pointer">
                    <input
                        type="checkbox"
                        checked={useGlobal}
                        onChange={(e) => update({ useGlobalLight: e.target.checked })}
                    />
                    {t('layer3d.relight.global')}
                </label>
            </div>
            <Slider label={t('layer3d.relight.azimuth')} value={sun.azimuth} display={`${Math.round(sun.azimuth)}°`}
                min={0} max={360} step={1} onChange={(v) => setSun({ azimuth: v })} />
            <Slider label={t('layer3d.relight.elevation')} value={sun.elevation} display={`${Math.round(sun.elevation)}°`}
                min={5} max={90} step={1} onChange={(v) => setSun({ elevation: v })} />
            <Slider label={t('layer3d.relight.intensity')} value={sun.intensity} display={sun.intensity.toFixed(2)}
                min={0} max={3} step={0.05} onChange={(v) => setSun({ intensity: v })} />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{t('layer3d.relight.color')}</span>
                <input type="color" value={sun.color} onChange={(e) => setSun({ color: e.target.value })}
                    className="w-8 h-5 bg-transparent cursor-pointer" />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={sun.shadows.enabled}
                    onChange={(e) => setSun({ shadows: { ...sun.shadows, enabled: e.target.checked } })} />
                {t('layer3d.relight.shadows')}
            </label>
            {sun.shadows.enabled && (
                <>
                    <Slider label={t('layer3d.relight.shadowStrength')} value={sun.shadows.strength}
                        display={`${Math.round(sun.shadows.strength * 100)}%`} min={0} max={1} step={0.05}
                        onChange={(v) => setSun({ shadows: { ...sun.shadows, strength: v } })} />
                    <Slider label={t('layer3d.relight.shadowSoftness')} value={sun.shadows.softness}
                        display={`${Math.round(sun.shadows.softness * 100)}%`} min={0.05} max={1} step={0.05}
                        onChange={(v) => setSun({ shadows: { ...sun.shadows, softness: v } })} />
                </>
            )}

            <Slider label={t('layer3d.relight.ambient')} value={ambient.intensity}
                display={ambient.intensity.toFixed(2)} min={0} max={1} step={0.05}
                onChange={(v) => update({ ambient: { ...ambient, intensity: v } })} />

            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                {t('layer3d.relight.pointLights')}
                <div className="flex-1" />
                <button
                    onClick={() => update({
                        lights: [...(settings.lights ?? []), {
                            id: `pt-${Date.now()}`, kind: 'point', color: '#ffdf9e', intensity: 1.2,
                            x: 0.5, y: 0.35, z: 1, radius: 0.45, softness: 0.3,
                            shadows: { enabled: true, strength: 0.5, softness: 0.3, range: 0.12 },
                        }],
                    })}
                    className="p-1 rounded hover:bg-secondary"
                    title={t('layer3d.relight.addLight')}
                >
                    <Plus size={12} />
                </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground pt-1">
                {t('layer3d.vfx.lensBlur')}
                <div className="flex-1" />
                <input
                    type="checkbox"
                    checked={settings.lensBlur?.enabled ?? false}
                    onChange={(e) => update({
                        lensBlur: {
                            focusX: 0.5, focusY: 0.5, focalOffset: 0, strength: 0.5, fieldOfDepth: 0.25,
                            ...settings.lensBlur,
                            enabled: e.target.checked,
                        },
                    })}
                />
            </div>
            {settings.lensBlur?.enabled && (
                <>
                    <Slider label={t('layer3d.vfx.focusX')} value={settings.lensBlur.focusX}
                        display={`${Math.round(settings.lensBlur.focusX * 100)}%`} min={0} max={1} step={0.01}
                        onChange={(v) => update({ lensBlur: { ...settings.lensBlur!, focusX: v } })} />
                    <Slider label={t('layer3d.vfx.focusY')} value={settings.lensBlur.focusY}
                        display={`${Math.round(settings.lensBlur.focusY * 100)}%`} min={0} max={1} step={0.01}
                        onChange={(v) => update({ lensBlur: { ...settings.lensBlur!, focusY: v } })} />
                    <Slider label={t('layer3d.vfx.strength')} value={settings.lensBlur.strength}
                        display={`${Math.round(settings.lensBlur.strength * 100)}%`} min={0} max={1} step={0.05}
                        onChange={(v) => update({ lensBlur: { ...settings.lensBlur!, strength: v } })} />
                    <Slider label={t('layer3d.vfx.fieldOfDepth')} value={settings.lensBlur.fieldOfDepth}
                        display={`${Math.round(settings.lensBlur.fieldOfDepth * 100)}%`} min={0.02} max={1} step={0.02}
                        onChange={(v) => update({ lensBlur: { ...settings.lensBlur!, fieldOfDepth: v } })} />
                    <Slider label={t('layer3d.vfx.focalOffset')} value={settings.lensBlur.focalOffset}
                        display={settings.lensBlur.focalOffset.toFixed(2)} min={-1} max={1} step={0.02}
                        onChange={(v) => update({ lensBlur: { ...settings.lensBlur!, focalOffset: v } })} />
                </>
            )}

            {pointLights.map((light, idx) => (
                <div key={light.id} className="p-2 rounded-md border border-border/60 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{t('layer3d.relight.light')} {idx + 1}</span>
                        <span className="flex items-center gap-1.5">
                            <input type="color" value={light.color}
                                onChange={(e) => setPointLight(light.id, { color: e.target.value })}
                                className="w-7 h-4 bg-transparent cursor-pointer" />
                            <button
                                onClick={() => update({ lights: (settings.lights ?? []).filter((l) => l.id !== light.id) })}
                                className="p-0.5 rounded hover:bg-secondary" title={t('layer3d.relight.removeLight')}>
                                <Trash2 size={11} />
                            </button>
                        </span>
                    </div>
                    <Slider label="X" value={light.x ?? 0.5} display={`${Math.round((light.x ?? 0.5) * 100)}%`}
                        min={-0.2} max={1.2} step={0.01} onChange={(v) => setPointLight(light.id, { x: v })} />
                    <Slider label="Y" value={light.y ?? 0.5} display={`${Math.round((light.y ?? 0.5) * 100)}%`}
                        min={-0.2} max={1.2} step={0.01} onChange={(v) => setPointLight(light.id, { y: v })} />
                    <Slider label="Z" value={light.z ?? 1} display={(light.z ?? 1).toFixed(2)}
                        min={0.2} max={3} step={0.05} onChange={(v) => setPointLight(light.id, { z: v })} />
                    <Slider label={t('layer3d.relight.radius')} value={light.radius ?? 0.45}
                        display={`${Math.round((light.radius ?? 0.45) * 100)}%`}
                        min={0.05} max={1.5} step={0.05} onChange={(v) => setPointLight(light.id, { radius: v })} />
                    <Slider label={t('layer3d.relight.intensity')} value={light.intensity}
                        display={light.intensity.toFixed(2)} min={0} max={4} step={0.05}
                        onChange={(v) => setPointLight(light.id, { intensity: v })} />
                </div>
            ))}
        </div>
    );
}
