'use client';

/**
 * Activity panel — every job the server queue knows about, with its history.
 *
 * The pipeline rail shows what is in flight and forgets a job seconds after it
 * ends. This is the durable view: what ran, what failed and why, what is
 * waiting and in which order — with the controls to cancel, retry, move a
 * waiting job to the front, and clear the history.
 *
 * Opened from the Window menu or the rail by a window event, so neither has to
 * own its state. All job state arrives through the queue stream.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpToLine, Ban, CheckCircle2, Clock3, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react';

import ModalShell from '@/components/ui/ModalShell';
import { useQueueStream } from '@/hooks/useQueueStream';
import { useI18n } from '@/providers/I18nProvider';
import { useToast } from '@/providers/ToastProvider';
import type { QueueJobRecord } from '@/lib/server/jobQueue/types';
import {
    OPEN_ACTIVITY_PANEL_EVENT,
    activityJobActions,
    activityJobSeconds,
    countActivityJobs,
    filterActivityJobs,
    formatActivityDuration,
    sortActivityJobs,
    upsertActivityJob,
    type ActivityFilter,
} from '@/lib/activityJobs';

const FILTERS: ActivityFilter[] = ['all', 'active', 'failed', 'done'];

type JobAction = 'cancel' | 'retry' | 'prioritize';

export default function ActivityPanel() {
    const { t } = useI18n();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [jobs, setJobs] = useState<QueueJobRecord[]>([]);
    const [filter, setFilter] = useState<ActivityFilter>('all');
    const [pending, setPending] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const open = () => setIsOpen(true);
        window.addEventListener(OPEN_ACTIVITY_PANEL_EVENT, open);
        return () => window.removeEventListener(OPEN_ACTIVITY_PANEL_EVENT, open);
    }, []);

    // Subscribed only while open: the rail already holds a connection for the
    // live strip, and a closed panel has nothing to show.
    useQueueStream(isOpen, {
        onSnapshot: (snapshot) => setJobs(snapshot),
        onJob: (job) => setJobs((current) => upsertActivityJob(current, job)),
    });

    const counts = useMemo(() => countActivityJobs(jobs), [jobs]);
    const visible = useMemo(() => filterActivityJobs(sortActivityJobs(jobs), filter), [jobs, filter]);
    const hasActive = counts.running + counts.queued > 0;

    // Elapsed times only move while something is running.
    useEffect(() => {
        if (!isOpen || !hasActive) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [isOpen, hasActive]);

    const call = useCallback(async (key: string, url: string, method: 'POST' | 'DELETE') => {
        setPending(key);
        try {
            const response = await fetch(url, { method });
            if (!response.ok) {
                const payload = await response.json().catch(() => null) as { message?: string } | null;
                toast({ title: t('activity.actionFailed'), description: payload?.message, variant: 'destructive' });
            }
        } catch {
            toast({ title: t('activity.actionFailed'), variant: 'destructive' });
        } finally {
            setPending((current) => (current === key ? null : current));
        }
    }, [t, toast]);

    const runAction = (job: QueueJobRecord, action: JobAction) => (
        call(`${job.id}:${action}`, `/api/queue/${encodeURIComponent(job.id)}/${action}`, 'POST')
    );

    const statusIcon = (job: QueueJobRecord) => {
        if (job.status === 'running') return <Loader2 size={14} className="shrink-0 animate-spin text-primary motion-reduce:animate-none" />;
        if (job.status === 'queued') return <Clock3 size={14} className="shrink-0 text-muted-foreground" />;
        if (job.status === 'succeeded') return <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />;
        return <XCircle size={14} className="shrink-0 text-destructive" />;
    };

    const actionButton = (job: QueueJobRecord, action: JobAction, label: string, icon: React.ReactNode) => (
        <button
            type="button"
            onClick={() => { void runAction(job, action); }}
            disabled={pending === `${job.id}:${action}`}
            title={label}
            aria-label={`${label}: ${job.label}`}
            className="shrink-0 rounded border border-border/60 bg-background p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
            {icon}
        </button>
    );

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            title={t('activity.title')}
            icon={<Activity size={15} />}
            initialWidth={720}
            initialHeight={520}
            zIndex={160}
        >
            <div className="flex h-full flex-col" data-testid="activity-panel">
                <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
                    <div className="flex gap-1" role="tablist">
                        {FILTERS.map((entry) => (
                            <button
                                key={entry}
                                type="button"
                                role="tab"
                                aria-selected={filter === entry}
                                onClick={() => setFilter(entry)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                    filter === entry
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                }`}
                            >
                                {t(`activity.filter.${entry}`)}
                            </button>
                        ))}
                    </div>
                    <p className="ml-auto text-[11px] text-muted-foreground">
                        {t('activity.summary', { running: counts.running, queued: counts.queued })}
                    </p>
                    <button
                        type="button"
                        onClick={() => { void call('clear', '/api/queue', 'DELETE'); }}
                        disabled={pending === 'clear' || counts.done + counts.failed === 0}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                        <Trash2 size={12} />
                        {t('activity.clearFinished')}
                    </button>
                </div>

                {visible.length === 0 ? (
                    <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {t('activity.empty')}
                    </p>
                ) : (
                    <ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
                        {visible.map((job) => {
                            const actions = activityJobActions(job, jobs);
                            const detail = job.error || job.message;
                            return (
                                <li key={job.id} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                                    {statusIcon(job)}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-foreground" title={job.label}>{job.label}</p>
                                        <p className={`truncate text-[11px] ${job.error ? 'text-destructive/90' : 'text-muted-foreground'}`} title={detail}>
                                            {t(`activity.status.${job.status}`)}
                                            {job.status === 'running' && ` · ${t(`queue.stage.${job.stage}`)}`}
                                            {detail ? ` — ${detail}` : ''}
                                        </p>
                                    </div>
                                    <span className="w-14 shrink-0 text-right tabular-nums text-[11px] text-muted-foreground">
                                        {job.status === 'running' && job.progress > 0
                                            ? `${Math.round(Math.min(1, job.progress) * 100)}%`
                                            : formatActivityDuration(activityJobSeconds(job, now))}
                                    </span>
                                    <div className="flex w-[68px] shrink-0 justify-end gap-1">
                                        {actions.prioritize && actionButton(job, 'prioritize', t('activity.runNext'), <ArrowUpToLine size={12} />)}
                                        {actions.cancel && actionButton(job, 'cancel', t('queue.rail.cancel'), <Ban size={12} />)}
                                        {actions.retry && actionButton(job, 'retry', t('queue.rail.retry'), <RotateCcw size={12} />)}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </ModalShell>
    );
}
