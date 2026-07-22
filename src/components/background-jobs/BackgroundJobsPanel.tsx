'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/providers/I18nProvider';

import type { BackgroundJob } from '@/types';

import BackgroundJobRow from '@/components/background-jobs/BackgroundJobRow';
import {
    filterJobs,
    getJobCounts,
    getProviderOptions,
    getTypeOptions,
    isFinishedJob,
    type BackgroundJobProviderFilter,
    type BackgroundJobStatusFilter,
    type BackgroundJobTypeFilter,
} from '@/components/background-jobs/backgroundJobUtils';

export type BackgroundJobsPanelActionState = {
    jobId: string;
    type: 'retry' | 'cancel';
} | null;

interface BackgroundJobsPanelProps {
    jobs: BackgroundJob[];
    onClear: (jobId: string) => void;
    onOpenResult?: (job: BackgroundJob) => void;
    onRetry?: (job: BackgroundJob) => void | Promise<void>;
    onCancel?: (job: BackgroundJob) => void | Promise<void>;
    onClose: () => void;
    activeAction?: BackgroundJobsPanelActionState;
}

export default function BackgroundJobsPanel({
    jobs,
    onClear,
    onOpenResult,
    onRetry,
    onCancel,
    onClose,
    activeAction = null,
}: BackgroundJobsPanelProps) {
    const { t } = useI18n();
    const [statusFilter, setStatusFilter] = useState<BackgroundJobStatusFilter>('all');
    const [providerFilter, setProviderFilter] = useState<BackgroundJobProviderFilter>('all');
    const [typeFilter, setTypeFilter] = useState<BackgroundJobTypeFilter>('all');

    const jobCounts = useMemo(() => getJobCounts(jobs), [jobs]);
    const providerOptions = useMemo(() => getProviderOptions(jobs, providerFilter), [jobs, providerFilter]);
    const typeOptions = useMemo(() => getTypeOptions(jobs, typeFilter), [jobs, typeFilter]);
    const filteredJobs = useMemo(() => filterJobs(jobs, {
        status: statusFilter,
        provider: providerFilter,
        type: typeFilter,
    }), [jobs, providerFilter, statusFilter, typeFilter]);

    const hasScopedFilters = providerFilter !== 'all' || typeFilter !== 'all';

    const handleClearFinished = () => {
        jobs.filter(isFinishedJob).forEach((job) => onClear(job.id));
    };

    return (
        <div className="pointer-events-auto w-full rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{t('jobs.title')}</p>
                    <p className="text-[11px] text-muted-foreground">
                        {t('jobs.summary', { active: jobCounts.active, failed: jobCounts.failed, finished: jobCounts.finished })}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {jobCounts.finished > 0 && (
                        <button
                            type="button"
                            onClick={handleClearFinished}
                            className="rounded border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label={t('jobs.clearFinishedAria')}
                        >
                            {t('jobs.clearFinished')}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={t('jobs.hideAria')}
                    >
                        {t('jobs.hide')}
                    </button>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {([
                    ['all', t('jobs.filter.all')],
                    ['active', t('jobs.filter.active')],
                    ['failed', t('jobs.filter.failed')],
                    ['finished', t('jobs.filter.finished')],
                ] as Array<[BackgroundJobStatusFilter, string]>).map(([filter, label]) => {
                    const count = jobCounts[filter];
                    const selected = statusFilter === filter;

                    return (
                        <button
                            key={filter}
                            type="button"
                            onClick={() => setStatusFilter(filter)}
                            aria-pressed={selected}
                            aria-label={t('jobs.filterChipAria', { label })}
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${selected
                                ? 'border-primary/40 bg-primary/10 text-foreground'
                                : 'border-border/60 bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
                            }`}
                        >
                            {label} ({count})
                        </button>
                    );
                })}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex min-w-36 flex-1 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {t('jobs.provider')}
                    <select
                        value={providerFilter}
                        onChange={(event) => setProviderFilter(event.target.value)}
                        aria-label={t('jobs.filterByProvider')}
                        className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs font-medium text-foreground outline-none transition-colors focus:border-primary/50"
                    >
                        <option value="all">{t('jobs.allProviders', { count: jobCounts.all })}</option>
                        {providerOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label || t('jobs.unspecifiedProvider')} ({option.count})
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex min-w-36 flex-1 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {t('jobs.type')}
                    <select
                        value={typeFilter}
                        onChange={(event) => setTypeFilter(event.target.value as BackgroundJobTypeFilter)}
                        aria-label={t('jobs.filterByType')}
                        className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs font-medium text-foreground outline-none transition-colors focus:border-primary/50"
                    >
                        <option value="all">{t('jobs.allTypes', { count: jobCounts.all })}</option>
                        {typeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.labelKey ? t(option.labelKey) : option.label} ({option.count})
                            </option>
                        ))}
                    </select>
                </label>

                {hasScopedFilters && (
                    <button
                        type="button"
                        onClick={() => {
                            setProviderFilter('all');
                            setTypeFilter('all');
                        }}
                        className="shrink-0 rounded border border-border/60 bg-background px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={t('jobs.resetFiltersAria')}
                    >
                        {t('jobs.resetFilters')}
                    </button>
                )}
            </div>

            <div className="mt-3 max-h-[min(60vh,26rem)] space-y-2 overflow-y-auto pr-1">
                {filteredJobs.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border/60 bg-background/60 px-3 py-3 text-xs text-muted-foreground">
                        {t('jobs.noneMatch')}
                    </p>
                ) : (
                    filteredJobs.map((job) => (
                        <BackgroundJobRow
                            key={job.id}
                            job={job}
                            onClear={onClear}
                            onOpenResult={onOpenResult}
                            onRetry={onRetry}
                            onCancel={onCancel}
                            pendingAction={activeAction?.jobId === job.id ? activeAction.type : null}
                        />
                    ))
                )}
            </div>
        </div>
    );
}