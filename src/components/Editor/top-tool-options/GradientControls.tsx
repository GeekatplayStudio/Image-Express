'use client';

import { useI18n } from '@/providers/I18nProvider';

interface GradientControlsProps {
    gradientOptions: {
        type: 'linear' | 'radial' | 'angle';
        blendMode: 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
        opacity: number;
        reverse: boolean;
        dither: boolean;
    };
    onGradientTypeChange?: (type: 'linear' | 'radial' | 'angle') => void;
    onGradientBlendModeChange?: (mode: 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten') => void;
    onGradientOpacityChange?: (opacity: number) => void;
    onGradientReverseChange?: (enabled: boolean) => void;
    onGradientDitherChange?: (enabled: boolean) => void;
}

export default function GradientControls({
    gradientOptions,
    onGradientTypeChange,
    onGradientBlendModeChange,
    onGradientOpacityChange,
    onGradientReverseChange,
    onGradientDitherChange,
}: GradientControlsProps) {
    const { t } = useI18n();
    return (
        <>
            <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                <button
                    onClick={() => onGradientTypeChange?.('linear')}
                    className={`px-2 py-1 text-xs ${gradientOptions.type === 'linear' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                    aria-label={t('grad.typeLinearAria')}
                >
                    {t('panel.linear')}
                </button>
                <button
                    onClick={() => onGradientTypeChange?.('radial')}
                    className={`px-2 py-1 text-xs border-l border-border/50 ${gradientOptions.type === 'radial' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                    aria-label={t('grad.typeRadialAria')}
                >
                    {t('panel.radial')}
                </button>
                <button
                    onClick={() => onGradientTypeChange?.('angle')}
                    className={`px-2 py-1 text-xs border-l border-border/50 ${gradientOptions.type === 'angle' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                    aria-label={t('grad.typeAngleAria')}
                >
                    {t('panel.angle')}
                </button>
            </div>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">{t('layers.blend')}</span>
                <select
                    aria-label={t('grad.blendModeAria')}
                    value={gradientOptions.blendMode}
                    onChange={(event) => onGradientBlendModeChange?.(event.target.value as 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten')}
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

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">{t('ctrl.opacity')}</span>
                <input
                    aria-label={t('grad.opacityAria')}
                    type="range"
                    min={1}
                    max={100}
                    value={gradientOptions.opacity}
                    onChange={(event) => onGradientOpacityChange?.(Number(event.target.value))}
                    className="w-16"
                />
                <span>{gradientOptions.opacity}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <input
                    type="checkbox"
                    checked={gradientOptions.reverse}
                    onChange={(event) => onGradientReverseChange?.(event.target.checked)}
                    aria-label={t('grad.reverseAria')}
                />
                <span>{t('grad.reverse')}</span>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <input
                    type="checkbox"
                    checked={gradientOptions.dither}
                    onChange={(event) => onGradientDitherChange?.(event.target.checked)}
                    aria-label={t('grad.ditherAria')}
                />
                <span>{t('grad.dither')}</span>
            </label>
        </>
    );
}
