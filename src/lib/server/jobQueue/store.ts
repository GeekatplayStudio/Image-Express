/**
 * Durable persistence for the job queue.
 *
 * One JSON document (`data/queue/jobs.json`), written atomically via a
 * temp file + rename, following the same crash-safe idiom used by
 * `vault-store.ts` and `agentic-edit/jobs.ts`. Writes are serialized on
 * a promise chain so concurrent mutations never interleave on disk.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getDataDir } from '@/lib/server/appPaths';
import type { QueueJobRecord } from '@/lib/server/jobQueue/types';
import { isTerminalQueueStatus } from '@/lib/server/jobQueue/types';

const QUEUE_SCHEMA_VERSION = 1;
/** Terminal jobs older than this are pruned on load and on write. */
const TERMINAL_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_PERSISTED_JOBS = 500;

interface QueueDocument {
    schemaVersion: number;
    jobs: QueueJobRecord[];
}

const resolveQueueDir = () => path.join(getDataDir(), 'queue');

const isQueueJobRecord = (value: unknown): value is QueueJobRecord => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<QueueJobRecord>;
    return typeof record.id === 'string'
        && typeof record.kind === 'string'
        && typeof record.status === 'string'
        && typeof record.createdAt === 'string';
};

export class QueueStore {
    private jobs = new Map<string, QueueJobRecord>();
    private writeChain: Promise<void> = Promise.resolve();
    private loaded = false;
    /**
     * Resolved once at construction. Resolving per-write would let a
     * mid-lifetime `IMAGE_EXPRESS_DATA_DIR` change split one store's state
     * across two directories — and would make async writes land wherever the
     * env var happened to point when they flushed.
     */
    private readonly dir: string;
    private readonly filePath: string;

    constructor(dir = resolveQueueDir()) {
        this.dir = dir;
        this.filePath = path.join(dir, 'jobs.json');
    }

    async load(): Promise<void> {
        if (this.loaded) return;
        this.loaded = true;
        try {
            const raw = await fs.readFile(this.filePath, 'utf-8');
            const parsed = JSON.parse(raw) as Partial<QueueDocument>;
            const now = Date.now();
            for (const entry of Array.isArray(parsed.jobs) ? parsed.jobs : []) {
                if (!isQueueJobRecord(entry)) continue;
                if (isTerminalQueueStatus(entry.status)
                    && now - Date.parse(entry.updatedAt || entry.createdAt) > TERMINAL_JOB_RETENTION_MS) {
                    continue;
                }
                this.jobs.set(entry.id, entry);
            }
        } catch {
            // Missing or corrupt file: start empty. The atomic writer below
            // guarantees we never see a partially-written document.
        }
    }

    get(id: string): QueueJobRecord | undefined {
        return this.jobs.get(id);
    }

    list(): QueueJobRecord[] {
        return Array.from(this.jobs.values())
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    }

    upsert(job: QueueJobRecord): void {
        this.jobs.set(job.id, job);
        this.schedulePersist();
    }

    remove(id: string): void {
        if (this.jobs.delete(id)) {
            this.schedulePersist();
        }
    }

    /** Serialized, atomic write. Returns after this mutation is on disk. */
    flush(): Promise<void> {
        return this.writeChain;
    }

    private schedulePersist(): void {
        const snapshot = this.buildDocument();
        this.writeChain = this.writeChain
            .then(() => this.writeDocument(snapshot))
            .catch((error) => {
                console.error('[jobQueue] failed to persist queue state', error);
            });
    }

    private buildDocument(): QueueDocument {
        const now = Date.now();
        const jobs = this.list()
            .filter((job) => !(isTerminalQueueStatus(job.status)
                && now - Date.parse(job.updatedAt || job.createdAt) > TERMINAL_JOB_RETENTION_MS))
            .slice(-MAX_PERSISTED_JOBS);
        return { schemaVersion: QUEUE_SCHEMA_VERSION, jobs };
    }

    private async writeDocument(document: QueueDocument): Promise<void> {
        await fs.mkdir(this.dir, { recursive: true });
        const target = this.filePath;
        const temp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
        await fs.writeFile(temp, JSON.stringify(document, null, 2), 'utf-8');
        await fs.rename(temp, target);
    }
}
