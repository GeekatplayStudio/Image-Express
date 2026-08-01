import type { VaultAssetRecord } from '../contracts/assetRecord';
import type { Bookcase, BookcaseFilter } from '../contracts/bookcase';
import { buildMergeKey } from './inferAssetType';

export type VaultShelf = {
    id: string;
    label: string;
    assetIds: string[];
};

function assetDate(asset: VaultAssetRecord): string {
    return asset.capturedAt || asset.modifiedAt || asset.createdAt;
}

export function assetMonthKey(asset: VaultAssetRecord): string {
    const raw = assetDate(asset);
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) return 'unknown';
    const date = new Date(parsed);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

export function formatMonthShelfLabel(monthKey: string, locale = 'en-US'): string {
    if (monthKey === 'unknown') return 'unknown';
    const [year, month] = monthKey.split('-');
    const monthIndex = Number(month) - 1;
    if (!year || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return monthKey;
    return new Date(Date.UTC(Number(year), monthIndex, 1)).toLocaleString(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

/** Groups assets into month shelves (newest first) for timeline bookcases. */
export function groupAssetsByTimelineMonth(assets: VaultAssetRecord[]): VaultShelf[] {
    const buckets = new Map<string, string[]>();
    for (const asset of assets) {
        const key = assetMonthKey(asset);
        const list = buckets.get(key);
        if (list) list.push(asset.id);
        else buckets.set(key, [asset.id]);
    }
    return Array.from(buckets.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, assetIds]) => ({
            id: `shelf_${key}`,
            label: formatMonthShelfLabel(key),
            assetIds,
        }));
}

function matchesFilter(asset: VaultAssetRecord, filter: BookcaseFilter | undefined): boolean {
    if (!filter) return true;
    if (filter.type && asset.type !== filter.type) return false;
    if (filter.category && asset.category !== filter.category) return false;
    if (filter.connector && asset.origin.connector !== filter.connector) return false;
    if (filter.owner && (asset.owner || 'Guest').toLowerCase() !== filter.owner.toLowerCase()) return false;
    if (typeof filter.isPublic === 'boolean' && asset.isPublic !== filter.isPublic) return false;
    if (filter.dateFrom && assetDate(asset) < filter.dateFrom) return false;
    if (filter.dateTo && assetDate(asset) > filter.dateTo) return false;
    return true;
}

export function filterAssetsByBookcase(assets: VaultAssetRecord[], bookcase: Bookcase): VaultAssetRecord[] {
    if (
        (bookcase.kind === 'manual' || bookcase.kind === 'smart-cluster' || bookcase.kind === 'search-result')
        && bookcase.manualAssetIds?.length
    ) {
        const ids = new Set(bookcase.manualAssetIds);
        return assets.filter((asset) => ids.has(asset.id));
    }
    if (bookcase.kind === 'all' || bookcase.kind === 'timeline') {
        return bookcase.filter ? assets.filter((asset) => matchesFilter(asset, bookcase.filter)) : assets;
    }
    return assets.filter((asset) => matchesFilter(asset, bookcase.filter));
}

export function buildSearchHaystack(asset: VaultAssetRecord): string {
    return [
        asset.name,
        asset.owner || '',
        asset.description || '',
        asset.prompt || '',
        asset.origin.displayPath,
        ...(asset.tags || []),
    ].join(' ').toLowerCase();
}

export function scoreKeywordMatch(asset: VaultAssetRecord, query: string): number {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return 1;
    const terms = normalized.split(/\s+/).filter(Boolean);
    const haystack = buildSearchHaystack(asset);
    const nameLower = asset.name.toLowerCase();

    let score = 0;
    let matched = 0;
    for (const term of terms) {
        if (nameLower.includes(term)) {
            score += 3;
            matched += 1;
        } else if (haystack.includes(term)) {
            score += 1;
            matched += 1;
        }
    }
    // Require at least one term; reward denser matches (contextual multi-word queries).
    if (matched === 0) return 0;
    return (score / terms.length) * (matched / terms.length);
}

export function searchAssetsKeyword(
    assets: VaultAssetRecord[],
    query: string,
    filter?: BookcaseFilter,
    limit = 60,
): Array<{ asset: VaultAssetRecord; score: number; matchReasons: string[] }> {
    const filtered = filter
        ? assets.filter((asset) => matchesFilter(asset, filter))
        : assets;

    if (!query.trim()) {
        return filtered
            .slice(0, limit)
            .map((asset) => ({ asset, score: 1, matchReasons: ['browse'] }));
    }

    return filtered
        .map((asset) => {
            const score = scoreKeywordMatch(asset, query);
            if (score <= 0) return null;
            return {
                asset,
                score,
                matchReasons: [`keyword: ${query.trim()}`],
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => b.score - a.score || Date.parse(b.asset.modifiedAt) - Date.parse(a.asset.modifiedAt))
        .slice(0, limit);
}

const CONNECTOR_PRIORITY: Record<string, number> = {
    'indexeddb-legacy': 0,
    local: 0,
    'google-drive': 1,
    server: 2,
    network: 3,
};

export function dedupeVaultAssets(assets: VaultAssetRecord[]): VaultAssetRecord[] {
    const byKey = new Map<string, VaultAssetRecord>();
    for (const asset of assets) {
        const key = asset.contentHash
            || buildMergeKey(asset)
            || `${asset.origin.connector}:${asset.origin.uri}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, asset);
            continue;
        }
        const existingPriority = CONNECTOR_PRIORITY[existing.origin.connector] ?? 99;
        const nextPriority = CONNECTOR_PRIORITY[asset.origin.connector] ?? 99;
        const preferNext = nextPriority < existingPriority;
        const primary = preferNext ? asset : existing;
        const secondary = preferNext ? existing : asset;
        const merged: VaultAssetRecord = {
            ...primary,
            aliases: [
                ...(primary.aliases || []),
                secondary.origin,
                ...(secondary.aliases || []),
            ],
            description: primary.description || secondary.description,
            tags: [...new Set([...(primary.tags || []), ...(secondary.tags || [])])],
            prompt: primary.prompt || secondary.prompt,
            previewUrl: primary.previewUrl || secondary.previewUrl,
        };
        byKey.set(key, merged);
    }
    return Array.from(byKey.values()).sort(
        (a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt),
    );
}
