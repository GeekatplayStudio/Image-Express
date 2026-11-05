'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { AssetLoadStats } from './useAssetLibraryQuery';

type AssetLibraryStatusBarProps = {
    /** Assets on screen after group filtering. */
    count: number;
    /** Sum of known file sizes on screen, or null when none is known. */
    sizeBytes: number | null;
    stats: AssetLoadStats | null;
    isRefreshing: boolean;
};

export function formatAssetSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * One line under the grid: what is shown, where it came from, how long it
 * took, and which source did not answer. Shown even when the list is empty,
 * so "no assets" and "the server did not answer" look different.
 */
export default function AssetLibraryStatusBar({ count, sizeBytes, stats, isRefreshing }: AssetLibraryStatusBarProps) {
    const { t } = useI18n();
    if (!stats) return null;
    const sources = [
        stats.counts.local > 0 ? t('assets.status.local', { count: stats.counts.local }) : null,
        stats.counts.cloud > 0 ? t('assets.status.cloud', { count: stats.counts.cloud }) : null,
        stats.counts.server > 0 ? t('assets.status.server', { count: stats.counts.server }) : null,
    ].filter(Boolean);

    return (
        <div
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1 border-t border-border bg-secondary/10 text-[10px] text-muted-foreground"
            role="status"
            aria-live="polite"
        >
            <span className="font-medium text-foreground/80">{t('assets.status.count', { count })}</span>
            {sizeBytes !== null && sizeBytes > 0 && <span>· {formatAssetSize(sizeBytes)}</span>}
            {sources.length > 0 && <span className="truncate">· {sources.join(', ')}</span>}
            <span className="ml-auto inline-flex items-center gap-1.5">
                {stats.failed.map((source) => (
                    <span key={source} className="inline-flex items-center gap-1 text-amber-500" title={t('assets.status.sourceFailedHint')}>
                        <AlertTriangle size={10} />
                        {t('assets.status.sourceFailed', { source: t(`assets.status.source.${source}`) })}
                    </span>
                ))}
                {isRefreshing ? (
                    <span className="inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" />{t('assets.status.refreshing')}</span>
                ) : (
                    <span>{t('assets.status.loadedIn', { ms: stats.durationMs })}</span>
                )}
            </span>
        </div>
    );
}
