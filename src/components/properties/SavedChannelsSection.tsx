'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type * as fabric from 'fabric';
import { ArrowDown, ArrowUp, Minus, Plus, SquareDashed, Trash2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { useToast } from '@/providers/ToastProvider';
import {
    addSavedChannel,
    channelCoveragePercent,
    channelFromPixels,
    deleteSavedChannel,
    getSavedChannels,
    loadChannelAsSelection,
    moveSavedChannel,
    renameSavedChannel,
    saveSelectionAsChannel,
    subscribeSavedChannels,
    type ChannelLoadMode,
    type SavedChannel,
} from '@/lib/selection/savedChannels';
import { hasDocumentSelection, subscribeDocumentSelection } from '@/lib/selection/documentSelectionStore';
import {
    captureLayerPixelsInArtboard,
    getArtboardSelectionBounds,
    isContentSelectableLayer,
} from '@/lib/selection/selectionLayerCapture';

interface SavedChannelsSectionProps {
    canvas: fabric.Canvas | null | undefined;
}

const NO_CHANNELS: readonly SavedChannel[] = [];

/** Save the selection (or a layer's alpha or brightness) under a name, and load it back. */
export function SavedChannelsSection({ canvas }: SavedChannelsSectionProps) {
    // Channels belong to a page: without one there is nothing to show.
    return canvas ? <SavedChannelsList canvas={canvas} /> : null;
}

function SavedChannelsList({ canvas }: { canvas: fabric.Canvas }) {
    const { t } = useI18n();
    const { toast } = useToast();

    const channels = useSyncExternalStore(
        useCallback((listener: () => void) => subscribeSavedChannels(canvas, listener), [canvas]),
        () => getSavedChannels(canvas),
        () => NO_CHANNELS,
    );
    const hasSelection = useSyncExternalStore(
        useCallback((listener: () => void) => subscribeDocumentSelection(canvas, listener), [canvas]),
        () => hasDocumentSelection(canvas),
        () => false,
    );

    const saveFromLayer = (kind: 'alpha' | 'luma') => {
        const layer = canvas.getActiveObject();
        if (!layer || layer.type === 'activeSelection' || !isContentSelectableLayer(layer)) {
            toast({ title: t('channels.saved.needLayer'), variant: 'warning' });
            return;
        }
        const bounds = getArtboardSelectionBounds(canvas);
        const pixels = captureLayerPixelsInArtboard(canvas, layer, bounds);
        if (!pixels) {
            toast({ title: t('channels.saved.captureFailed'), variant: 'destructive' });
            return;
        }
        const label = t(kind === 'alpha' ? 'channels.alpha' : 'channels.saved.luma');
        addSavedChannel(canvas, channelFromPixels(pixels, bounds, kind, label));
    };

    const load = (channel: SavedChannel, mode: ChannelLoadMode) => {
        loadChannelAsSelection(canvas, channel.id, mode);
    };

    const smallButton = 'rounded border border-border/60 p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

    return (
        <section className="border-t border-border/50 p-4 space-y-3" data-testid="saved-channels">
            <h3 className="text-xs font-semibold uppercase tracking-tight text-foreground/90">{t('channels.saved.title')}</h3>
            <div className="grid grid-cols-3 gap-1.5">
                <button
                    type="button"
                    disabled={!hasSelection}
                    onClick={() => { saveSelectionAsChannel(canvas, t('channels.saved.selectionName')); }}
                    className="h-8 rounded-md border border-border/60 bg-background text-[11px] hover:bg-secondary/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {t('channels.saved.saveSelection')}
                </button>
                <button type="button" onClick={() => saveFromLayer('alpha')} className="h-8 rounded-md border border-border/60 bg-background text-[11px] hover:bg-secondary/40 transition-colors">
                    {t('channels.saved.saveAlpha')}
                </button>
                <button type="button" onClick={() => saveFromLayer('luma')} className="h-8 rounded-md border border-border/60 bg-background text-[11px] hover:bg-secondary/40 transition-colors">
                    {t('channels.saved.saveLuma')}
                </button>
            </div>

            {channels.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">{t('channels.saved.empty')}</p>
            ) : (
                <ul className="space-y-1.5">
                    {channels.map((channel, index) => (
                        <li key={channel.id} className="rounded-md border border-border/50 bg-background/70 px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                                <input
                                    defaultValue={channel.name}
                                    key={channel.name}
                                    aria-label={t('channels.saved.rename')}
                                    onBlur={(event) => renameSavedChannel(canvas, channel.id, event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                    className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none focus:underline"
                                />
                                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{channelCoveragePercent(channel)}%</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1">
                                <button type="button" onClick={() => load(channel, 'replace')} className="h-6 flex-1 rounded border border-border/60 text-[10px] font-semibold hover:bg-secondary transition-colors">
                                    {t('channels.saved.load')}
                                </button>
                                <button type="button" title={t('channels.saved.add')} aria-label={t('channels.saved.add')} onClick={() => load(channel, 'add')} className={smallButton}><Plus size={11} /></button>
                                <button type="button" title={t('channels.saved.subtract')} aria-label={t('channels.saved.subtract')} onClick={() => load(channel, 'subtract')} className={smallButton}><Minus size={11} /></button>
                                <button type="button" title={t('channels.saved.intersect')} aria-label={t('channels.saved.intersect')} onClick={() => load(channel, 'intersect')} className={smallButton}><SquareDashed size={11} /></button>
                                <button type="button" title={t('channels.saved.moveUp')} aria-label={t('channels.saved.moveUp')} disabled={index === 0} onClick={() => moveSavedChannel(canvas, channel.id, -1)} className={smallButton}><ArrowUp size={11} /></button>
                                <button type="button" title={t('channels.saved.moveDown')} aria-label={t('channels.saved.moveDown')} disabled={index === channels.length - 1} onClick={() => moveSavedChannel(canvas, channel.id, 1)} className={smallButton}><ArrowDown size={11} /></button>
                                <button type="button" title={t('channels.saved.delete')} aria-label={t('channels.saved.delete')} onClick={() => deleteSavedChannel(canvas, channel.id)} className={smallButton}><Trash2 size={11} /></button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
