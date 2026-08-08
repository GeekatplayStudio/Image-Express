'use client';

import { useCallback, useState } from 'react';
import { DatabaseZap, Loader2, Square } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { useQueueStream } from '@/hooks/useQueueStream';
import type { QueueJobRecord } from '@/lib/server/jobQueue/types';
import {
    VAULT_EMBED_JOB_KIND,
    VAULT_THUMBS_JOB_KIND,
} from '@/features/asset-vault/contracts/vaultIndexJobs';

type VaultIndexingBarProps = {
    isOpen: boolean;
};

const INDEX_KINDS = new Set<string>([VAULT_EMBED_JOB_KIND, VAULT_THUMBS_JOB_KIND]);

/**
 * The skinny indexing strip at the bottom of the vault.
 *
 * One line: what the indexer is doing right now, how far through it is, and a
 * stop control — or, when nothing is running, the button that starts it. Fed
 * by the queue's SSE stream, so the text is the job's own progress message,
 * not a client-side guess.
 */
export default function VaultIndexingBar({ isOpen }: VaultIndexingBarProps) {
    const { t } = useI18n();
    const [jobs, setJobs] = useState<Map<string, QueueJobRecord>>(new Map());
    const [starting, setStarting] = useState(false);

    const applyJobs = useCallback((incoming: QueueJobRecord[], reset: boolean) => {
        setJobs((previous) => {
            const next = reset ? new Map<string, QueueJobRecord>() : new Map(previous);
            for (const job of incoming) {
                if (INDEX_KINDS.has(job.kind)) next.set(job.id, job);
            }
            return next;
        });
    }, []);

    useQueueStream(isOpen, {
        onSnapshot: (all) => applyJobs(all, true),
        onJob: (job) => applyJobs([job], false),
    });

    const active = [...jobs.values()]
        .filter((job) => job.status === 'queued' || job.status === 'running')
        // Show the running one over the queued continuation pass.
        .sort((a, b) => (a.status === 'running' ? -1 : 1) - (b.status === 'running' ? -1 : 1));
    const current = active[0] ?? null;

    const startIndexing = useCallback(async () => {
        setStarting(true);
        try {
            await fetch('/api/assets/vault/index', { method: 'POST' });
            // The SSE stream delivers the new jobs; nothing to store here.
        } catch {
            // The next click retries; the queue itself never double-runs.
        } finally {
            setStarting(false);
        }
    }, []);

    const stopIndexing = useCallback(async () => {
        // Stop every pass in flight, including the queued continuation —
        // stopping only the running one would let the chain continue.
        await Promise.all(active.map((job) => (
            fetch(`/api/queue/${job.id}/cancel`, { method: 'POST' }).catch(() => {})
        )));
    }, [active]);

    return (
        <div className="h-5 px-2 border-t border-border/60 bg-secondary/20 text-[9px] text-muted-foreground flex items-center gap-2 shrink-0">
            {current ? (
                <>
                    <Loader2 size={9} className="animate-spin text-primary shrink-0" />
                    <span className="truncate flex-1" title={current.message || current.label}>
                        {current.message || current.label}
                    </span>
                    <div
                        className="w-24 h-1 rounded-full bg-border/60 overflow-hidden shrink-0"
                        role="progressbar"
                        aria-valuenow={Math.round(current.progress * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={t('vault.indexing')}
                    >
                        <div
                            className="h-full bg-primary/70 transition-all"
                            style={{ width: `${Math.round(current.progress * 100)}%` }}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => { void stopIndexing(); }}
                        className="inline-flex items-center gap-1 px-1.5 h-4 rounded border border-border hover:bg-secondary text-foreground shrink-0"
                        title={t('vault.indexingStop')}
                    >
                        <Square size={7} />
                        {t('vault.indexingStop')}
                    </button>
                </>
            ) : (
                <>
                    <span className="truncate flex-1">{t('vault.indexingIdle')}</span>
                    <button
                        type="button"
                        onClick={() => { void startIndexing(); }}
                        disabled={starting}
                        className="inline-flex items-center gap-1 px-1.5 h-4 rounded border border-border hover:bg-secondary text-foreground disabled:opacity-50 shrink-0"
                        title={t('vault.indexingStart')}
                    >
                        {starting
                            ? <Loader2 size={7} className="animate-spin" />
                            : <DatabaseZap size={7} />}
                        {t('vault.indexingStart')}
                    </button>
                </>
            )}
        </div>
    );
}
