'use client';

import { Info } from 'lucide-react';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type { VaultSearchMatch } from '@/components/AssetVault/vaultModalTypes';

type Props = {
    asset: VaultAssetRecord | null;
    match: VaultSearchMatch | null;
    thumbnailUrl?: string;
    onOpenPreview: (asset: VaultAssetRecord) => void;
    onAddToCanvas: (asset: VaultAssetRecord) => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
    language: string;
};

/** Bytes as the unit a person would say out loud. */
function formatBytes(bytes: number | undefined): string {
    if (!bytes || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    // One decimal below 10 (1.4 MB reads better than 1 MB), none above.
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function formatDate(value: string | undefined, language: string): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    try {
        return parsed.toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        // An unknown language tag must not blank the field.
        return parsed.toISOString().slice(0, 16).replace('T', ' ');
    }
}

/** The folder an asset lives in, without the scheme. */
function formatLocation(asset: VaultAssetRecord): string {
    const display = asset.origin?.displayPath?.trim();
    if (display) return display;
    const uri = asset.origin?.uri ?? '';
    return uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') || '—';
}

/**
 * Turn a raw match reason into something a person can act on.
 *
 * The engine emits terse tags — `keyword: cowboy`, `hybrid: keyword+vector`,
 * `vector-context`. Left as-is they look like debug output, and the vaguest of
 * them is the one users most need explained: a "contextual" hit is why a search
 * for "cowboy" can return a house.
 */
function describeReason(reason: string, t: Props['t']): string {
    if (reason.startsWith('keyword:')) {
        return t('vault.searchMatchKeyword', { term: reason.slice('keyword:'.length).trim() });
    }
    if (reason.includes('keyword+vector')) return t('vault.searchMatchHybrid');
    if (reason.includes('vector')) return t('vault.searchMatchContext');
    if (reason === 'browse') return t('vault.searchMatchBrowse');
    return reason;
}

export default function VaultAssetDetailsPanel({
    asset,
    match,
    thumbnailUrl,
    onOpenPreview,
    onAddToCanvas,
    t,
    language,
}: Props) {
    if (!asset) {
        return (
            <aside className="w-64 shrink-0 border-l border-border/60 p-3 hidden lg:flex flex-col gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('vault.details.title')}
                </h3>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                    {t('vault.details.empty')}
                </p>
            </aside>
        );
    }

    const rows: Array<{ label: string; value: string }> = [
        { label: t('vault.details.type'), value: asset.type },
        { label: t('vault.details.size'), value: formatBytes(asset.sizeBytes) },
        { label: t('vault.details.created'), value: formatDate(asset.createdAt, language) },
        { label: t('vault.details.modified'), value: formatDate(asset.modifiedAt, language) },
        { label: t('vault.details.owner'), value: asset.owner || '—' },
    ];

    return (
        <aside className="w-64 shrink-0 border-l border-border/60 overflow-y-auto hidden lg:block">
            <div className="p-3 flex flex-col gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('vault.details.title')}
                </h3>

                {thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={thumbnailUrl}
                        alt={asset.name}
                        className="w-full aspect-square object-contain rounded border border-border/60 bg-black/20"
                    />
                )}

                <p className="text-xs font-medium break-words leading-snug" title={asset.name}>
                    {asset.name}
                </p>

                <dl className="flex flex-col gap-1.5">
                    {rows.map((row) => (
                        <div key={row.label} className="flex items-baseline gap-2">
                            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground w-16 shrink-0">
                                {row.label}
                            </dt>
                            <dd className="text-[11px] break-words min-w-0">{row.value}</dd>
                        </div>
                    ))}
                </dl>

                <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        {t('vault.details.location')}
                    </div>
                    {/* The full path is long and users need to read it, so it
                        wraps rather than being clipped to an ellipsis. */}
                    <p className="text-[11px] break-all leading-snug text-muted-foreground">
                        {formatLocation(asset)}
                    </p>
                </div>

                {asset.description && (
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            {t('vault.details.description')}
                        </div>
                        <p className="text-[11px] leading-snug">{asset.description}</p>
                    </div>
                )}

                {asset.tags && asset.tags.length > 0 && (
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            {t('vault.details.tags')}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {asset.tags.slice(0, 24).map((tag) => (
                                <span
                                    key={tag}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/60 border border-border/60"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {match && (
                    <div className="rounded border border-border/60 bg-secondary/30 p-2">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Info size={11} className="text-muted-foreground shrink-0" />
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {t('vault.details.whyMatched')}
                            </span>
                        </div>
                        <ul className="flex flex-col gap-0.5 mb-1">
                            {(match.matchReasons.length > 0
                                ? match.matchReasons
                                : ['vector-context']
                            ).map((reason) => (
                                <li key={reason} className="text-[11px] leading-snug">
                                    {describeReason(reason, t)}
                                </li>
                            ))}
                        </ul>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                            {t('vault.details.matchScore')}: {match.score.toFixed(3)}
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-1.5">
                    <button
                        type="button"
                        onClick={() => onOpenPreview(asset)}
                        className="h-7 rounded border border-border text-[11px] hover:bg-secondary"
                    >
                        {t('vault.details.openPreview')}
                    </button>
                    {/* Double click on a card opens the preview, so adding to
                        the canvas needs its own affordance here. */}
                    <button
                        type="button"
                        onClick={() => onAddToCanvas(asset)}
                        className="h-7 rounded border border-primary/60 bg-primary/10 text-[11px] hover:bg-primary/20"
                    >
                        {t('assets.addToCanvas')}
                    </button>
                </div>
            </div>
        </aside>
    );
}
