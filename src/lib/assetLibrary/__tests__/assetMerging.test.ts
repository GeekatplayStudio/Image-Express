/**
 * @jest-environment jsdom
 */

import {
    GROUPS_STORAGE_PREFIX,
    getAssetGroupKey,
    getAssetMergeKey,
    getSourceAssets,
    inferAssetType,
    isDrivePassiveAuthError,
    loadAssetGroups,
    mergeDuplicateAssets,
    pickRepresentativeAsset,
    saveAssetGroups,
    type AssetStorageProvider,
    type LibraryAsset,
} from '@/lib/assetLibrary/assetMerging';

const libraryAsset = (over: Partial<LibraryAsset> = {}): LibraryAsset => ({
    name: 'photo.png',
    type: 'images',
    category: 'uploads',
    path: '/assets/photo.png',
    owner: 'ada',
    isPublic: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    storageProvider: 'server' as AssetStorageProvider,
    ...over,
} as LibraryAsset);

describe('inferAssetType', () => {
    it('trusts the MIME type over the extension', () => {
        // A .png served as video/mp4 is a video; the extension is the weaker signal.
        expect(inferAssetType('clip.png', 'video/mp4')).toBe('videos');
        expect(inferAssetType('model.png', 'model/gltf-binary')).toBe('models');
    });

    it.each([
        ['a.mp4', 'videos'],
        ['a.mkv', 'videos'],
        ['a.mp3', 'audio'],
        ['a.flac', 'audio'],
        ['a.glb', 'models'],
        ['a.stl', 'models'],
        ['a.png', 'images'],
    ])('classifies %s by extension as %s', (name, expected) => {
        expect(inferAssetType(name)).toBe(expected);
    });

    it('is case-insensitive about the extension', () => {
        expect(inferAssetType('CLIP.MP4')).toBe('videos');
    });

    it('falls back to images for an unknown or absent extension', () => {
        expect(inferAssetType('mystery.xyz')).toBe('images');
        expect(inferAssetType('no-extension')).toBe('images');
    });

    it('ignores a MIME type it does not recognise and uses the extension', () => {
        expect(inferAssetType('a.mp3', 'application/octet-stream')).toBe('audio');
    });
});

describe('isDrivePassiveAuthError', () => {
    it.each([
        'This action requires user interaction',
        'Failed to open popup window',
        'popup_failed_to_open',
        'Blocked by Cross-Origin-Opener-Policy',
    ])('treats "%s" as a blocked popup, not an auth failure', (message) => {
        expect(isDrivePassiveAuthError(new Error(message))).toBe(true);
    });

    it('does not swallow a real authorization failure', () => {
        expect(isDrivePassiveAuthError(new Error('invalid_grant: token expired'))).toBe(false);
    });

    it('handles non-Error values without throwing', () => {
        expect(isDrivePassiveAuthError(null)).toBe(false);
        expect(isDrivePassiveAuthError('requires user interaction')).toBe(true);
    });
});

describe('getAssetMergeKey', () => {
    it('ignores case and surrounding whitespace in the name', () => {
        expect(getAssetMergeKey(libraryAsset({ name: '  Photo.PNG ' })))
            .toBe(getAssetMergeKey(libraryAsset({ name: 'photo.png' })));
    });

    it('keeps two users\' identically-named assets apart', () => {
        expect(getAssetMergeKey(libraryAsset({ owner: 'ada' })))
            .not.toBe(getAssetMergeKey(libraryAsset({ owner: 'grace' })));
    });

    it('treats a public and a private copy as different assets', () => {
        // They are not interchangeable: merging them could expose a private file.
        expect(getAssetMergeKey(libraryAsset({ isPublic: true })))
            .not.toBe(getAssetMergeKey(libraryAsset({ isPublic: false })));
    });

    it('separates the same filename in different categories', () => {
        expect(getAssetMergeKey(libraryAsset({ category: 'uploads' })))
            .not.toBe(getAssetMergeKey(libraryAsset({ category: 'generated' })));
    });
});

describe('pickRepresentativeAsset', () => {
    it('prefers local, which needs no network at all', () => {
        const merged = libraryAsset({
            storageProvider: 'merged',
            sourceAssets: [
                libraryAsset({ storageProvider: 'server', path: 's' }),
                libraryAsset({ storageProvider: 'google-drive', path: 'g' }),
                libraryAsset({ storageProvider: 'local', path: 'l' }),
            ],
        });
        expect(pickRepresentativeAsset(merged).path).toBe('l');
    });

    it('prefers Drive over the server when there is no local copy', () => {
        const merged = libraryAsset({
            storageProvider: 'merged',
            sourceAssets: [
                libraryAsset({ storageProvider: 'server', path: 's' }),
                libraryAsset({ storageProvider: 'google-drive', path: 'g' }),
            ],
        });
        expect(pickRepresentativeAsset(merged).path).toBe('g');
    });

    it('returns the asset itself when it has no sources', () => {
        const plain = libraryAsset({ path: 'only' });
        expect(pickRepresentativeAsset(plain).path).toBe('only');
    });

    it('falls back to the asset when every source is itself merged', () => {
        const merged = libraryAsset({
            storageProvider: 'merged',
            path: 'self',
            sourceAssets: [libraryAsset({ storageProvider: 'merged' })],
        });
        expect(pickRepresentativeAsset(merged).path).toBe('self');
    });
});

