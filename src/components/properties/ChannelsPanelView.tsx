import React, { useMemo, useState } from 'react';
import { Eye, Layers2, RefreshCcw, SlidersHorizontal } from 'lucide-react';
import {
    type ChannelControlState,
    type ChannelFilterState,
    type ChannelMode,
    type ChannelPreviewSource,
    type ChannelTarget,
    type EditableChannelTarget,
    buildChannelPreviewDataUrl,
    getChannelValue,
    isDefaultChannelFilterState,
} from './channelEditing';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';

type SupportedChannelsTarget = 'none' | 'color' | 'image';

interface ChannelsPanelViewProps {
    supportedTarget: SupportedChannelsTarget;
    selectionLabel?: string;
    previewSource?: ChannelPreviewSource | null;
    currentColor?: string;
    currentOpacity?: number;
    appliedState?: ChannelFilterState;
    onApplyMode?: (target: EditableChannelTarget, mode: Exclude<ChannelMode, 'composite'>, controls: ChannelControlState) => void;
    onResetComposite?: () => void;
    onSetChannelValue?: (target: Exclude<EditableChannelTarget, 'lum'>, value: number, controls: ChannelControlState) => void;
    onChangeControls?: (controls: ChannelControlState) => void;
}

const CHANNEL_ROWS: Array<{ target: ChannelTarget; labelKey: string; accent: string }> = [
    { target: 'composite', labelKey: 'channels.composite', accent: 'bg-slate-500' },
    { target: 'r', labelKey: 'ctrl.channel.red', accent: 'bg-rose-500' },
    { target: 'g', labelKey: 'ctrl.channel.green', accent: 'bg-emerald-500' },
    { target: 'b', labelKey: 'ctrl.channel.blue', accent: 'bg-sky-500' },
    { target: 'a', labelKey: 'channels.alpha', accent: 'bg-zinc-500' },
    { target: 'lum', labelKey: 'ctrl.channel.luminosity', accent: 'bg-amber-400' },
];

