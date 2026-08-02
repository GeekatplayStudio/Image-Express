import { revokeRemovedBlobs, videoSrcWithPosterSeek, vaultLensLabelKey } from '@/components/AssetVault/vaultModalTypes';

describe('vaultModalTypes helpers', () => {
    it('appends poster seek for plain video urls', () => {
        expect(videoSrcWithPosterSeek('https://cdn.example/a.mp4')).toBe('https://cdn.example/a.mp4#t=0.1');
    });

    it('leaves blob and hashed urls unchanged', () => {
        expect(videoSrcWithPosterSeek('blob:abc')).toBe('blob:abc');
        expect(videoSrcWithPosterSeek('https://cdn.example/a.mp4#t=1')).toBe('https://cdn.example/a.mp4#t=1');
    });

    it('maps organize lenses to i18n keys', () => {
        expect(vaultLensLabelKey('type')).toBe('vault.lensType');
        expect(vaultLensLabelKey('date')).toBe('vault.lensDate');
        expect(vaultLensLabelKey('location')).toBe('vault.lensLocation');
        expect(vaultLensLabelKey('subject')).toBe('vault.lensSubject');
    });

    it('revokes removed blob urls only', () => {
        const revoked: string[] = [];
        const original = URL.revokeObjectURL;
        URL.revokeObjectURL = (url: string) => { revoked.push(url); };

        try {
            revokeRemovedBlobs(
                { a: 'blob:keep', b: 'blob:drop', c: 'https://cdn/x' },
                { a: 'blob:keep', d: 'https://cdn/y' },
            );
            expect(revoked).toEqual(['blob:drop']);
        } finally {
            URL.revokeObjectURL = original;
        }
    });
});
