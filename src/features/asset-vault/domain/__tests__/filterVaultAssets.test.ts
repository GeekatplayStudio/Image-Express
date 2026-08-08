/**
 * @jest-environment node
 */

import { countVaultAssetSources, filterVaultAssets } from '@/features/asset-vault/domain/filterVaultAssets';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

const asset = (id: string, over: Partial<VaultAssetRecord> = {}): VaultAssetRecord => ({
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    type: 'images',
    category: 'uploads',
    sizeBytes: 1,
    origin: { connector: 'local', uri: `file://d:/a/${id}.png`, displayPath: `d:/a/${id}.png` },
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    ...over,
} as VaultAssetRecord);

const ids = (list: VaultAssetRecord[]) => list.map((entry) => entry.id);

describe('filterVaultAssets', () => {
    const library = [
        asset('cowboy'),
        asset('barn', { description: 'a cowboy stands outside' } as Partial<VaultAssetRecord>),
        asset('sunset', { tags: ['cowboy', 'dusk'] } as Partial<VaultAssetRecord>),
        asset('clip', { type: 'videos' }),
        asset('unrelated'),
    ];

    it('returns everything when nothing is asked for', () => {
        expect(filterVaultAssets(library, {})).toHaveLength(5);
    });

    it('matches on name, description and tags, not just the filename', () => {
        expect(ids(filterVaultAssets(library, { text: 'cowboy' })).sort())
            .toEqual(['barn', 'cowboy', 'sunset']);
    });

    it('matches on the path, so a folder name finds its contents', () => {
        const nested = [asset('a', {
            origin: { connector: 'local', uri: 'file://d:/weddings/a.png', displayPath: 'd:/weddings/a.png' },
        } as Partial<VaultAssetRecord>)];
        expect(filterVaultAssets(nested, { text: 'weddings' })).toHaveLength(1);
    });

    it('ignores case and surrounding whitespace', () => {
        expect(filterVaultAssets(library, { text: '  COWBOY ' })).toHaveLength(3);
    });

    it('restricts by type', () => {
        expect(ids(filterVaultAssets(library, { typeFilter: 'videos' }))).toEqual(['clip']);
    });

    it('applies type and text together', () => {
        expect(filterVaultAssets(library, { typeFilter: 'videos', text: 'cowboy' })).toEqual([]);
    });

    it('leaves server results alone', () => {
        // The case that matters most: semantic search returns assets whose names
        // do not contain the query, and filtering again would discard exactly
        // those — which is the whole point of searching by meaning.
        const hits = [asset('a-house'), asset('a-barn')];
        expect(filterVaultAssets(hits, { text: 'cowboy', serverAnswered: true })).toHaveLength(2);
    });

    it('still restricts server results by type', () => {
        const hits = [asset('a'), asset('b', { type: 'videos' })];
        expect(ids(filterVaultAssets(hits, { typeFilter: 'videos', serverAnswered: true }))).toEqual(['b']);
    });

    it('treats a blank query as no filter at all', () => {
        expect(filterVaultAssets(library, { text: '   ' })).toHaveLength(5);
    });

    it('returns empty rather than throwing when nothing matches', () => {
        expect(filterVaultAssets(library, { text: 'zzzz' })).toEqual([]);
    });

    it('handles assets missing optional fields', () => {
        const sparse = [asset('x', {
            description: undefined, tags: undefined,
            origin: { connector: 'local', uri: 'file://d:/x.png' },
        } as Partial<VaultAssetRecord>)];
        expect(() => filterVaultAssets(sparse, { text: 'x' })).not.toThrow();
        expect(filterVaultAssets(sparse, { text: 'x' })).toHaveLength(1);
    });

    it('does not mutate the input', () => {
        const input = [...library];
        filterVaultAssets(input, { text: 'cowboy' });
        expect(input).toHaveLength(5);
    });
});

/**
 * The reason this dimension exists: one real vault held 81 assets the user had
 * imported or generated against 239,688 indexed from disk. Without separating
 * them, the assets someone actually works with are 0.03% of what they see.
 */
describe('source', () => {
    const inApp = asset('generated-1', {
        origin: { connector: 'server', uri: 'server://a.png', displayPath: 'a.png' },
    } as Partial<VaultAssetRecord>);
    const scanned = asset('from-drive', {
        origin: { connector: 'local', uri: 'file://z:/a.png', displayPath: 'z:/a.png', watchRootId: 'wr_z' },
    } as Partial<VaultAssetRecord>);
    const mixed = [inApp, scanned];

    it('keeps only what was brought into the app', () => {
        expect(ids(filterVaultAssets(mixed, { source: 'library' }))).toEqual(['generated-1']);
    });

    it('keeps only what a drive scan found', () => {
        expect(ids(filterVaultAssets(mixed, { source: 'indexed' }))).toEqual(['from-drive']);
    });

    it('keeps everything for "all", and when unset', () => {
        expect(filterVaultAssets(mixed, { source: 'all' })).toHaveLength(2);
        expect(filterVaultAssets(mixed, {})).toHaveLength(2);
    });

    it('decides on the watch root, not the category', () => {
        // A scanned file is also category "uploads", so category cannot tell
        // these apart — only whether a watch root discovered it.
        const scannedUpload = asset('x', {
            category: 'uploads',
            origin: { connector: 'local', uri: 'file://z:/x.png', displayPath: '', watchRootId: 'wr_z' },
        } as Partial<VaultAssetRecord>);
        const appUpload = asset('y', {
            category: 'uploads',
            origin: { connector: 'server', uri: 'server://y.png', displayPath: '' },
        } as Partial<VaultAssetRecord>);
        expect(ids(filterVaultAssets([scannedUpload, appUpload], { source: 'library' }))).toEqual(['y']);
    });

    it('combines with the text filter', () => {
        const many = [inApp, scanned, asset('generated-2', {
            origin: { connector: 'server', uri: 'server://b.png', displayPath: '' },
        } as Partial<VaultAssetRecord>)];
        expect(ids(filterVaultAssets(many, { source: 'library', text: 'generated-2' })))
            .toEqual(['generated-2']);
    });
});

describe('countVaultAssetSources', () => {
    it('splits the set so the control can label itself', () => {
        const assets = [
            asset('a'),
            asset('b', { origin: { connector: 'local', uri: 'f', displayPath: '', watchRootId: 'wr' } } as Partial<VaultAssetRecord>),
            asset('c', { origin: { connector: 'local', uri: 'f', displayPath: '', watchRootId: 'wr' } } as Partial<VaultAssetRecord>),
        ];
        expect(countVaultAssetSources(assets)).toEqual({ all: 3, library: 1, indexed: 2 });
    });

    it('handles an empty catalog', () => {
        expect(countVaultAssetSources([])).toEqual({ all: 0, library: 0, indexed: 0 });
    });
});
