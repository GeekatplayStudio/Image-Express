/**
 * Queue handler for agentic-edit generate jobs.
 *
 * Wraps `processGenerateJob` (which owns provider execution and its own
 * per-job state file) and mirrors its progress into the queue record so
 * the pipeline rail can show Worker -> AI -> Store transitions live. Adds
 * the validation stage the legacy path lacked: a provider "success" with a
 * missing or empty output file is failed as `validation`, never persisted
 * as a good result.
 */

import { promises as fs } from 'node:fs';

import { processGenerateJob, readGenerateJob } from '@/lib/agentic-edit/jobs';
import type { QueueHandlerContext, QueueStage } from '@/lib/server/jobQueue/types';

const PROGRESS_MIRROR_INTERVAL_MS = 700;

const stageForProgress = (progress: number): QueueStage => {
    if (progress < 0.42) return 'worker';
    if (progress < 0.82) return 'ai';
    return 'store';
};

export const runGenerateJob = async ({ job, update }: QueueHandlerContext): Promise<{ resultUrl?: string }> => {
    const generateJobId = typeof job.payload.generateJobId === 'string' ? job.payload.generateJobId : job.id;

    // Mirror the agentic-edit job file's progress into the queue while the
    // provider runs, so SSE subscribers see live stage transitions.
    let mirroring = true;
    const mirror = (async () => {
        while (mirroring) {
            await new Promise((resolve) => setTimeout(resolve, PROGRESS_MIRROR_INTERVAL_MS));
            if (!mirroring) break;
            const state = (await readGenerateJob(generateJobId))?.state;
            if (state && state.status === 'running') {
                await update({
                    stage: stageForProgress(state.progress),
                    progress: state.progress,
                    message: state.message,
                });
            }
        }
    })();

    try {
        await processGenerateJob(generateJobId);
    } finally {
        mirroring = false;
        await mirror;
    }

    const finished = await readGenerateJob(generateJobId);
    if (!finished || finished.state.status !== 'succeeded') {
        throw new Error(finished?.state.error || 'Generation failed');
    }

    // Validation stage: the output must exist and be non-empty.
    await update({ stage: 'validate', progress: 0.95, message: 'Validating output...' });
    const imagePath = finished.output?.imagePath;
    if (!imagePath) {
        throw new Error('validation: provider reported success without an output image');
    }
    const stats = await fs.stat(imagePath).catch(() => null);
    if (!stats || stats.size === 0) {
        throw new Error('validation: output image is missing or empty');
    }

    await update({ stage: 'notify', progress: 0.99, message: 'Publishing result...' });
    return { resultUrl: finished.output?.imageUrl };
};
