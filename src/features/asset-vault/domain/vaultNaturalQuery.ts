import type { VaultAssetRecord } from '../contracts/assetRecord';
import type { VaultOrganizeLens } from './vaultAlbumTree';

export type VaultSortMode =
    | 'relevance'
    | 'name-asc'
    | 'name-desc'
    | 'newest'
    | 'oldest'
    | 'largest'
    | 'smallest'
    | 'type';

export type VaultNaturalQuery = {
    /** Remaining free-text search after intent tokens are stripped. */
    text: string;
    sort: VaultSortMode;
    /** Optional type narrowing from phrases like "photos" / "videos". */
    typeFilter?: VaultAssetRecord['type'];
    /** Optional organize-lens hint from phrases like "by date" / "by location". */
    lensHint?: VaultOrganizeLens;
};

const TYPE_PHRASES: Array<{ pattern: RegExp; type: VaultAssetRecord['type'] }> = [
    { pattern: /\b(photos?|images?|pictures?|pics?)\b/i, type: 'images' },
    { pattern: /\b(videos?|clips?|movies?|films?)\b/i, type: 'videos' },
    { pattern: /\b(audio|music|sounds?|tracks?)\b/i, type: 'audio' },
    { pattern: /\b(models?|3d|glb|gltf)\b/i, type: 'models' },
];

const LENS_PHRASES: Array<{ pattern: RegExp; lens: VaultOrganizeLens }> = [
    { pattern: /\b(by\s+date|timeline|chronolog)/i, lens: 'date' },
    { pattern: /\b(by\s+type|types?)\b/i, lens: 'type' },
    { pattern: /\b(by\s+location|locations?|drives?|sources?)\b/i, lens: 'location' },
    { pattern: /\b(by\s+subject|subjects?|tags?|topics?)\b/i, lens: 'subject' },
];

const SORT_PHRASES: Array<{ pattern: RegExp; sort: VaultSortMode }> = [
    { pattern: /\b(newest|latest|recent|recently)\b/i, sort: 'newest' },
    { pattern: /\b(oldest|earliest)\b/i, sort: 'oldest' },
    { pattern: /\b(sort\s+by\s+name|name\s+a\s*[-–]?\s*z|alphabetical|alpha)\b/i, sort: 'name-asc' },
    { pattern: /\b(name\s+z\s*[-–]?\s*a|reverse\s+name)\b/i, sort: 'name-desc' },
    { pattern: /\b(largest|biggest|huge)\b/i, sort: 'largest' },
    { pattern: /\b(smallest|tiniest)\b/i, sort: 'smallest' },
    { pattern: /\b(by\s+type|type\s+order)\b/i, sort: 'type' },
];

function stripPattern(text: string, pattern: RegExp): string {
    return text.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse natural-language vault search into sort / filter intents.
 * Keeps leftover words as the keyword search text.
 */
export function parseVaultNaturalQuery(raw: string): VaultNaturalQuery {
    let text = raw.trim();
    let sort: VaultSortMode = 'relevance';
    let typeFilter: VaultAssetRecord['type'] | undefined;
    let lensHint: VaultOrganizeLens | undefined;

    for (const entry of SORT_PHRASES) {
        if (entry.pattern.test(text)) {
            sort = entry.sort;
            text = stripPattern(text, entry.pattern);
            break;
        }
    }
    for (const entry of TYPE_PHRASES) {
        if (entry.pattern.test(text)) {
            typeFilter = entry.type;
            // Keep type words in text so keyword search still matches names containing them,
            // but prefer structured filter — strip common filler only when used as filter intent.
            text = stripPattern(text, entry.pattern);
            break;
        }
    }
    for (const entry of LENS_PHRASES) {
        if (entry.pattern.test(text)) {
            lensHint = entry.lens;
            text = stripPattern(text, entry.pattern);
            break;
        }
    }

    // Phrases like "sort by …" leftovers
    text = stripPattern(text, /\b(sort|order|show|find|only)\b/gi);

    return {
        text,
        sort: text && sort === 'relevance' ? 'relevance' : sort,
        typeFilter,
        lensHint,
    };
}

export function sortVaultAssets(
    assets: VaultAssetRecord[],
    sort: VaultSortMode,
    locale = 'en',
): VaultAssetRecord[] {
    const list = [...assets];
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    switch (sort) {
        case 'name-asc':
            return list.sort((a, b) => collator.compare(a.name, b.name));
        case 'name-desc':
            return list.sort((a, b) => collator.compare(b.name, a.name));
        case 'newest':
            return list.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
        case 'oldest':
            return list.sort((a, b) => Date.parse(a.modifiedAt) - Date.parse(b.modifiedAt));
        case 'largest':
            return list.sort((a, b) => b.sizeBytes - a.sizeBytes);
        case 'smallest':
            return list.sort((a, b) => a.sizeBytes - b.sizeBytes);
        case 'type':
            return list.sort((a, b) => collator.compare(a.type, b.type) || collator.compare(a.name, b.name));
        case 'relevance':
        default:
            return list;
    }
}

export function sortVaultAlbums<T extends { label: string; assetCount: number; id: string }>(
    albums: T[],
    sort: VaultSortMode,
    resolveLabel: (album: T) => string,
    locale = 'en',
): T[] {
    const list = [...albums];
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    switch (sort) {
        case 'name-asc':
            return list.sort((a, b) => collator.compare(resolveLabel(a), resolveLabel(b)));
        case 'name-desc':
            return list.sort((a, b) => collator.compare(resolveLabel(b), resolveLabel(a)));
        case 'largest':
            return list.sort((a, b) => b.assetCount - a.assetCount);
        case 'smallest':
            return list.sort((a, b) => a.assetCount - b.assetCount);
        case 'newest':
        case 'oldest':
        case 'type':
        case 'relevance':
        default:
            return list;
    }
}