describe('getSourceAssets', () => {
    it('returns the asset itself when there are no sources', () => {
        const plain = libraryAsset();
        expect(getSourceAssets(plain)).toEqual([plain]);
    });

    it('returns the sources when present', () => {
        const sources = [libraryAsset({ path: 'a' }), libraryAsset({ path: 'b' })];
        expect(getSourceAssets(libraryAsset({ sourceAssets: sources }))).toBe(sources);
    });
});

describe('mergeDuplicateAssets', () => {
    it('collapses the same asset stored in three places into one entry', () => {
        const merged = mergeDuplicateAssets([
            libraryAsset({ storageProvider: 'server' }),
            libraryAsset({ storageProvider: 'local' }),
            libraryAsset({ storageProvider: 'google-drive' }),
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].storageProvider).toBe('merged');
        expect(merged[0].sourceAssets).toHaveLength(3);
        expect(merged[0].path.startsWith('merged://')).toBe(true);
    });

    it('leaves a unique asset untouched rather than wrapping it', () => {
        const merged = mergeDuplicateAssets([libraryAsset({ path: '/original.png' })]);
        expect(merged[0].storageProvider).toBe('server');
        expect(merged[0].path).toBe('/original.png');
    });

    it('does not merge assets that differ by owner', () => {
        expect(mergeDuplicateAssets([
            libraryAsset({ owner: 'ada' }),
            libraryAsset({ owner: 'grace' }),
        ])).toHaveLength(2);
    });

    it('sorts newest first', () => {
        const merged = mergeDuplicateAssets([
            libraryAsset({ name: 'old.png', updatedAt: '2026-01-01T00:00:00.000Z' }),
            libraryAsset({ name: 'new.png', updatedAt: '2026-06-01T00:00:00.000Z' }),
        ]);
        expect(merged.map((a) => a.name)).toEqual(['new.png', 'old.png']);
    });

    it('does not throw on a missing updatedAt', () => {
        expect(() => mergeDuplicateAssets([
            libraryAsset({ name: 'a.png', updatedAt: undefined }),
            libraryAsset({ name: 'b.png' }),
        ])).not.toThrow();
    });

    it('returns an empty list for empty input', () => {
        expect(mergeDuplicateAssets([])).toEqual([]);
    });
});

describe('getAssetGroupKey', () => {
    it('excludes visibility, so toggling public does not lose group membership', () => {
        expect(getAssetGroupKey(libraryAsset({ isPublic: true })))
            .toBe(getAssetGroupKey(libraryAsset({ isPublic: false })));
    });

    it('excludes storage provider, so a merge does not lose group membership', () => {
        expect(getAssetGroupKey(libraryAsset({ storageProvider: 'local' })))
            .toBe(getAssetGroupKey(libraryAsset({ storageProvider: 'merged' })));
    });
});

describe('asset group persistence', () => {
    beforeEach(() => window.localStorage.clear());

    it('round-trips groups for a user', () => {
        saveAssetGroups('Ada', { favourites: ['k1', 'k2'] });
        expect(loadAssetGroups('ada')).toEqual({ favourites: ['k1', 'k2'] });
    });

    it('keys storage case-insensitively by user', () => {
        saveAssetGroups('ADA', { a: ['k'] });
        expect(loadAssetGroups('ada')).toEqual({ a: ['k'] });
    });

    it('returns empty for an unknown user', () => {
        expect(loadAssetGroups('nobody')).toEqual({});
    });

    it('returns empty rather than throwing on corrupt JSON', () => {
        window.localStorage.setItem(`${GROUPS_STORAGE_PREFIX}ada`, '{not json');
        expect(loadAssetGroups('ada')).toEqual({});
    });

    it('rejects a stored array, which is not a group map', () => {
        window.localStorage.setItem(`${GROUPS_STORAGE_PREFIX}ada`, '[1,2,3]');
        expect(loadAssetGroups('ada')).toEqual({});
    });

    it('drops non-string members instead of failing the whole load', () => {
        window.localStorage.setItem(
            `${GROUPS_STORAGE_PREFIX}ada`,
            JSON.stringify({ mixed: ['keep', 42, null, 'also'], bad: 'not-an-array' }),
        );
        expect(loadAssetGroups('ada')).toEqual({ mixed: ['keep', 'also'] });
    });
});
