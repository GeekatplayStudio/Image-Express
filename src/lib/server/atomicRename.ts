/**
 * Rename retry for the temp-file + rename idiom used by the on-disk stores.
 *
 * On Windows a rename over an existing file fails with EPERM/EACCES whenever
 * anything else holds the target open — most often a virus scanner or the
 * search indexer sampling the file microseconds after it was written, or a
 * second dev server writing the same store. The lock is transient, so a short
 * backoff clears it; without one, a scanner touching `jobs.json` silently drops
 * a queue mutation.
 */

import { promises as fs } from 'node:fs';

/** Transient Windows lock contention. ENOENT and friends are real errors. */
const RETRYABLE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

const RETRY_DELAYS_MS = [10, 25, 50, 100, 200];

const errorCode = (error: unknown): string | undefined =>
    (error as NodeJS.ErrnoException | null)?.code;

const delay = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * `fs.rename`, retried through transient lock contention.
 *
 * On final failure the temp file is removed before rethrowing, so a wedged
 * target cannot litter the directory with `.tmp-*` leftovers.
 */
export async function renameWithRetry(tempPath: string, targetPath: string): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            await fs.rename(tempPath, targetPath);
            return;
        } catch (error) {
            const code = errorCode(error);
            if (!code || !RETRYABLE_CODES.has(code) || attempt >= RETRY_DELAYS_MS.length) {
                await fs.rm(tempPath, { force: true }).catch(() => {});
                throw error;
            }
            await delay(RETRY_DELAYS_MS[attempt]);
        }
    }
}
