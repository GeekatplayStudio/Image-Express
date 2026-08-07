import {
    assetIdsInVaultFolder,
    buildVaultFolderTree,
    splitVaultUri,
    vaultFolderPath,
} from '@/features/asset-vault/domain/vaultFolderTree';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

const asset = (id: string, uri: string, watchRootId?: string): VaultAssetRecord => ({
    id,
    name: uri.split('/').pop() ?? id,
    mimeType: 'image/png',
    type: 'images',
    category: 'uploads',
    sizeBytes: 1,
    origin: { connector: 'local', uri, displayPath: uri, watchRootId },
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
} as VaultAssetRecord);

describe('splitVaultUri', () => {
    it('splits a windows file uri into folders and a file name', () => {
        expect(splitVaultUri('file://d:/360-raw/Camera01/IMG.bmp')).toEqual({
            segments: ['d:', '360-raw', 'Camera01'],
            fileName: 'IMG.bmp',
        });
    });

    it('splits a server uri the same way', () => {
        expect(splitVaultUri('server://uploads/images/a.png')).toEqual({
            segments: ['uploads', 'images'],
            fileName: 'a.png',
        });
    });

    it('decodes percent-encoded segments', () => {
        expect(splitVaultUri('file://d:/My%20Photos/a%20b.png')).toEqual({
            segments: ['d:', 'My Photos'],
            fileName: 'a b.png',
        });
    });

    it('survives malformed percent-encoding rather than dropping the asset', () => {
        const result = splitVaultUri('file://d:/bad%ZZ/a.png');
        expect(result?.segments).toEqual(['d:', 'bad%ZZ']);
    });

    it('tolerates backslash separators', () => {
        expect(splitVaultUri('file://d:\\raw\\a.png')?.segments).toEqual(['d:', 'raw']);
    });

    it('returns null when there is no folder component', () => {
        expect(splitVaultUri('file://a.png')).toBeNull();
        expect(splitVaultUri('')).toBeNull();
    });
});

describe('buildVaultFolderTree', () => {
    const assets = [
        asset('a1', 'file://d:/100_FUJI/DSCF0001.JPG', 'wr_1'),
        asset('a2', 'file://d:/100_FUJI/DSCF0002.JPG', 'wr_1'),
        asset('a3', 'file://d:/360-raw/Camera01/Thumb/IMG.bmp', 'wr_1'),
        asset('a4', 'file://d:/360-raw/Camera01/RAW.bmp', 'wr_1'),
        asset('a5', 'server://uploads/images/logo.png'),
    ];

    it('creates one node per distinct folder, keyed by path', () => {
        const tree = buildVaultFolderTree(assets);
        expect(tree.nodes.has('d:')).toBe(true);
        expect(tree.nodes.has('d:/100_FUJI')).toBe(true);
        expect(tree.nodes.has('d:/360-raw/Camera01/Thumb')).toBe(true);
        expect(tree.nodes.has('uploads/images')).toBe(true);
    });

    it('places assets in their immediate folder only', () => {
        const tree = buildVaultFolderTree(assets);
        expect(tree.nodes.get('d:/100_FUJI')?.assetIds).toEqual(['a1', 'a2']);
        expect(tree.nodes.get('d:/360-raw/Camera01')?.assetIds).toEqual(['a4']);
        expect(tree.nodes.get('d:')?.assetIds).toEqual([]);
    });

    it('accumulates recursive counts up every ancestor', () => {
        const tree = buildVaultFolderTree(assets);
        expect(tree.nodes.get('d:')?.totalCount).toBe(4);
        expect(tree.nodes.get('d:/360-raw')?.totalCount).toBe(2);
        expect(tree.nodes.get('d:/360-raw/Camera01/Thumb')?.totalCount).toBe(1);
    });

    it('links parents and children, and sorts children naturally', () => {
        const tree = buildVaultFolderTree([
            asset('x1', 'file://d:/f/item10/a.png'),
            asset('x2', 'file://d:/f/item2/a.png'),
        ]);
        expect(tree.nodes.get('d:/f')?.childIds).toEqual(['d:/f/item2', 'd:/f/item10']);
        expect(tree.nodes.get('d:/f/item2')?.parentId).toBe('d:/f');
        expect(tree.nodes.get('d:')?.depth).toBe(0);
        expect(tree.nodes.get('d:/f')?.depth).toBe(1);
    });

    it('exposes sorted roots', () => {
        expect(buildVaultFolderTree(assets).rootIds).toEqual(['d:', 'uploads']);
    });

    it('carries the watch root id onto nodes', () => {
        const tree = buildVaultFolderTree(assets);
        expect(tree.nodes.get('d:/100_FUJI')?.watchRootId).toBe('wr_1');
    });

    it('collects assets with no usable path instead of dropping them', () => {
        const tree = buildVaultFolderTree([asset('lonely', 'file://a.png')]);
        expect(tree.unfiledAssetIds).toEqual(['lonely']);
        expect(tree.nodes.size).toBe(0);
    });

    it('keeps folder ids stable when more assets are indexed', () => {
        // The regression this design exists to prevent: album page ids are
        // positional, so a re-index renumbered them and reset the user's place.
        const before = buildVaultFolderTree(assets);
        const after = buildVaultFolderTree([...assets, asset('a6', 'file://d:/100_FUJI/DSCF0003.JPG')]);
        expect(after.nodes.has('d:/100_FUJI')).toBe(true);
        expect(before.nodes.get('d:/100_FUJI')?.id).toBe(after.nodes.get('d:/100_FUJI')?.id);
        expect(after.nodes.get('d:/100_FUJI')?.totalCount).toBe(3);
    });

    it('handles a large catalog in one pass', () => {
        const many = Array.from({ length: 20_000 }, (_, i) => (
            asset(`m${i}`, `file://d:/bulk/dir${i % 50}/file${i}.png`)
        ));
        const tree = buildVaultFolderTree(many);
        expect(tree.nodes.get('d:/bulk')?.totalCount).toBe(20_000);
        expect(tree.nodes.get('d:/bulk')?.childIds).toHaveLength(50);
    });
});

describe('vaultFolderPath', () => {
    it('returns the ancestor chain root first', () => {
        const tree = buildVaultFolderTree([asset('a', 'file://d:/360-raw/Camera01/Thumb/IMG.bmp')]);
        expect(vaultFolderPath(tree, 'd:/360-raw/Camera01/Thumb').map((n) => n.name))
            .toEqual(['d:', '360-raw', 'Camera01', 'Thumb']);
    });

    it('returns empty for an unknown node', () => {
        expect(vaultFolderPath(buildVaultFolderTree([]), 'nope')).toEqual([]);
    });
});

describe('assetIdsInVaultFolder', () => {
    const tree = buildVaultFolderTree([
        asset('a1', 'file://d:/f/a.png'),
        asset('a2', 'file://d:/f/sub/b.png'),
        asset('a3', 'file://d:/f/sub/deep/c.png'),
    ]);

    it('returns only direct assets by default', () => {
        expect(assetIdsInVaultFolder(tree, 'd:/f')).toEqual(['a1']);
    });

    it('returns the whole subtree when recursive', () => {
        expect(assetIdsInVaultFolder(tree, 'd:/f', { recursive: true }).sort())
            .toEqual(['a1', 'a2', 'a3']);
    });

    it('returns empty for an unknown folder', () => {
        expect(assetIdsInVaultFolder(tree, 'missing', { recursive: true })).toEqual([]);
    });
});
