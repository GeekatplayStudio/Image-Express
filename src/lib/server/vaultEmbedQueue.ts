import { getQueue } from '@/lib/server/jobQueue';

/**
 * Asks for the vault's semantic index to be built, without ever blocking the
 * caller.
 *
 * Search calls this on every query, so the important property is that it does
 * nothing when indexing is already under way. Without that guard a busy user
 * would enqueue a job per keystroke and the queue would fill with duplicates
 * all competing to embed the same assets.
 */

export const VAULT_EMBED_JOB_KIND = 'vault-embed';
export const VAULT_THUMBS_JOB_KIND = 'vault-thumbs';

/**
 * True while a vault-embed job is queued or running.
 *
 * Checked against the queue rather than a module flag: a flag would be lost on
 * restart and, worse, would still read "running" for a job that died with the
 * process.
 */
async function isKindInFlight(kind: string): Promise<boolean> {
    const jobs = await getQueue().listJobs();
    return jobs.some((job) => (
        job.kind === kind && (job.status === 'queued' || job.status === 'running')
    ));
}

/**
 * Prepare grid thumbnails ahead of time.
 *
 * Called when the vault opens. Generating on demand meant the first view of a
 * page decoded 96 images before it could draw anything; doing it in advance is
 * the difference between "opens instantly" and "hangs for ten seconds".
 */
export async function requestVaultThumbnails(): Promise<string | null> {
    if (await isKindInFlight(VAULT_THUMBS_JOB_KIND)) return null;

    const job = await getQueue().enqueue({
        kind: VAULT_THUMBS_JOB_KIND,
        lane: 'local-cpu',
        external: false,
        label: 'Preparing vault thumbnails',
        payload: {},
        // Below embedding, which is below interactive work: a thumbnail is a
        // nicety, a generation the user is waiting on is not.
        priority: -20,
    });
    return job.id;
}

/**
 * Enqueue an indexing pass if one is not already pending.
 *
 * Returns the job id, or null when indexing was already in flight — the normal
 * case once the first search has started it.
 */
export async function requestVaultEmbedding(pendingCount: number): Promise<string | null> {
    if (pendingCount <= 0) return null;
    if (await isKindInFlight(VAULT_EMBED_JOB_KIND)) return null;

    const job = await getQueue().enqueue({
        kind: VAULT_EMBED_JOB_KIND,
        // Embedding runs against a local model; it belongs with the other
        // local CPU work rather than holding the single GPU lane.
        lane: 'local-cpu',
        external: false,
        label: `Indexing ${pendingCount.toLocaleString()} assets for search`,
        payload: { pendingCount },
        // Below interactive work: a generation the user is waiting on should
        // never queue behind background indexing.
        priority: -10,
    });
    return job.id;
}
