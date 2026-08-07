'use client';

/**
 * Pipeline activity rail — a very thin strip docked just below the top
 * toolbar showing where every in-flight request currently is:
 * Request -> API -> Queue -> Worker -> AI -> Validate -> Store -> Notify -> Retrieve.
 *
 * Sources:
 * - the unified server queue via one SSE connection (generate jobs), and
 * - the editor's provider-side background jobs (Meshy/Tripo/Hitems/
 *   Stability) via their localStorage store.
 *
 * Behavior is preference-driven (`pipelineRailMode`): 'off' renders
 * nothing, 'minimal' shows the rail and expands on hover, 'detailed'
 * keeps the detail card open while anything is active. Terminal jobs
 * raise a toast (`notifyOnJobComplete`), which the legacy footer never
 * did. Honors `prefers-reduced-motion`.
 *
 * All job state is ingested inside external-event callbacks (SSE,
 * storage events); render stays pure.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, HardDrive, CheckCircle2, XCircle, Loader2, RotateCcw, Ban } from 'lucide-react';

import type { BackgroundJob } from '@/types';
import {
    BACKGROUND_JOBS_CHANGED_EVENT,
    BACKGROUND_JOBS_STORAGE_KEY,
} from '@/components/Editor/useBackgroundJobsStore';
import { QUEUE_STAGES, type QueueJobRecord, type QueueStage } from '@/lib/server/jobQueue/types';
import { useQueueStream } from '@/hooks/useQueueStream';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/providers/I18nProvider';
import {
    loadUiPreferences,
    UI_PREFERENCES_CHANGED_EVENT,
    type PipelineRailMode,
} from '@/lib/ui-preferences';

interface RailJob {
    id: string;
    label: string;
    stage: QueueStage;
    status: 'active' | 'succeeded' | 'failed';
    external: boolean;
    progress?: number;
    createdAt: number;
    /** Stamped at ingestion when the job reaches a terminal state. */
    finishedAt?: number;
    /** Server-queue jobs support cancel/retry through the queue API. */
    controllable?: boolean;
    /** Raw queue status, present only for server-queue jobs. */
    queueStatus?: QueueJobRecord['status'];
    error?: string;
}

const ACTIVE_LOCAL_STATUSES = new Set(['pending', 'processing', 'IN_PROGRESS', 'PENDING']);
const SUCCESS_LOCAL_STATUSES = new Set(['completed', 'COMPLETED', 'SUCCEEDED']);
/** Keep a succeeded job visible on the rail briefly before it fades. */
const TERMINAL_LINGER_MS = 6000;
/** Failures linger longer so the retry action stays reachable. */
const FAILED_LINGER_MS = 60_000;

const localJobStage = (job: BackgroundJob): QueueStage => (
    job.status === 'PENDING' || job.status === 'pending' ? 'queue' : 'ai'
);

const toRailJob = (job: BackgroundJob): RailJob | null => {
    const isActive = ACTIVE_LOCAL_STATUSES.has(job.status);
    const isSuccess = SUCCESS_LOCAL_STATUSES.has(job.status);
    const isFailure = job.status === 'failed' || job.status === 'FAILED';
    if (!isActive && !isSuccess && !isFailure) return null;
    return {
        id: job.id,
        label: job.prompt || `${job.provider ?? 'job'} ${job.type}`,
        stage: isActive ? localJobStage(job) : 'retrieve',
        status: isActive ? 'active' : (isSuccess ? 'succeeded' : 'failed'),
        external: true,
        progress: typeof job.progress === 'number' ? job.progress / 100 : undefined,
        createdAt: job.createdAt,
    };
};

const serverToRailJob = (job: QueueJobRecord): RailJob => ({
    id: job.id,
    label: job.label,
    stage: job.stage,
    status: job.status === 'queued' || job.status === 'running'
        ? 'active'
        : (job.status === 'succeeded' ? 'succeeded' : 'failed'),
    external: job.external,
    progress: job.progress,
    createdAt: Date.parse(job.createdAt),
    controllable: true,
    queueStatus: job.status,
    error: job.error,
});

