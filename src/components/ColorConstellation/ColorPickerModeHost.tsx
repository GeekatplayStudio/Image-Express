'use client';

import { useState } from 'react';
import { ColorPalette } from '@/types';
import { useI18n } from '@/providers/I18nProvider';
import { cn } from '@/lib/utils';
import { ColorWheelTool } from '@/components/ColorWheelTool';
import ColorConstellationPicker from '@/components/ColorConstellation/ColorConstellationPicker';
import {
    loadConstellationUiPrefs,
    saveConstellationUiPrefs,
} from '@/features/color-constellation/application/constellationStore';

type ColorPickerModeHostProps = {
    onColorSelect: (color: string) => void;
    currentPalette: ColorPalette | null;
    onPaletteSelect: (palette: ColorPalette | null) => void;
    selectedColor?: string;
    variant?: 'floating' | 'panel';
};

type PickerMode = 'classic' | 'constellation';

/**
 * Hosts classic ColorWheelTool beside the new OKLCH Color Constellation picker.
 * Preference persists in localStorage; classic picker is never removed.
 */
export default function ColorPickerModeHost({
    onColorSelect,
    currentPalette,
    onPaletteSelect,
    selectedColor,
    variant = 'panel',
}: ColorPickerModeHostProps) {
    const { t } = useI18n();
    // Seeded lazily rather than in a mount effect: the effect version rendered
    // 'constellation' first and then corrected itself, which flashed the wrong
    // picker for a frame. `loadConstellationUiPrefs` returns defaults when
    // `window` is undefined, so this is safe during SSR.
    const [mode, setMode] = useState<PickerMode>(() => (
        loadConstellationUiPrefs().preferConstellation ? 'constellation' : 'classic'
    ));

    const selectMode = (next: PickerMode) => {
        setMode(next);
        saveConstellationUiPrefs({ preferConstellation: next === 'constellation' });
    };

    // The floating variant is portaled to <body>. Before, only the picker inside
    // was positioned (fixed, by the toolbar) while this wrapper and the
    // Classic / Constellation switch stayed in normal flow — appended after the
    // full-height workspace, i.e. below the bottom edge of the window, so the
    // switch could never be reached. The host is now the floating panel and
    // both pickers render in their in-panel form inside it.
    const floating = variant === 'floating';
    return (
        <div
            className={cn(
                'flex flex-col gap-2 min-h-0',
                floating && 'fixed left-[74px] top-16 z-[150] w-[430px] max-w-[calc(100vw-5.5rem)] max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-thin rounded-2xl border border-border/70 bg-card/95 p-3 shadow-2xl backdrop-blur-sm',
            )}
            data-testid="color-picker-mode-host"
        >
            <div
                className="inline-flex self-start rounded-md border border-border overflow-hidden"
                role="tablist"
                aria-label={t('constellation.modeAria')}
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'classic'}
                    onClick={() => selectMode('classic')}
                    className={cn(
                        'h-7 px-2.5 text-[10px] font-medium',
                        mode === 'classic' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary',
                    )}
                >
                    {t('constellation.modeClassic')}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'constellation'}
                    onClick={() => selectMode('constellation')}
                    className={cn(
                        'h-7 px-2.5 text-[10px] font-medium',
                        mode === 'constellation' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary',
                    )}
                >
                    {t('constellation.modeConstellation')}
                </button>
            </div>

            {mode === 'classic' ? (
                <ColorWheelTool
                    variant="panel"
                    selectedColor={selectedColor}
                    currentPalette={currentPalette}
                    onPaletteSelect={onPaletteSelect}
                    onColorSelect={onColorSelect}
                />
            ) : (
                <ColorConstellationPicker
                    variant="panel"
                    selectedColor={selectedColor}
                    currentPalette={currentPalette}
                    onPaletteSelect={onPaletteSelect}
                    onColorSelect={onColorSelect}
                />
            )}
        </div>
    );
}
