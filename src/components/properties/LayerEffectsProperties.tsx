import React from 'react';
import type { MaskGradientSettings, MaskGradientType } from './maskGradientUtils';
import { useI18n } from '@/providers/I18nProvider';

interface LayerEffectsPropertiesProps {
    opacity: number;
    blendMode: string;
    visible: boolean;
    onChange: (values: Partial<{ opacity: number; globalCompositeOperation: string; visible: boolean }>) => void;
    maskGradient?: MaskGradientSettings | null;
    onMaskGradientChange?: (values: Partial<MaskGradientSettings>) => void;
}

// Labels come from the shared `blend.*` keys; the values are canvas composite
// operations and are NOT interchangeable with the Fabric blend names used in
// ShadowStrokeProperties (note 'source-over' vs 'normal').
const BLEND_MODES = [
    { value: 'source-over', labelKey: 'blend.normal' },
    { value: 'multiply', labelKey: 'blend.multiply' },
    { value: 'screen', labelKey: 'blend.screen' },
    { value: 'overlay', labelKey: 'blend.overlay' },
    { value: 'darken', labelKey: 'blend.darken' },
    { value: 'lighten', labelKey: 'blend.lighten' },
    { value: 'color-dodge', labelKey: 'blend.colorDodge' },
    { value: 'color-burn', labelKey: 'blend.colorBurn' },
    { value: 'hard-light', labelKey: 'blend.hardLight' },
    { value: 'soft-light', labelKey: 'blend.softLight' },
    { value: 'difference', labelKey: 'blend.difference' },
    { value: 'exclusion', labelKey: 'blend.exclusion' },
    { value: 'hue', labelKey: 'blend.hue' },
    { value: 'saturation', labelKey: 'blend.saturation' },
    { value: 'color', labelKey: 'blend.color' },
    { value: 'luminosity', labelKey: 'blend.luminosity' },
];

export function LayerEffectsProperties({
    opacity,
    blendMode,
    visible,
    onChange,
    maskGradient,
    onMaskGradientChange,
}: LayerEffectsPropertiesProps) {
    const { t } = useI18n();
    return (
        <div className="p-4 space-y-4 border-b border-border/50">
            <h3 className="font-medium text-sm">{t('layerfx.appearance')}</h3>
            
            <div className="space-y-3">
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{t('ctrl.opacity')}</span>
                        <span>{Math.round(opacity * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={opacity}
                        onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">{t('ctrl.blendMode')}</label>
                    <select
                        value={blendMode}
                        onChange={(e) => onChange({ globalCompositeOperation: e.target.value })}
                        className="w-full text-xs bg-background text-foreground border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                    >
                        {BLEND_MODES.map((mode) => (
                            <option key={mode.value} value={mode.value}>
                                {t(mode.labelKey)}
                            </option>
                        ))}
                    </select>
                </div>
                
                <div className="flex items-center gap-2 pt-1">
                    <label className="text-xs flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={visible}
                            onChange={(e) => onChange({ visible: e.target.checked })}
                            className="rounded border-border"
                        />
                        <span>{t('layerfx.visible')}</span>
                    </label>
                </div>

                {maskGradient && onMaskGradientChange && (
                    <div className="space-y-3 rounded-md border border-border/60 bg-secondary/15 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-medium">{t('layerfx.maskFade')}</div>
                                <div className="text-[10px] text-muted-foreground">
                                    {t('layerfx.maskFadeHint')}
                                </div>
                            </div>
                            <label className="text-xs flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={maskGradient.enabled}
                                    onChange={(event) => onMaskGradientChange({ enabled: event.target.checked })}
                                    aria-label={t('layerfx.enableGradientMaskAria')}
                                    className="rounded border-border"
                                />
                                <span>{t('panel.gradient')}</span>
                            </label>
                        </div>

                        {maskGradient.enabled && (
                            <>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">{t('layerfx.fadeType')}</label>
                                    <select
                                        value={maskGradient.type}
                                        onChange={(event) => onMaskGradientChange({ type: event.target.value as MaskGradientType })}
                                        aria-label={t('layerfx.maskTypeAria')}
                                        className="w-full text-xs bg-background text-foreground border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="linear">{t('panel.linear')}</option>
                                        <option value="radial">{t('panel.radial')}</option>
                                    </select>
                                </div>

                                {maskGradient.type === 'linear' && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>{t('panel.angle')}</span>
                                            <span>{Math.round(maskGradient.angle)}°</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="360"
                                            value={maskGradient.angle}
                                            onChange={(event) => onMaskGradientChange({ angle: Number.parseInt(event.target.value, 10) })}
                                            aria-label={t('layerfx.maskAngleAria')}
                                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>{t('layerfx.startOpacity')}</span>
                                        <span>{Math.round(maskGradient.startOpacity * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={Math.round(maskGradient.startOpacity * 100)}
                                        onChange={(event) => onMaskGradientChange({ startOpacity: Number.parseInt(event.target.value, 10) / 100 })}
                                        aria-label={t('layerfx.maskStartOpacityAria')}
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>{t('layerfx.endOpacity')}</span>
                                        <span>{Math.round(maskGradient.endOpacity * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={Math.round(maskGradient.endOpacity * 100)}
                                        onChange={(event) => onMaskGradientChange({ endOpacity: Number.parseInt(event.target.value, 10) / 100 })}
                                        aria-label={t('layerfx.maskEndOpacityAria')}
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