export function ChannelsPanelView({
    supportedTarget,
    selectionLabel,
    previewSource,
    currentColor = '#000000',
    currentOpacity = 1,
    appliedState,
    onApplyMode,
    onResetComposite,
    onSetChannelValue,
    onChangeControls,
}: ChannelsPanelViewProps) {
    const { t } = useI18n();
    const currentState = appliedState ?? {
        mode: 'composite' as const,
        target: 'composite' as const,
        opacities: { r: 1, g: 1, b: 1, a: 1, lum: 0 },
        masks: { r: false, g: false, b: false, a: false, lum: false },
    };
    const [selectedChannel, setSelectedChannel] = useState<ChannelTarget>(currentState.target);

    const previewMap = useMemo(() => {
        if (!previewSource) return {} as Partial<Record<ChannelTarget, string | null>>;

        const nextPreviewMap: Partial<Record<ChannelTarget, string | null>> = {};
        CHANNEL_ROWS.forEach(({ target }) => {
            nextPreviewMap[target] = buildChannelPreviewDataUrl(previewSource, target);
        });
        return nextPreviewMap;
    }, [previewSource]);

    const channelValue = selectedChannel !== 'composite' && selectedChannel !== 'lum' && supportedTarget === 'color'
        ? getChannelValue(currentColor, currentOpacity, selectedChannel)
        : null;

    const sliderMax = selectedChannel === 'a' ? 100 : 255;
    const sliderValue = selectedChannel === 'a' && channelValue !== null
        ? Math.round((channelValue / 255) * 100)
        : channelValue;
    const selectedChannelOpacity = selectedChannel !== 'composite'
        ? Math.round(currentState.opacities[selectedChannel] * 100)
        : null;
    const selectedChannelMasked = selectedChannel !== 'composite'
        ? currentState.masks[selectedChannel]
        : false;

    const handleControlUpdate = (nextControls: ChannelControlState) => {
        onChangeControls?.(nextControls);
    };

    const updateSelectedOpacity = (nextOpacity: number) => {
        if (selectedChannel === 'composite') return;
        handleControlUpdate({
            opacities: {
                ...currentState.opacities,
                [selectedChannel]: nextOpacity / 100,
            },
            masks: currentState.masks,
        });
    };

    const toggleSelectedMask = () => {
        if (selectedChannel === 'composite') return;
        handleControlUpdate({
            opacities: currentState.opacities,
            masks: {
                ...currentState.masks,
                [selectedChannel]: !currentState.masks[selectedChannel],
            },
        });
    };

    if (supportedTarget === 'none') {
        return (
            <div className="h-full bg-card overflow-y-auto overflow-x-hidden pr-12">
                <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                    <Layers2 size={14} />
                    <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">{t('channels.title')}</h2>
                </div>
                <div className="p-4 space-y-3 text-sm text-muted-foreground">
                    <p>{t('channels.emptyHint')}</p>
                    <p className="text-xs">{t('channels.capabilities')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-card overflow-y-auto overflow-x-hidden pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                <Layers2 size={14} />
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">{t('channels.title')}</h2>
            </div>

            <div className="p-4 space-y-4">
                <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('channels.currentTarget')}</div>
                    <div className="text-sm font-medium text-foreground">{selectionLabel ?? (supportedTarget === 'image' ? t('channels.selectedImage') : t('channels.selectedFill'))}</div>
                    <div className="text-xs text-muted-foreground">
                        {supportedTarget === 'image'
                            ? t('channels.imageHint')
                            : t('channels.fillHint')}
                    </div>
                </div>

                <div className="space-y-2" data-testid="channels-list">
                    {CHANNEL_ROWS.map((row) => {
                        const isSelected = selectedChannel === row.target;
                        const isApplied = row.target === currentState.target && currentState.mode !== 'composite';
                        const preview = previewMap[row.target];
                        const channelOpacity = row.target !== 'composite' ? Math.round(currentState.opacities[row.target] * 100) : null;
                        const channelMasked = row.target !== 'composite' ? currentState.masks[row.target] : false;
                        return (
                            <button
                                key={row.target}
                                type="button"
                                onClick={() => setSelectedChannel(row.target)}
                                className={cn(
                                    'w-full rounded-md border px-3 py-2 flex items-center gap-3 text-left transition-colors',
                                    isSelected ? 'border-tool-accent bg-tool-accent/10' : 'border-border/60 bg-background hover:bg-secondary/40',
                                )}
                                aria-pressed={isSelected}
                            >
                                <span className={cn('h-2 w-2 rounded-full shrink-0', row.accent)} />
                                {preview ? (
                                    <span
                                        className="h-9 w-9 rounded border border-border/50 bg-center bg-cover"
                                        style={{ backgroundImage: `url(${preview})` }}
                                        aria-label={t('channels.channelPreview', { channel: t(row.labelKey) })}
                                    />
                                ) : (
                                    <span className="h-9 w-9 rounded border border-border/50 bg-secondary/50" aria-hidden="true" />
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-foreground">{t(row.labelKey)}</span>
                                    <span className="block text-[11px] text-muted-foreground">
                                        {supportedTarget === 'color' && row.target !== 'composite'
                                            ? `${row.target === 'a' ? Math.round((getChannelValue(currentColor, currentOpacity, row.target) / 255) * 100) : getChannelValue(currentColor, currentOpacity, row.target)}${row.target === 'a' ? '%' : ''} · opacity ${channelOpacity}%${channelMasked ? ' · masked' : ''}`
                                            : row.target === 'composite'
                                                ? 'Full-color view'
                                                : `Channel preview · opacity ${channelOpacity}%${channelMasked ? ' · masked' : ''}`}
                                    </span>
                                </span>
                                {isApplied && (
                                    <span className="rounded-full bg-tool-accent px-2 py-0.5 text-[10px] font-semibold uppercase text-tool-accent-foreground">
                                        {currentState.mode}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {selectedChannel !== 'composite' && selectedChannelOpacity !== null && (
                    <div className="rounded-md border border-border/60 bg-background p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-foreground">{t('channels.channelOpacity', { channel: t(CHANNEL_ROWS.find((row) => row.target === selectedChannel)?.labelKey ?? '') })}</span>
                            <span className="text-[11px] text-muted-foreground">{selectedChannelOpacity}%</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={selectedChannelOpacity}
                            onChange={(event) => updateSelectedOpacity(Number(event.target.value))}
                            className="w-full"
                            aria-label={`Adjust ${selectedChannel} opacity`}
                        />
                        <label className="flex items-center justify-between gap-3 text-xs text-foreground">
                            <span>{t('channels.maskHint')}</span>
                            <input
                                type="checkbox"
                                checked={selectedChannelMasked}
                                onChange={toggleSelectedMask}
                                aria-label={`Mask ${selectedChannel} channel`}
                            />
                        </label>
                    </div>
                )}

                {supportedTarget === 'color' && selectedChannel !== 'composite' && selectedChannel !== 'lum' && onSetChannelValue && sliderValue !== null && (
                    <div className="rounded-md border border-border/60 bg-background p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-foreground">{t('channels.adjustChannel', { channel: selectedChannel === 'a' ? t('channels.alpha') : t(CHANNEL_ROWS.find((row) => row.target === selectedChannel)?.labelKey ?? '') })}</span>
                            <span className="text-[11px] text-muted-foreground">{sliderValue}{selectedChannel === 'a' ? '%' : ''}</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={sliderMax}
                            value={sliderValue}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                onSetChannelValue(
                                    selectedChannel,
                                    selectedChannel === 'a' ? Math.round((nextValue / 100) * 255) : nextValue,
                                    { opacities: currentState.opacities, masks: currentState.masks },
                                );
                            }}
                            className="w-full"
                            aria-label={`Adjust ${selectedChannel} channel`}
                        />
                    </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        onClick={() => selectedChannel !== 'composite' && onApplyMode?.(selectedChannel, 'isolate', { opacities: currentState.opacities, masks: currentState.masks })}
                        disabled={selectedChannel === 'composite' || !onApplyMode}
                        className="h-9 rounded-md border border-border/60 bg-background text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/40 transition-colors flex items-center justify-center gap-2"
                    >
                        <Eye size={13} />
                        {t('channels.isolate')}
                    </button>
                    <button
                        type="button"
                        onClick={() => selectedChannel !== 'composite' && onApplyMode?.(selectedChannel, 'invert', { opacities: currentState.opacities, masks: currentState.masks })}
                        disabled={selectedChannel === 'composite' || !onApplyMode}
                        className="h-9 rounded-md border border-border/60 bg-background text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/40 transition-colors flex items-center justify-center gap-2"
                    >
                        <SlidersHorizontal size={13} />
                        {t('channels.invert')}
                    </button>
                    <button
                        type="button"
                        onClick={() => selectedChannel !== 'composite' && onApplyMode?.(selectedChannel, 'mask', { opacities: currentState.opacities, masks: currentState.masks })}
                        disabled={selectedChannel === 'composite' || !onApplyMode}
                        className="h-9 rounded-md border border-border/60 bg-background text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/40 transition-colors flex items-center justify-center gap-2"
                    >
                        <Layers2 size={13} />
                        {t('channels.mask')}
                    </button>
                </div>

                {supportedTarget === 'image' && (
                    <button
                        type="button"
                        onClick={onResetComposite}
                        disabled={!onResetComposite || isDefaultChannelFilterState(currentState)}
                        className="w-full h-9 rounded-md border border-border/60 bg-background text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/40 transition-colors flex items-center justify-center gap-2"
                    >
                        <RefreshCcw size={13} />
                        {t('channels.resetToComposite')}
                    </button>
                )}

                <div className="text-[11px] text-muted-foreground">
                    {supportedTarget === 'image'
                        ? 'Masks zero channel contribution in the composite. Luminosity blends grayscale luma into the RGB preview and can also drive alpha through the Mask action.'
                        : 'Color-layer channels edit fill RGB values and object opacity directly. Use Undo if you want to step back through destructive changes.'}
                </div>
            </div>
        </div>
    );
}