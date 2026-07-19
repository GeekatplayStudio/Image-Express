import React from 'react';
import type { CropEdges } from '@/lib/imageCrop';
import { useI18n } from '@/providers/I18nProvider';

interface CropPropertiesProps {
    /** Current crop as edge fractions (0–1) read from the image. */
    edges: CropEdges;
    /** Called with the full next edge set whenever a slider moves. */
    onChange: (edges: CropEdges) => void;
    /** Reset all four edges to 0 (show the full image). */
    onReset: () => void;
    disabled?: boolean;
}

const SIDES: Array<{ key: keyof CropEdges; labelKey: string }> = [
    { key: 'top', labelKey: 'crop.top' },
    { key: 'bottom', labelKey: 'crop.bottom' },
    { key: 'left', labelKey: 'crop.left' },
    { key: 'right', labelKey: 'crop.right' },
];

/**
 * Four sliders — Top / Bottom / Left / Right — that trim the corresponding
 * edge of an image layer. Each value is a percentage of the full source, so
 * dragging back to 0 restores that side (non-destructive, reversible).
 */
export function CropProperties({ edges, onChange, onReset, disabled }: CropPropertiesProps) {
    const { t } = useI18n();
    const setSide = (key: keyof CropEdges, pct: number) => {
        onChange({ ...edges, [key]: Math.min(0.95, Math.max(0, pct / 100)) });
    };
    const cropped = edges.top > 0.001 || edges.bottom > 0.001 || edges.left > 0.001 || edges.right > 0.001;

    return (
        <div className="p-4 space-y-3 border-b border-border/50">
            {SIDES.map(({ key, labelKey }) => {
                const pct = Math.round((edges[key] || 0) * 100);
                return (
                    <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] text-muted-foreground">{t(labelKey)}</label>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min={0}
                                max={95}
                                value={pct}
                                aria-label={t('crop.edgeAria', { side: t(labelKey).toLowerCase() })}
                                onChange={(e) => setSide(key, parseFloat(e.target.value))}
                                disabled={disabled}
                                className="flex-1 h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                            <input
                                type="number"
                                min={0}
                                max={95}
                                value={pct}
                                onChange={(e) => setSide(key, parseFloat(e.target.value))}
                                disabled={disabled}
                                className="w-12 text-xs bg-transparent border border-border rounded px-2 py-1 text-right"
                            />
                        </div>
                    </div>
                );
            })}
            <button
                type="button"
                onClick={onReset}
                disabled={disabled || !cropped}
                className="w-full rounded-md border border-border/50 bg-secondary/20 px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {t('crop.reset')}
            </button>
        </div>
    );
}
