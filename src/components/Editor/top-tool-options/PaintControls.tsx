'use client';

import { PAINT_BRUSH_PRESET_OPTIONS, type RasterBlendMode, type RasterBrushPreset } from '@/lib/raster-engine';
import { useI18n } from '@/providers/I18nProvider';

interface PaintControlsProps {
    paintOptions: {
        brushPreset: RasterBrushPreset;
        size: number;
        hardness: number;
        opacity: number;
        flow: number;
        smoothing: number;
        blendMode: RasterBlendMode;
    };
    onPaintPresetChange?: (preset: RasterBrushPreset) => void;
    onPaintSizeChange?: (size: number) => void;
    onPaintHardnessChange?: (hardness: number) => void;
    onPaintOpacityChange?: (opacity: number) => void;
    onPaintFlowChange?: (flow: number) => void;
    onPaintSmoothingChange?: (smoothing: number) => void;
    onPaintBlendModeChange?: (mode: RasterBlendMode) => void;
}

export default function PaintControls({
    paintOptions,
    onPaintPresetChange,
    onPaintSizeChange,
    onPaintHardnessChange,
    onPaintOpacityChange,
    onPaintFlowChange,
    onPaintSmoothingChange,
    onPaintBlendModeChange,
}: PaintControlsProps) {
    const { t } = useI18n();
    return (
        <>
            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">{t('panel.brushes.preset')}</span>
                <select
                    aria-label={t('paint.presetAria')}
                    value={paintOptions.brushPreset}
                    onChange={(event) => onPaintPresetChange?.(event.target.value as RasterBrushPreset)}
                    className="bg-transparent outline-none"
                >
                    {PAINT_BRUSH_PRESET_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                    ))}
                </select>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">{t('panel.brushes.size')}</span>
                <input
                    aria-label={t('paint.sizeAria')}
                    type="range"
                    min={1}
                    max={100}
                    value={paintOptions.size}
                    onChange={(event) => onPaintSizeChange?.(Number(event.target.value))}
                    className="w-16"
                />
                <span>{paintOptions.size}</span>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">{t('panel.brushes.hardness')}</span>
                <input
                    aria-label={t('paint.hardnessAria')}
                    type="range"
                    min={0}
                    max={100}
                    value={paintOptions.hardness}
                    onChange={(event) => onPaintHardnessChange?.(Number(event.target.value))}
                    className="w-16"
                />
                <span>{paintOptions.hardness}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">{t('ctrl.opacity')}</span>
                <input
                    aria-label={t('paint.opacityAria')}
                    type="range"
                    min={1}
                    max={100}
                    value={paintOptions.opacity}
                    onChange={(event) => onPaintOpacityChange?.(Number(event.target.value))}
                    className="w-16"
                />
                <span>{paintOptions.opacity}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">{t('panel.brushes.flow')}</span>
                <input
                    aria-label={t('paint.flowAria')}
                    type="range"
                    min={1}
                    max={100}
                    value={paintOptions.flow}
                    onChange={(event) => onPaintFlowChange?.(Number(event.target.value))}
                    className="w-16"
                />
                <span>{paintOptions.flow}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">{t('panel.brushes.smoothing')}</span>
                <input
                    aria-label={t('paint.smoothingAria')}
                    type="range"
                    min={0}
                    max={100}
                    value={paintOptions.smoothing}
                    onChange={(event) => onPaintSmoothingChange?.(Number(event.target.value))}
                    className="w-16"
                />
                <span>{paintOptions.smoothing}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">{t('layers.blend')}</span>
                <select
                    aria-label={t('paint.blendModeAria')}
                    value={paintOptions.blendMode}
                    onChange={(event) => onPaintBlendModeChange?.(event.target.value as 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten')}
                    className="bg-transparent outline-none"
                >
                    <option value="source-over">{t('blend.normal')}</option>
                    <option value="multiply">{t('blend.multiply')}</option>
                    <option value="screen">{t('blend.screen')}</option>
                    <option value="overlay">{t('blend.overlay')}</option>
                    <option value="darken">{t('blend.darken')}</option>
                    <option value="lighten">{t('blend.lighten')}</option>
                </select>
            </label>
        </>
    );
}
