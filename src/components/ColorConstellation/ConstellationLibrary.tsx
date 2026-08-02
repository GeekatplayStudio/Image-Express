'use client';

import { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { SavedHarmonyPalette } from '@/features/color-constellation/contracts/types';
import { cn } from '@/lib/utils';

type ConstellationLibraryProps = {
    showSets: boolean;
    onToggleSets: () => void;
    savedHarmonies: SavedHarmonyPalette[];
    swatches: string[];
    statusMessage: string | null;
    onLoadHarmony: (palette: SavedHarmonyPalette) => void;
    onDeleteHarmony: (id: string) => void;
    onUseSwatch: (hex: string) => void;
    onRemoveSwatch: (hex: string) => void;
    onExport: () => void;
    onImportFile: (file: File) => void;
};

export default function ConstellationLibrary({
    showSets,
    onToggleSets,
    savedHarmonies,
    swatches,
    statusMessage,
    onLoadHarmony,
    onDeleteHarmony,
    onUseSwatch,
    onRemoveSwatch,
    onExport,
    onImportFile,
}: ConstellationLibraryProps) {
    const { t } = useI18n();
    const importRef = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-2 border-t border-border/60 pt-2">
            <div className="flex items-center gap-1 flex-wrap">
                <button
                    type="button"
                    onClick={onToggleSets}
                    className="h-7 px-2 rounded border border-border text-[10px] hover:bg-secondary"
                >
                    {showSets ? t('wheel.hideHarmonySets') : t('wheel.showHarmonySets')}
                </button>
                <button type="button" onClick={onExport} className="h-7 px-2 rounded border border-border text-[10px] hover:bg-secondary">
                    {t('wheel.exportPalettes')}
                </button>
                <button
                    type="button"
                    onClick={() => importRef.current?.click()}
                    className="h-7 px-2 rounded border border-border text-[10px] hover:bg-secondary"
                >
                    {t('wheel.importPalettes')}
                </button>
                <input
                    ref={importRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    aria-label={t('wheel.importJson')}
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onImportFile(file);
                        event.target.value = '';
                    }}
                />
            </div>

            {statusMessage && (
                <p className="text-[10px] text-muted-foreground">{statusMessage}</p>
            )}

            {showSets && (
                <ul className="max-h-28 overflow-y-auto space-y-1 scrollbar-thin">
                    {savedHarmonies.length === 0 ? (
                        <li className="text-[10px] text-muted-foreground px-1">{t('constellation.noHarmonySets')}</li>
                    ) : savedHarmonies.map((palette) => (
                        <li key={palette.id} className="flex items-center gap-1 rounded border border-border/50 px-1.5 py-1">
                            <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => onLoadHarmony(palette)}
                            >
                                <p className="text-[11px] font-medium truncate">{palette.name}</p>
                                <div className="flex gap-0.5 mt-0.5">
                                    {palette.colors.slice(0, 8).map((color) => (
                                        <span
                                            key={`${palette.id}-${color}`}
                                            className="h-4 w-4 rounded-full border border-white/25 shadow-sm"
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => onDeleteHarmony(palette.id)}
                                className="h-6 w-6 rounded border border-border text-destructive hover:bg-destructive/10 inline-flex items-center justify-center"
                                aria-label={t('wheel.deleteHarmonyPalette', { name: palette.name })}
                            >
                                <Trash2 size={11} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div>
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">{t('wheel.swatches')}</p>
                <div className="flex flex-wrap gap-1">
                    {swatches.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">{t('constellation.noSwatches')}</span>
                    ) : swatches.map((color) => (
                        <div key={color} className="relative group">
                            <button
                                type="button"
                                onClick={() => onUseSwatch(color)}
                                className={cn(
                                    'h-8 w-8 rounded-full border-2 border-white/30 shadow-[0_0_10px_color-mix(in_srgb,var(--swatch)_55%,transparent)]',
                                )}
                                style={{ backgroundColor: color, ['--swatch' as string]: color }}
                                title={t('wheel.useSavedSwatch', { color })}
                                aria-label={t('wheel.useSavedSwatch', { color })}
                            />
                            <button
                                type="button"
                                onClick={() => onRemoveSwatch(color)}
                                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] opacity-0 group-hover:opacity-100"
                                aria-label={t('constellation.removeSwatch', { color })}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
