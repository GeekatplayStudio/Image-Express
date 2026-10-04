import type { QueueHandlerContext } from '@/lib/server/jobQueue/types';
import { runWatchRootScan } from '@/lib/server/vaultScanRunner';

/** How often the job reports while walking; each report also renews its lease. */
const REPORT_EVERY_MS = 750;

/** Scan one watch root as a queue job: visible in the Activity panel, and stoppable. */
export async function runVaultScanJob(ctx: QueueHandlerContext): Promise<void> {
    const rootId = typeof ctx.job.payload.rootId === 'string' ? ctx.job.payload.rootId : '';
    if (!rootId) throw new Error('This scan job has no watch root.');

    await ctx.update({ stage: 'worker', progress: 0.02, message: 'Reading folders…' });

    let lastReport = 0;
    let pending: Promise<void> = Promise.resolve();
    const outcome = await runWatchRootScan(rootId, {
        shouldStop: () => ctx.stopRequested?.() === true,
        onProgress: ({ files, directories }) => {
            const now = Date.now();
            if (now - lastReport < REPORT_EVERY_MS) return;
            lastReport = now;
            // The total is unknown until the walk ends, so this reports counts,
            // not a percentage it would have to invent.
            pending = pending
                .then(() => ctx.update({
                    stage: 'worker',
                    message: `Found ${files.toLocaleString()} files in ${directories.toLocaleString()} folders…`,
                }))
                .catch(() => {});
        },
    });
    await pending;

    const { stats } = outcome;
    const changes = [
        stats.added && `${stats.added.toLocaleString()} new`,
        stats.updated && `${stats.updated.toLocaleString()} changed`,
        stats.restored && `${stats.restored.toLocaleString()} restored`,
        stats.missing && `${stats.missing.toLocaleString()} missing`,
    ].filter(Boolean).join(', ') || 'no changes';

    await ctx.update({
        stage: 'store',
        progress: 1,
        message: outcome.stopped
            ? `Stopped after ${outcome.fileCount.toLocaleString()} files: ${changes}. Nothing was removed.`
            : `${outcome.fileCount.toLocaleString()} files: ${changes}.`,
    });
}