const readLocalJobs = (): BackgroundJob[] => {
    try {
        const raw = window.localStorage.getItem(BACKGROUND_JOBS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed as BackgroundJob[] : [];
    } catch {
        return [];
    }
};

export default function PipelineRail() {
    const { t } = useI18n();
    const { toast } = useToast();

    const [mode, setMode] = useState<PipelineRailMode>('minimal');
    const [jobs, setJobs] = useState<ReadonlyMap<string, RailJob>>(new Map());
    const [hovered, setHovered] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [reducedMotion, setReducedMotion] = useState(false);
    const [pendingAction, setPendingAction] = useState<{ jobId: string; action: 'cancel' | 'retry' } | null>(null);

    const notifyRef = useRef(true);
    const statusesRef = useRef(new Map<string, RailJob['status']>());
    const finishedAtRef = useRef(new Map<string, number>());
    const toastRef = useRef(toast);
    const tRef = useRef(t);
    useEffect(() => {
        toastRef.current = toast;
        tRef.current = t;
    }, [toast, t]);

    /**
     * Merge freshly-mapped jobs into state; called only from external-event
     * callbacks. `silent` suppresses toasts (initial snapshots), and jobs
     * that arrive already-terminal never linger or announce. Side effects
     * (toasts, ref bookkeeping) happen here, outside the state updater,
     * which stays pure.
     */
    const ingest = useCallback((mapped: RailJob[], options?: { silent?: boolean }) => {
        if (mapped.length === 0) return;
        const silent = options?.silent === true;
        const stamped: RailJob[] = [];
        for (const job of mapped) {
            const previousStatus = statusesRef.current.get(job.id);
            statusesRef.current.set(job.id, job.status);
            let finishedAt = finishedAtRef.current.get(job.id);
            if (job.status !== 'active' && finishedAt === undefined) {
                const observedTransition = previousStatus === 'active';
                finishedAt = observedTransition ? Date.now() : 0;
                finishedAtRef.current.set(job.id, finishedAt);
                if (observedTransition && !silent && notifyRef.current) {
                    toastRef.current({
                        title: job.status === 'succeeded'
                            ? tRef.current('queue.rail.toastDone')
                            : tRef.current('queue.rail.toastFailed'),
                        description: job.label,
                        variant: job.status === 'succeeded' ? 'success' : 'destructive',
                    });
                }
            }
            stamped.push({ ...job, finishedAt });
        }
        setJobs((prev) => {
            const next = new Map(prev);
            for (const job of stamped) next.set(job.id, job);
            return next;
        });
    }, []);

    // Preferences (live via the preferences-changed event).
    useEffect(() => {
        const sync = () => {
            const prefs = loadUiPreferences();
            setMode(prefs.pipelineRailMode);
            notifyRef.current = prefs.notifyOnJobComplete;
        };
        sync();
        window.addEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
        return () => window.removeEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
    }, []);

    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const sync = () => setReducedMotion(media.matches);
        sync();
        media.addEventListener('change', sync);
        return () => media.removeEventListener('change', sync);
    }, []);

    // Editor background jobs (same-tab custom event + cross-tab storage event).
    useEffect(() => {
        if (mode === 'off') return;
        const mapLocal = () => readLocalJobs()
            .map(toRailJob)
            .filter((job): job is RailJob => job !== null);
        const sync = () => ingest(mapLocal());
        // Initial hydrate happens asynchronously (silent: no toasts for
        // jobs that were already terminal before this mount).
        const hydrate = window.setTimeout(() => ingest(mapLocal(), { silent: true }), 0);
        window.addEventListener(BACKGROUND_JOBS_CHANGED_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.clearTimeout(hydrate);
            window.removeEventListener(BACKGROUND_JOBS_CHANGED_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, [mode, ingest]);

    // Server queue jobs over SSE.
    useQueueStream(mode !== 'off', {
        onSnapshot: (snapshot) => ingest(snapshot.map(serverToRailJob), { silent: true }),
        onJob: (job) => ingest([serverToRailJob(job)]),
    });

    /**
     * Cancel/retry a server-queue job. The SSE stream delivers the resulting
     * transition, so there is no optimistic local mutation to reconcile.
     */
    const runJobAction = useCallback(async (jobId: string, action: 'cancel' | 'retry') => {
        setPendingAction({ jobId, action });
        try {
            const response = await fetch(`/api/queue/${encodeURIComponent(jobId)}/${action}`, { method: 'POST' });
            if (!response.ok) {
                const payload = await response.json().catch(() => null) as { message?: string } | null;
                toastRef.current({
                    title: tRef.current(action === 'cancel' ? 'queue.rail.cancelFailed' : 'queue.rail.retryFailed'),
                    description: payload?.message,
                    variant: 'destructive',
                });
            } else if (action === 'retry') {
                // A retried job becomes active again; clear its terminal stamp
                // so it does not linger-expire while it runs.
                statusesRef.current.set(jobId, 'active');
                finishedAtRef.current.delete(jobId);
            }
        } catch {
            toastRef.current({
                title: tRef.current(action === 'cancel' ? 'queue.rail.cancelFailed' : 'queue.rail.retryFailed'),
                variant: 'destructive',
            });
        } finally {
            setPendingAction((current) => (
                current?.jobId === jobId && current.action === action ? null : current
            ));
        }
    }, []);

    const visibleJobs = useMemo(() => (
        Array.from(jobs.values())
            .filter((job) => {
                if (job.status === 'active') return true;
                if (typeof job.finishedAt !== 'number' || job.finishedAt === 0) return false;
                const linger = job.status === 'failed' ? FAILED_LINGER_MS : TERMINAL_LINGER_MS;
                return now - job.finishedAt < linger;
            })
            .sort((a, b) => b.createdAt - a.createdAt)
    ), [jobs, now]);

    const activeJobs = useMemo(
        () => visibleJobs.filter((job) => job.status === 'active'),
        [visibleJobs],
    );

    // Tick while anything is visible (drives linger expiry + elapsed times).
    useEffect(() => {
        if (visibleJobs.length === 0) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [visibleJobs.length]);

    const stageName = useCallback((stage: QueueStage) => t(`queue.stage.${stage}`), [t]);

    if (mode === 'off' || visibleJobs.length === 0) {
        return null;
    }

    const activeStages = new Set(activeJobs.map((job) => job.stage));
    const furthestActiveIndex = activeJobs.length > 0
        ? Math.max(...activeJobs.map((job) => QUEUE_STAGES.indexOf(job.stage)))
        : QUEUE_STAGES.length - 1;
    const expanded = hovered || (mode === 'detailed' && activeJobs.length > 0);

    return (
        <div
            className="fixed inset-x-0 top-16 z-[110] pointer-events-none"
            data-testid="pipeline-rail"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* The rail: one segment per pipeline stage, 3px tall. */}
            <div className="pointer-events-auto flex h-[3px] w-full gap-px bg-background/60">
                {QUEUE_STAGES.map((stage, index) => {
                    const isCurrent = activeStages.has(stage);
                    const isPassed = index < furthestActiveIndex || activeJobs.length === 0;
                    return (
                        <div
                            key={stage}
                            className={`h-full flex-1 transition-colors duration-500 ${
                                isCurrent
                                    ? `bg-primary ${reducedMotion ? '' : 'animate-pulse'}`
                                    : isPassed
                                        ? 'bg-primary/45'
                                        : 'bg-border/60'
                            }`}
                            title={stageName(stage)}
                        />
                    );
                })}
            </div>

            {/* Collapsed hint pip. */}
            {!expanded && (
                <div className="pointer-events-auto absolute right-3 top-[5px] rounded-b-md border border-t-0 border-border/60 bg-card/95 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                    {t('queue.rail.activeCount', { count: activeJobs.length })}
                </div>
            )}

            {/* Drop-down detail card. */}
            {expanded && (
                <div className="pointer-events-auto mx-auto mt-0 w-[min(96vw,44rem)] rounded-b-xl border border-t-0 border-border/70 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-md">
                    <div className="mb-1 flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('queue.rail.title')}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            {t('queue.rail.activeCount', { count: activeJobs.length })}
                        </p>
                    </div>
                    <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                        {visibleJobs.slice(0, 8).map((job) => {
                            const elapsedSeconds = Math.max(0, Math.round((now - job.createdAt) / 1000));
                            return (
                                <li key={job.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs">
                                    {job.status === 'active' ? (
                                        <Loader2 size={13} className={`shrink-0 text-primary ${reducedMotion ? '' : 'animate-spin'}`} />
                                    ) : job.status === 'succeeded' ? (
                                        <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                                    ) : (
                                        <XCircle size={13} className="shrink-0 text-destructive" />
                                    )}
                                    <span
                                        className="min-w-0 flex-1 truncate text-foreground"
                                        title={job.error || job.label}
                                    >
                                        {job.label}
                                        {job.error && (
                                            <span className="ml-1.5 text-destructive/80">— {job.error}</span>
                                        )}
                                    </span>
                                    <span
                                        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] ${
                                            job.external
                                                ? 'border-sky-500/40 text-sky-500'
                                                : 'border-emerald-500/40 text-emerald-500'
                                        }`}
                                    >
                                        {job.external ? <Cloud size={10} /> : <HardDrive size={10} />}
                                        {job.external ? t('queue.rail.external') : t('queue.rail.internal')}
                                    </span>
                                    <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
                                        {stageName(job.stage)}
                                    </span>
                                    <span className="w-10 shrink-0 text-right tabular-nums text-[10px] text-muted-foreground">
                                        {typeof job.progress === 'number'
                                            ? `${Math.round(Math.min(1, Math.max(0, job.progress)) * 100)}%`
                                            : `${elapsedSeconds}s`}
                                    </span>

                                    {job.controllable && (job.queueStatus === 'queued' || job.status === 'failed') && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void runJobAction(
                                                    job.id,
                                                    job.queueStatus === 'queued' ? 'cancel' : 'retry',
                                                );
                                            }}
                                            disabled={pendingAction?.jobId === job.id}
                                            aria-label={t(
                                                job.queueStatus === 'queued' ? 'queue.rail.cancelAria' : 'queue.rail.retryAria',
                                                { label: job.label },
                                            )}
                                            title={t(job.queueStatus === 'queued' ? 'queue.rail.cancel' : 'queue.rail.retry')}
                                            className="shrink-0 rounded border border-border/60 bg-background p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                                        >
                                            {pendingAction?.jobId === job.id ? (
                                                <Loader2 size={11} className={reducedMotion ? '' : 'animate-spin'} />
                                            ) : job.queueStatus === 'queued' ? (
                                                <Ban size={11} />
                                            ) : (
                                                <RotateCcw size={11} />
                                            )}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
