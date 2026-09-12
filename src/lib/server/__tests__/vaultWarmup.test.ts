import { warmVaultCaches, resetVaultWarmupForTests } from '@/lib/server/vaultWarmup';

const mockReadVaultCatalog = jest.fn();
const mockGetDerivedHashVectors = jest.fn();

jest.mock('@/lib/server/vault-store', () => ({
    readVaultCatalog: () => mockReadVaultCatalog(),
}));

jest.mock('@/lib/server/vaultDerivedVectors', () => ({
    getDerivedHashVectors: (catalog: unknown) => mockGetDerivedHashVectors(catalog),
}));

/** Lets the fire-and-forget warm-up settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('warmVaultCaches', () => {
    beforeEach(() => {
        resetVaultWarmupForTests();
        mockReadVaultCatalog.mockReset();
        mockGetDerivedHashVectors.mockReset();
        jest.spyOn(console, 'info').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('materialises the catalog and derives vectors ahead of the first request', async () => {
        const catalog = { assets: [{ id: 'a' }, { id: 'b' }], updatedAt: 'now' };
        mockReadVaultCatalog.mockResolvedValue(catalog);

        warmVaultCaches();
        await flush();

        expect(mockReadVaultCatalog).toHaveBeenCalledTimes(1);
        expect(mockGetDerivedHashVectors).toHaveBeenCalledWith(catalog);
    });

    it('returns immediately without awaiting the catalog read', () => {
        let resolveCatalog: (value: unknown) => void = () => undefined;
        mockReadVaultCatalog.mockReturnValue(new Promise((resolve) => { resolveCatalog = resolve; }));

        // Boot must not block on a whole-drive catalog.
        expect(() => warmVaultCaches()).not.toThrow();
        expect(mockGetDerivedHashVectors).not.toHaveBeenCalled();
        resolveCatalog({ assets: [], updatedAt: 'now' });
    });

    it('runs only once per process', async () => {
        mockReadVaultCatalog.mockResolvedValue({ assets: [{ id: 'a' }], updatedAt: 'now' });

        warmVaultCaches();
        warmVaultCaches();
        warmVaultCaches();
        await flush();

        expect(mockReadVaultCatalog).toHaveBeenCalledTimes(1);
    });

    it('skips vector derivation for an empty catalog', async () => {
        mockReadVaultCatalog.mockResolvedValue({ assets: [], updatedAt: 'now' });

        warmVaultCaches();
        await flush();

        expect(mockGetDerivedHashVectors).not.toHaveBeenCalled();
    });

    it('never lets a broken catalog take the server down', async () => {
        mockReadVaultCatalog.mockRejectedValue(new Error('catalog corrupt'));

        warmVaultCaches();
        await flush();

        expect(console.warn).toHaveBeenCalled();
    });
});
