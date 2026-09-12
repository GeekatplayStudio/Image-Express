import { readVaultCatalog } from '@/lib/server/vault-store';
import { getDerivedHashVectors } from '@/lib/server/vaultDerivedVectors';

/**
 * Pre-warms the caches the Asset Vault reads on its very first request.
 *
 * Both are memoised for the life of the process, so only the *first* vault open
 * after a restart pays for them — and at whole-drive scale that first open is
 * the slow one users actually notice:
 *
 * - `readVaultCatalog()` materialises the entire catalog snapshot (~200k assets
 *   at a full drive scan).
 * - `getDerivedHashVectors()` derives a hash vector per asset for keyword and
 *   similarity ranking.
 *
 * Doing this at startup moves that work into the window where the app is
 * already booting and the user has not asked for anything yet.
 *
 * Deliberately fire-and-forget and deliberately failure-tolerant: a vault that
 * cannot be warmed must still boot the app, and every caller re-derives on
 * demand anyway. Nothing awaits this.
 */
let warmupStarted = false;

export function warmVaultCaches(): void {
    if (warmupStarted) return;
    warmupStarted = true;

    void (async () => {
        const startedAt = Date.now();
        try {
            const catalog = await readVaultCatalog();
            if (catalog.assets.length === 0) return;

            getDerivedHashVectors(catalog);
            console.info(
                `[vault] Warmed ${catalog.assets.length} catalog entries in ${Date.now() - startedAt}ms`,
            );
        } catch (error) {
            console.warn('[vault] Cache warm-up skipped:', error);
        }
    })();
}

/** Lets tests run the warm-up more than once. */
export function resetVaultWarmupForTests(): void {
    warmupStarted = false;
}
