/**
 * Queue entry point: returns the singleton scheduler with all job
 * handlers registered. API routes should import from here, never from
 * `scheduler.ts` directly, so handler registration is never skipped.
 */

import { getJobScheduler, type JobScheduler } from '@/lib/server/jobQueue/scheduler';
import { runGenerateJob } from '@/lib/server/jobQueue/handlers/generate';
import { runRemotePollJob } from '@/lib/server/jobQueue/handlers/remotePoll';
import { runVaultEmbedJob } from '@/lib/server/jobQueue/handlers/vaultEmbed';
import type { QueueLane } from '@/lib/server/jobQueue/types';

export type { QueueJobRecord, QueueEvent, QueueStage } from '@/lib/server/jobQueue/types';
export { QUEUE_STAGES, isTerminalQueueStatus } from '@/lib/server/jobQueue/types';

/** Providers whose heavy work runs on an external API. */
const EXTERNAL_GENERATE_PROVIDERS = new Set(['nanobanana']);
/** Providers that occupy the local GPU (ComfyUI-backed) and must serialize. */
const LOCAL_GPU_GENERATE_PROVIDERS = new Set(['flux']);

export const isExternalGenerateProvider = (providerName: string): boolean => (
    EXTERNAL_GENERATE_PROVIDERS.has(providerName.toLowerCase())
);

export const laneForGenerateProvider = (providerName: string): QueueLane => {
    const normalized = providerName.toLowerCase();
    if (LOCAL_GPU_GENERATE_PROVIDERS.has(normalized)) return 'local-gpu';
    if (EXTERNAL_GENERATE_PROVIDERS.has(normalized)) return `remote:${normalized}`;
    return 'local-cpu';
};

export const getQueue = (): JobScheduler => {
    const scheduler = getJobScheduler();
    scheduler.registerHandler('generate', runGenerateJob);
    scheduler.registerHandler('remote-poll', runRemotePollJob);
    scheduler.registerHandler('vault-embed', runVaultEmbedJob);
    return scheduler;
};
