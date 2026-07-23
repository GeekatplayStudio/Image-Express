'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Upload } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { ExtendedFabricObject, ThreeDLayerSettings } from '@/types';
import { loadGlobalLight, subscribeGlobalLight } from '@/lib/threeDLayer/globalLight';
import { bakeObject, rebakeGlobalLightLayers } from '@/lib/threeDLayer/bake';

interface ThreeDObjectControlsProps {
    canvas: fabric.Canvas | null;
    layer: ExtendedFabricObject;
    settings: ThreeDLayerSettings;
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

export function ThreeDObjectControls({ canvas, layer, settings: settingsProp }: ThreeDObjectControlsProps) {
    // Parent doesn't re-render on our own updates — read live settings.
    const settings = layer.threeDLayerSettings ?? settingsProp;
    const { t } = useI18n();
    const bakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [, forceRender] = useState(0);

    const scheduleBake = useCallback((next: ThreeDLayerSettings) => {
        if (bakeTimer.current) clearTimeout(bakeTimer.current);
        bakeTimer.current = setTimeout(() => {
            void bakeObject(layer, next, loadGlobalLight()).then(() => canvas?.requestRenderAll());
        }, 150);
    }, [canvas, layer]);

    const update = useCallback((patch: Partial<NonNullable<ThreeDLayerSettings['object']>>) => {
        const next: ThreeDLayerSettings = {
            ...layer.threeDLayerSettings as ThreeDLayerSettings,
            object: { ...layer.threeDLayerSettings?.object, ...patch },
        };
        layer.set('threeDLayerSettings', next);
        forceRender((n) => n + 1);
        scheduleBake(next);
    }, [layer, scheduleBake]);

    // Global sun changes re-bake every sun-following 3D layer on the canvas.
    useEffect(() => subscribeGlobalLight((state) => {
        if (canvas) rebakeGlobalLightLayers(canvas, state);
    }), [canvas]);

    useEffect(() => () => {
        if (bakeTimer.current) clearTimeout(bakeTimer.current);
        canvas?.fire('object:modified', { target: layer } as never);
    }, [canvas, layer]);

    const handleModelFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const next: ThreeDLayerSettings = {
                ...layer.threeDLayerSettings as ThreeDLayerSettings,
                modelUrl: reader.result as string,
            };
            layer.set('threeDLayerSettings', next);
            scheduleBake(next);
        };
        reader.readAsDataURL(file);
    };

    const o = settings.object ?? {};

    return (
        <div className="space-y-2.5">
            <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-secondary transition-colors"
            >
                <Upload size={12} />
                {t('layer3d.object.loadModel')}
            </button>
            <input
                ref={fileRef} type="file" accept=".glb,.gltf,model/gltf-binary" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleModelFile(f); e.target.value = ''; }}
            />
            <Slider label={t('layer3d.object.rotationY')} value={o.rotationY ?? 0}
                display={`${Math.round(o.rotationY ?? 0)}°`} min={0} max={360} step={1}
                onChange={(v) => update({ rotationY: v })} />
            <Slider label={t('layer3d.object.rotationX')} value={o.rotationX ?? 0}
                display={`${Math.round(o.rotationX ?? 0)}°`} min={-45} max={45} step={1}
                onChange={(v) => update({ rotationX: v })} />
            <Slider label={t('layer3d.object.scale')} value={o.scale ?? 1}
                display={(o.scale ?? 1).toFixed(2)} min={0.2} max={3} step={0.05}
                onChange={(v) => update({ scale: v })} />
            <Slider label={t('layer3d.object.fov')} value={o.cameraFovV ?? 40}
                display={`${Math.round(o.cameraFovV ?? 40)}°`} min={15} max={90} step={1}
                onChange={(v) => update({ cameraFovV: v })} />
            <Slider label={t('layer3d.object.elevation')} value={o.cameraElevation ?? 12}
                display={`${Math.round(o.cameraElevation ?? 12)}°`} min={0} max={60} step={1}
                onChange={(v) => update({ cameraElevation: v })} />
            <Slider label={t('layer3d.object.shadowOpacity')} value={o.shadowOpacity ?? 0.35}
                display={`${Math.round((o.shadowOpacity ?? 0.35) * 100)}%`} min={0} max={1} step={0.05}
                onChange={(v) => update({ shadowOpacity: v })} />
            <p className="text-[10px] text-muted-foreground">{t('layer3d.object.sunHint')}</p>
        </div>
    );
}
