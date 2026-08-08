import { readVaultCatalog } from '@/lib/server/vault-store';
import { fileUriToPath } from '@/lib/server/vaultFilesystemPolicy';
import {
    getVaultThumbnail,
    hasCachedThumbnail,
    isThumbnailerAvailable,
} from '@/lib/server/vaultThumbnails';
import { getQueue } from '@/lib/server/jobQueue';
import type { QueueHandlerContext } from '@/lib/server/jobQueue/types';

/**
 * Pre-generates grid thumbnails so opening the vault is instant.
 *
 * Two ways to run, chosen by the payload:
 *
 * - **Passive** (the default; queued by opening the vault): one bounded pass,
 *   so a casual open never commits the machine to hours of work.
 * - **Service** (`continuous: true`; the user pressed "Index & precache"):
 *   each pass re-enqueues the next with a **cursor**, so the run walks the
 *   whole catalog to completion without ever holding a lane for hours —
 *   between passes the lane frees, and interactive work (priority > this)
 *   always goes first. Progress is durable in the on-disk cache, so a crash
 *   or restart costs at most one pass.
 *
 * The user can stop it: the handler checks `stopRequested()` between batches
 * and exits cleanly, and a stopped pass does not re-enqueue.
 */

/** The width the grid asks for. Matches resolveVaultThumbnailUrl. */
const GRID_WIDTH = 256;

/** How many images to decode at once. */
const CONCURRENCY = 4;

/**
 * Pause between decode batches, so the pass never saturates the machine.
 * Four decodes then a breath keeps CPU available for the editor, exports and
 * generation the user is actually waiting on — this is a background nicety.
 * Overridable so a weak machine can be gentler (and tests can be instant).
 */
// Read lazily, not at module init: imports are hoisted above any statement,
// so a test (or launcher) that sets the variable "before the import" would
// otherwise be silently ignored.
function batchPauseMs(): number {
    const raw = Number(process.env.IMAGE_EXPRESS_THUMB_PAUSE_MS);
    return Number.isFinite(raw) && raw >= 0 ? raw : 50;
}

/**
 * Stop after this many generated thumbnails in one job.
 *
 * A vault can hold hundreds of thousands of images. One job that ran for hours
 * would hold a lane the whole time and be impossible to reason about; a
 * continuous run chains passes instead, resuming from `cursor`.
 */
const MAX_PER_RUN = 4000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Files that failed to decode this process lifetime (RAW, HDR, corrupt).
 *
 * Without this, every pass re-reads and re-fails the same files — an .hdr
 * panorama costs a full read before sharp gives up, so a folder of them made
 * the service grind visibly while producing nothing. In-memory on purpose:
 * a restart retries once, which also picks up files that were fixed.
 */
const undecodablePaths = new Set<string>();

export async function runVaultThumbsJob(ctx: QueueHandlerContext): Promise<void> {
    if (!isThumbnailerAvailable()) {
        await ctx.update({
            stage: 'store',
            progress: 1,
            message: 'No image codec available; thumbnails will be generated on demand.',
        });
        return;
    }

    const continuous = ctx.job.payload.continuous === true;
    const startCursor = typeof ctx.job.payload.cursor === 'number'
        ? Math.max(0, ctx.job.payload.cursor)
        : 0;

    await ctx.update({ stage: 'worker', progress: 0.02, message: 'Finding images to prepare…' });
    const catalog = await readVaultCatalog();

    // Only drive-indexed stills: server assets are warmed on demand through
    // their serve route, and video and 3D thumbnails are produced in the
    // browser from a captured frame.
    const candidates = catalog.assets.filter((asset) => (
        asset.type === 'images'
        && (asset.origin?.connector === 'local' || asset.origin?.connector === 'network')
    ));

    if (candidates.length === 0) {
        await ctx.update({ stage: 'store', progress: 1, message: 'Nothing to prepare.' });
        return;
    }

    // A stale cursor (catalog shrank since the last pass) restarts from the
    // top; the cache makes re-checking cheap.
    const cursor = startCursor < candidates.length ? startCursor : 0;

    let index = cursor;
    let generated = 0;
    let queued = 0;
    const batch: string[] = [];

    const flush = async () => {
        if (batch.length === 0) return;
        const paths = batch.splice(0, batch.length);
        await Promise.all(paths.map(async (absolute) => {
            // A failure here is expected for a RAW file or a corrupt image; the
            // route falls back to the original, so it is not worth failing the
            // whole job over one file — but it is remembered, so the next pass
            // does not pay the read again.
            const thumbnail = await getVaultThumbnail(absolute, GRID_WIDTH).catch(() => null);
            if (thumbnail) generated += 1;
            else undecodablePaths.add(absolute);
        }));
        // Yield between batches so this never reads as "the app got slow
        // while indexing". Skipped outright at 0: a timer still costs a
        // timer tick (~15 ms on Windows), which is not "no pause".
        const pause = batchPauseMs();
        if (pause > 0) await sleep(pause);
    };

    for (; index < candidates.length; index += 1) {
        if (queued >= MAX_PER_RUN) break;
        if (ctx.stopRequested?.()) break;

        const asset = candidates[index];
        const absolute = fileUriToPath(asset.origin.uri);
        if (!absolute) continue;
        if (undecodablePaths.has(absolute)) continue;

        if (await hasCachedThumbnail(absolute, GRID_WIDTH)) {
            // Progress must move while walking cached stretches too — tens of
            // thousands of already-done files with a silent bar reads as hung.
            if (index % 2000 === 0) {
                await ctx.update({
                    stage: 'ai',
                    progress: Math.min(0.99, index / candidates.length),
                    message: `Prepared ${generated.toLocaleString()} thumbnails — ${index.toLocaleString()} of ${candidates.length.toLocaleString()} checked…`,
                });
            }
            continue;
        }

        batch.push(absolute);
        queued += 1;

        if (batch.length >= CONCURRENCY) {
            await flush();
            await ctx.update({
                stage: 'ai',
                // Progress against the whole catalog, not this pass's budget —
                // a continuous run is one service in the user's eyes, and the
                // bar should say how far through their assets it is.
                progress: Math.min(0.99, index / candidates.length),
                message: `Prepared ${generated.toLocaleString()} thumbnails — ${index.toLocaleString()} of ${candidates.length.toLocaleString()} checked…`,
            });
        }
    }

    await flush();

    const stopped = ctx.stopRequested?.() === true;
    const remaining = candidates.length - index;

    if (stopped) {
        await ctx.update({
            stage: 'store',
            message: `Stopped after ${generated.toLocaleString()} thumbnails; ${remaining.toLocaleString()} images not yet checked.`,
        });
        return;
    }

    if (continuous && remaining > 0) {
        // Chain the next pass directly — the "one pass in flight" guard in
        // requestVaultThumbnails would refuse while this job still counts as
        // running. Same kind, same lane, same priority; only the cursor moves.
        await getQueue().enqueue({
            kind: ctx.job.kind,
            lane: ctx.job.lane,
            external: false,
            label: ctx.job.label,
            payload: { continuous: true, cursor: index },
            priority: ctx.job.priority,
        });
        await ctx.update({
            stage: 'store',
            progress: Math.min(0.99, index / candidates.length),
            message: `Prepared ${generated.toLocaleString()} thumbnails; continuing with ${remaining.toLocaleString()} to go.`,
        });
        return;
    }

    await ctx.update({
        stage: 'store',
        progress: 1,
        message: remaining > 0
            ? `Prepared ${generated.toLocaleString()} thumbnails; more to do on the next pass.`
            : `Prepared ${generated.toLocaleString()} thumbnails.`,
    });
}
