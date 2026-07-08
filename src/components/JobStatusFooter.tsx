'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronUp } from 'lucide-react';

import { BackgroundJob } from '@/types';

import BackgroundJobsPanel, { type BackgroundJobsPanelActionState } from '@/components/background-jobs/BackgroundJobsPanel';
import { getJobCounts, getJobResultUrl } from '@/components/background-jobs/backgroundJobUtils';

interface JobStatusFooterProps {
    jobs: BackgroundJob[];
    onClear: (jobId: string) => void;
    onOpenResult?: (job: BackgroundJob) => void;
    onRetry?: (job: BackgroundJob) => void | Promise<void>;
    onCancel?: (job: BackgroundJob) => void | Promise<void>;
}
export default function JobStatusFooter({
    jobs,
    onClear,
    onOpenResult,
    onRetry,
    onCancel,
}: JobStatusFooterProps) {
    const [isOpen, setIsOpen] = useState(true);
    const [activeAction, setActiveAction] = useState<BackgroundJobsPanelActionState>(null);

    const jobCounts = useMemo(() => getJobCounts(jobs), [jobs]);

    const handleOpenJobResult = useCallback((job: BackgroundJob) => {
        const targetUrl = getJobResultUrl(job);
        if (!targetUrl) {
            return;
        }

        if (onOpenResult) {
            onOpenResult(job);
            return;
        }

        if (typeof window !== 'undefined') {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
    }, [onOpenResult]);

    const runAsyncAction = useCallback(async (
        job: BackgroundJob,
        type: NonNullable<BackgroundJobsPanelActionState>['type'],
        handler?: (selectedJob: BackgroundJob) => void | Promise<void>,
    ) => {
        if (!handler) {
            return;
        }

        setActiveAction({ jobId: job.id, type });
        try {
            await handler(job);
        } finally {
            setActiveAction((current) => (
                current?.jobId === job.id && current.type === type ? null : current
            ));
        }
    }, []);

    if (jobs.length === 0) {
        return null;
    }

    return (
        <div className="absolute bottom-24 left-1/2 z-50 flex w-[min(94vw,36rem)] -translate-x-1/2 flex-col gap-2 pointer-events-none">
            {!isOpen && (
                <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-full border border-border bg-card/95 px-4 py-2 shadow-lg backdrop-blur-sm">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Background Jobs</p>
                        <p className="text-[11px] text-muted-foreground">
                            {jobCounts.active} active, {jobCounts.failed} failed, {jobCounts.finished} finished
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsOpen(true)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Show background jobs panel"
                    >
                        Show
                        <ChevronUp size={12} />
                    </button>
                </div>
            )}

            {isOpen && (
                <BackgroundJobsPanel
                    jobs={jobs}
                    onClear={onClear}
                    onOpenResult={handleOpenJobResult}
                    onRetry={onRetry ? (job) => runAsyncAction(job, 'retry', onRetry) : undefined}
                    onCancel={onCancel ? (job) => runAsyncAction(job, 'cancel', onCancel) : undefined}
                    onClose={() => setIsOpen(false)}
                    activeAction={activeAction}
                />
            )}
        </div>
    );
}
