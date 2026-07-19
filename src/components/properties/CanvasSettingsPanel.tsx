import React from 'react';
import { ColorPicker } from './ColorPicker';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/providers/I18nProvider';

interface CanvasSettingsPanelProps {
    width: number;
    height: number;
    backgroundColor: string;
    backgroundEnabled: boolean;
    onResize: (width: number, height: number) => void;
    onColorChange: (color: string) => void;
    onBackgroundToggle: (enabled: boolean) => void;
}

export function CanvasSettingsPanel({
    width,
    height,
    backgroundColor,
    backgroundEnabled,
    onResize,
    onColorChange,
    onBackgroundToggle
}: CanvasSettingsPanelProps) {
    const { t } = useI18n();
    return (
        <div className="p-4 space-y-6">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">{t('canvas.size')}</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase text-muted-foreground font-medium">{t('canvas.width')}</label>
                        <input
                            type="number"
                            value={width || ''}
                            onChange={(e) => onResize(parseInt(e.target.value) || 0, height)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase text-muted-foreground font-medium">{t('canvas.height')}</label>
                        <input
                            type="number"
                            value={height || ''}
                            onChange={(e) => onResize(width, parseInt(e.target.value) || 0)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {[
                        { w: 1080, h: 1080, labelKey: 'canvas.ratio.square' },
                        { w: 1920, h: 1080, labelKey: 'canvas.ratio.landscape' },
                        { w: 1080, h: 1920, labelKey: 'canvas.ratio.portrait' },
                        { w: 1200, h: 1800, labelKey: 'canvas.ratio.poster' },
                        { w: 1800, h: 1200, labelKey: 'canvas.ratio.photo' },
                        { w: 1440, h: 1080, labelKey: 'canvas.ratio.monitor' },
                        { w: 1080, h: 1440, labelKey: 'canvas.ratio.tablet' },
                    ].map((preset) => (
                        <button
                            key={preset.labelKey}
                            onClick={() => onResize(preset.w, preset.h)}
                            className="px-2 py-1 text-[10px] border border-border rounded-md hover:bg-secondary"
                        >
                            {t(preset.labelKey)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">{t('canvas.background')}</h3>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/20 px-3 py-2">
                        <div className="space-y-0.5">
                            <div className="text-xs font-medium">{t('canvas.backgroundLabel')}</div>
                            <div className="text-[10px] text-muted-foreground">{t('canvas.transparentHint')}</div>
                        </div>
                        <Switch
                            checked={backgroundEnabled}
                            onCheckedChange={onBackgroundToggle}
                            aria-label={t('canvas.backgroundLabel')}
                        />
                    </div>
                    <ColorPicker
                         color={backgroundColor.startsWith('#') ? backgroundColor : '#ffffff'}
                         onChange={onColorChange}
                         label={t('ctrl.color')}
                    />
                    <div className="flex gap-2 flex-wrap">
                        {['#ffffff', '#000000', '#f3f4f6', '#fee2e2', '#dbeafe', '#d1fae5'].map((c) => (
                            <button
                                key={c}
                                className="w-6 h-6 rounded-full border border-border shadow-sm"
                                style={{ backgroundColor: c }}
                                onClick={() => onColorChange(c)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
