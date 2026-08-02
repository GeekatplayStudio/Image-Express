'use client';

import { ColorPalette } from '@/types';
import { useI18n } from '@/providers/I18nProvider';
import { cn } from '@/lib/utils';
import { useConstellationState } from '@/components/ColorConstellation/useConstellationState';
import ConstellationVolume3D from '@/components/ColorConstellation/ConstellationVolume3D';
import ConstellationSidebar from '@/components/ColorConstellation/ConstellationSidebar';
import ConstellationLibrary from '@/components/ColorConstellation/ConstellationLibrary';
import { normalizeHex } from '@/features/color-constellation/domain/oklch';

export type ColorConstellationPickerProps = {
    onColorSelect: (color: string) => void;
    currentPalette: ColorPalette | null;
    onPaletteSelect: (palette: ColorPalette | null) => void;
    selectedColor?: string;
    variant?: 'floating' | 'panel';
};

/**
 * 3D OKLCH Color Constellation picker (Volume-inspired).
 *
 * Interaction model (deliberate):
 * 1. Volume cloud = gamut context + optional seed pick (small beads).
 * 2. Harmony nodes / HTML chips = the actual palette (always pickable).
 * 3. Hex / swatches / save-load = same contract as classic ColorWheelTool.
 */
export default function ColorConstellationPicker({
    onColorSelect,
    currentPalette,
    onPaletteSelect,
    selectedColor,
    variant = 'panel',
}: ColorConstellationPickerProps) {
    const { t } = useI18n();
    const state = useConstellationState({
        selectedColor,
        onColorSelect,
        currentPalette,
        onPaletteSelect,
        t,
    });

    const seedFromHex = (hex: string) => {
        const safe = normalizeHex(hex);
        state.rebuildHarmony(state.harmonyKind, safe);
    };

    return (
        <div
            className={cn(
                'flex flex-col gap-2 min-h-0',
                variant === 'floating'
                    ? 'w-[min(480px,94vw)] max-h-[min(760px,88vh)] rounded-xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur overflow-y-auto'
                    : 'w-full',
            )}
            data-testid="color-constellation-picker"
        >
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold tracking-tight">{t('constellation.title')}</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{t('constellation.subtitle')}</p>
                </div>
            </div>

            <ConstellationVolume3D
                nodes={state.nodes}
                edges={state.edges}
                activeNodeId={state.activeNode?.id ?? null}
                onSelectNode={state.selectNode}
                onPickVolumeHex={seedFromHex}
                className={cn(
                    'w-full rounded-xl border border-white/10 overflow-hidden bg-[#05080f]',
                    variant === 'floating' ? 'h-[260px]' : 'h-[300px] xl:h-[360px]',
                )}
            />

            <div className="min-h-0">
                <ConstellationSidebar
                    activeHex={state.activeHex}
                    activeNode={state.activeNode}
                    nodes={state.nodes}
                    harmonyKind={state.harmonyKind}
                    harmonyName={state.harmonyName}
                    swatchFlash={state.swatchFlash}
                    onHarmonyNameChange={state.setHarmonyName}
                    onRebuildHarmony={state.rebuildHarmony}
                    onSelectNode={state.selectNode}
                    onOklchChange={state.setActiveOklch}
                    onApplyHex={seedFromHex}
                    onNudge={state.nudgePalette}
                    onSaveHarmony={state.saveHarmonySet}
                    onAddSwatch={state.addSwatch}
                />
            </div>

            <ConstellationLibrary
                showSets={state.showSets}
                onToggleSets={() => state.setShowSets((prev) => !prev)}
                savedHarmonies={state.savedHarmonies}
                swatches={state.swatches}
                statusMessage={state.statusMessage}
                onLoadHarmony={state.loadHarmony}
                onDeleteHarmony={state.deleteHarmony}
                onUseSwatch={seedFromHex}
                onRemoveSwatch={state.removeSwatch}
                onExport={state.exportHarmonies}
                onImportFile={(file) => void state.importHarmonies(file)}
            />
        </div>
    );
}
