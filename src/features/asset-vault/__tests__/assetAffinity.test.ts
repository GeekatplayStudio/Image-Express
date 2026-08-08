import { findAffineAssets, folderOf, nameTokens } from '../domain/assetAffinity';
import type { VaultAssetRecord } from '../contracts/assetRecord';

const asset = (overrides: Partial<VaultAssetRecord> & { id: string; name: string; path: string }) => ({
    id: overrides.id,
    name: overrides.name,
    mimeType: 'image/jpeg',
    type: overrides.type ?? 'images',
    category: 'uploads',
    sizeBytes: 1000,
    isPublic: false,
    origin: { connector: 'local', uri: `file:///${overrides.path}`, displayPath: overrides.path },
    aliases: [],
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    modifiedAt: overrides.modifiedAt ?? '2026-01-01T00:00:00.000Z',
} as unknown as VaultAssetRecord);

describe('nameTokens', () => {
    it('drops the extension and separators', () => {
        expect([...nameTokens('beach_sunset-final.JPG')]).toEqual(['beach', 'sunset', 'final']);
    });

    it('drops pure sequence numbers', () => {
        // A frame number is what makes two files *different* takes of the same
        // thing; counting it as similarity would rank every 0001 together.
        expect([...nameTokens('render_0001.png')]).toEqual(['render']);
    });

    it('keeps alphanumeric tokens like camera codes', () => {
        expect([...nameTokens('DJI_20231230_D7.MP4')]).toContain('d7');
    });

    it('returns nothing for a name that is only a number', () => {
        expect(nameTokens('0042.jpg').size).toBe(0);
    });
});

describe('folderOf', () => {
    it('reads the containing folder from a Windows path', () => {
        expect(folderOf(asset({ id: 'a', name: 'x.jpg', path: 'V:\\Shoots\\Reef\\x.jpg' })))
            .toBe('v:\\shoots\\reef');
    });

    it('returns empty for a bare filename rather than guessing', () => {
        expect(folderOf(asset({ id: 'a', name: 'x.jpg', path: 'x.jpg' }))).toBe('');
    });
});

describe('findAffineAssets', () => {
    const seed = asset({ id: 'seed', name: 'reef_dive_wide.mov', path: 'V:\\Shoots\\Reef\\reef_dive_wide.mov', type: 'videos' });

    it('ranks a sibling in the same folder above an unrelated file', () => {
        const sameFolder = asset({ id: 'near', name: 'reef_dive_close.mov', path: 'V:\\Shoots\\Reef\\reef_dive_close.mov', type: 'videos' });
        const elsewhere = asset({ id: 'far', name: 'invoice.pdf', path: 'C:\\Docs\\invoice.pdf' });

        const hits = findAffineAssets(seed, [sameFolder, elsewhere]);
        expect(hits[0].assetId).toBe('near');
        expect(hits[0].reasons).toContain('same folder');
    });

    it('never returns the seed itself', () => {
        expect(findAffineAssets(seed, [seed])).toEqual([]);
    });

    it('excludes files with nothing in common', () => {
        // The whole point of replacing hash vectors: an unrelated audio file in
        // an unrelated folder must not come back as "similar" at all.
        const unrelated = asset({ id: 'u', name: 'River Stereo.wav', path: 'M:\\Audio\\River Stereo.wav', type: 'audio' });
        expect(findAffineAssets(seed, [unrelated])).toEqual([]);
    });

    it('matches on name across folders when the names really overlap', () => {
        const renamed = asset({ id: 'moved', name: 'reef_dive_wide.mp4', path: 'Z:\\Renders\\reef_dive_wide.mp4', type: 'videos' });
        const hits = findAffineAssets(seed, [renamed]);
        expect(hits).toHaveLength(1);
        expect(hits[0].reasons.some((reason) => reason.includes('name word'))).toBe(true);
    });

    it('credits a shoot from the same day', () => {
        const sameDay = asset({
            id: 'day', name: 'other.mov', path: 'V:\\Shoots\\Reef\\other.mov', type: 'videos',
            modifiedAt: '2026-01-01T05:00:00.000Z',
        });
        expect(findAffineAssets(seed, [sameDay])[0].reasons).toContain('from the same day');
    });

    it('does not credit a file written a week later', () => {
        const later = asset({
            id: 'later', name: 'other.mov', path: 'V:\\Shoots\\Reef\\other.mov', type: 'videos',
            modifiedAt: '2026-01-08T00:00:00.000Z',
        });
        expect(findAffineAssets(seed, [later])[0].reasons).not.toContain('from the same day');
    });

    it('honours the limit', () => {
        const many = Array.from({ length: 40 }, (_, i) => asset({
            id: `n${i}`, name: `reef_dive_${i}.mov`, path: `V:\\Shoots\\Reef\\reef_dive_${i}.mov`, type: 'videos',
        }));
        expect(findAffineAssets(seed, many, { limit: 5 })).toHaveLength(5);
    });

    it('scores are bounded and ordered', () => {
        const hits = findAffineAssets(seed, [
            asset({ id: 'a', name: 'reef_dive_wide_v2.mov', path: 'V:\\Shoots\\Reef\\reef_dive_wide_v2.mov', type: 'videos' }),
            asset({ id: 'b', name: 'unrelated.mov', path: 'V:\\Shoots\\Reef\\unrelated.mov', type: 'videos' }),
        ]);
        expect(hits[0].score).toBeGreaterThan(hits[1].score);
        expect(hits[0].score).toBeLessThanOrEqual(1);
    });

    it('handles an empty catalog without throwing', () => {
        expect(findAffineAssets(seed, [])).toEqual([]);
    });
});
