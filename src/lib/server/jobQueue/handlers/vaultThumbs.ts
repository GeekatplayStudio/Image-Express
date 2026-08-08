import { readVaultCatalog } from '@/lib/server/vault-store';
import { fileUriToPath } from '@/lib/server/vaultFilesystemPolicy';
import {
    getVaultThumbnail,
    hasCachedThumbnail,
    isThumbnailerAvailable,
} from '@/lib/server/vaultThumbnails';
import type { QueueHandlerContext } from '@/lib/server/jobQueue/types';

/**
 * Pre-generates grid thumbnails so opening the vault is instant.
 *
 * Generating on demand meant the first view of any page decoded 96 images
 * before it could draw — roughly 120 ms each, so about eleven seconds of
 * nothing, repeated for every folder the user had not visited yet. Reopening
 * the vault paid it again for anything not already rendered.
 *
 * Doing it here means the work happens once, ahead of time, against a cache
 * that survives restarts.
 */

/** The width the grid asks for. Matches resolveVaultThumbnailUrl. */
const GRID_WIDTH = 256;

/** How many images to decode at once. */
const CONCURRENCY = 4;

/**
 * Stop after this many in one job.
 *
 * A vault can hold hundreds of thousands of images. One job that ran for hours
 * would hold a lane the whole time and be impossible to reason about; the next
 * run resumes because progress lives in the on-disk cache, not in the job.
 */
const MAX_PER_RUN = 4000;

export async function runVaultThumbsJob(ctx: QueueHandlerContext): Promise<void> {
    if (!isThumbnailerAvailable()) {
        await ctx.update({
            stage: 'store',
            progress: 1,
            message: 'No image codec available; thumbnails will be generated on demand.',
        });
        return;
    }

    await ctx.update({ stage: 'worker', progress: 0.02, message: 'Finding images to prepare…' });
    const catalog = await readVaultCatalog();

    // Only drive-indexed stills: server assets already have their own preview,
    // and video and 3D thumbnails are produced in the browser.
    const candidates = catalog.assets.filter((asset) => (
        asset.type === 'images'
        && (asset.origin?.connector === 'local' || asset.origin?.connector === 'network')
    ));

    if (candidates.length === 0) {
        await ctx.update({ stage: 'store', progress: 1, message: 'Nothing to prepare.' });
        return;
    }

    let checked = 0;
    let generated = 0;
    let queued = 0;
    const batch: string[] = [];

    const flush = async () => {
        if (batch.length === 0) return;
        const paths = batch.splice(0, batch.length);
        await Promise.all(paths.map(async (absolute) => {
            // A failure here is expected for a RAW file or a corrupt image; the
            // route falls back to the original, so it is not worth failing the
            // whole job over one file.
            const thumbnail = await getVaultThumbnail(absolute, GRID_WIDTH).catch(() => null);
            if (thumbnail) generated += 1;
        }));
    };

    for (const asset of candidates) {
        if (queued >= MAX_PER_RUN) break;

        const absolute = fileUriToPath(asset.origin.uri);
        if (!absolute) continue;

        checked += 1;
        if (await hasCachedThumbnail(absolute, GRID_WIDTH)) continue;

        batch.push(absolute);
        queued += 1;

        if (batch.length >= CONCURRENCY) {
            await flush();
            // Progress against the run's budget, not the whole catalog — the
            // bar should reach the end of *this* pass.
            await ctx.update({
                stage: 'ai',
                progress: 0.05 + 0.9 * (queued / MAX_PER_RUN),
                message: `Prepared ${generated.toLocaleString()} thumbnails…`,
            });
        }
    }

    await flush();

    const remaining = candidates.length - checked;
    await ctx.update({
        stage: 'store',
        progress: 1,
        message: remaining > 0
            ? `Prepared ${generated.toLocaleString()} thumbnails; more to do on the next pass.`
            : `Prepared ${generated.toLocaleString()} thumbnails.`,
    });
}
