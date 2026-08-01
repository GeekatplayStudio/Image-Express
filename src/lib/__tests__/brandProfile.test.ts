import {
    BrandProfile,
    DEFAULT_BRAND_PROFILE,
    deleteBrandProfile,
    getActiveBrandProfile,
    loadBrandProfiles,
    saveBrandProfile,
    setActiveBrandProfileId,
} from '../brand/brandProfile';

const makeProfile = (id: string, name: string): BrandProfile => ({
    ...DEFAULT_BRAND_PROFILE,
    id,
    name,
    isDefault: false,
});

describe('brandProfile', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns the default brand kit when storage is empty', () => {
        const profiles = loadBrandProfiles();
        expect(profiles).toHaveLength(1);
        expect(profiles[0].id).toBe('default-brand-kit');
        expect(getActiveBrandProfile().id).toBe('default-brand-kit');
    });

    it('returns the default brand kit when storage contains corrupt JSON', () => {
        localStorage.setItem('image-express-brand-profiles', '{not json');
        expect(loadBrandProfiles()).toEqual([DEFAULT_BRAND_PROFILE]);
    });

    it('saves a new profile, persists it, and makes it active', () => {
        const custom = makeProfile('acme-kit', 'Acme Corp');
        const next = saveBrandProfile(custom);

        expect(next.map((p) => p.id)).toEqual(['default-brand-kit', 'acme-kit']);
        expect(loadBrandProfiles().map((p) => p.id)).toEqual(['default-brand-kit', 'acme-kit']);
        expect(getActiveBrandProfile().id).toBe('acme-kit');
    });

    it('updates an existing profile in place instead of duplicating it', () => {
        saveBrandProfile(makeProfile('acme-kit', 'Acme Corp'));
        const next = saveBrandProfile(makeProfile('acme-kit', 'Acme Corp v2'));

        expect(next).toHaveLength(2);
        expect(next.find((p) => p.id === 'acme-kit')?.name).toBe('Acme Corp v2');
    });

    it('switches the active profile via setActiveBrandProfileId', () => {
        saveBrandProfile(makeProfile('acme-kit', 'Acme Corp'));
        setActiveBrandProfileId('default-brand-kit');
        expect(getActiveBrandProfile().id).toBe('default-brand-kit');
    });

    it('deletes a profile and reassigns the active profile', () => {
        saveBrandProfile(makeProfile('acme-kit', 'Acme Corp'));
        expect(getActiveBrandProfile().id).toBe('acme-kit');

        const remaining = deleteBrandProfile('acme-kit');
        expect(remaining.map((p) => p.id)).toEqual(['default-brand-kit']);
        expect(getActiveBrandProfile().id).toBe('default-brand-kit');
    });

    it('restores the default profile when the last profile is deleted', () => {
        const remaining = deleteBrandProfile('default-brand-kit');
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe('default-brand-kit');
    });
});
