'use client';

import { CheckCircle, Copy, ExternalLink, Loader2, RotateCw, XCircle } from 'lucide-react';

import type { BackgroundJob } from '@/types';

import {
    canRetryJob,
    getJobResultUrl,
    getJobStatusMessage,
    getJobTitle,
    getJobTypeLabel,
    getProviderLabel,
    isActiveJob,
    isCancelledJob,
    isFailedJob,
    isFinishedJob,
    isSucceededJob,
} from '@/components/background-jobs/backgroundJobUtils';

type PendingActionType = 'retry' | 'cancel' | null;

interface BackgroundJobRowProps {
    job: BackgroundJob;
    onClear: (jobId: string) => void;
    onOpenResult?: (job: BackgroundJob) => void;
    onRetry?: (job: BackgroundJob) => void | Promise<void>;
    onCancel?: (job: BackgroundJob) => void | Promise<void>;
    pendingAction?: PendingActionType;
}

export default function BackgroundJobRow({
    job,
    onClear,
    onOpenResult,
    onRetry,
    onCancel,
    pendingAction = null,
}: BackgroundJobRowProps) {
    const resultUrl = getJobResultUrl(job);
    const canOpenResult = Boolean(resultUrl && isSucceededJob(job) && onOpenResult);
    const canRetry = Boolean(onRetry && canRetryJob(job) && (isFailedJob(job) || isCancelledJob(job)));
    const canCancel = Boolean(onCancel && isActiveJob(job));
    const canClear = isFinishedJob(job);

    const copyJobId = async () => {
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(job.id);
            }
        } catch (error) {
            console.error('Failed to copy job id', error);
        }
    };

    return (
        <div className="rounded-lg border border-border/60 bg-card/95 p-3 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="shrink-0 pt-0.5">
                    {isSucceededJob(job) ? (
                        <CheckCircle size={20} className="text-green-500" />
                    ) : isFailedJob(job) ? (
                        <XCircle size={20} className="text-red-500" />
                    ) : isCancelledJob(job) ? (
                        <XCircle size={20} className="text-muted-foreground" />
                    ) : (
                        <div className="relative">
                            <Loader2 size={20} className="text-primary animate-spin" />
                            {typeof job.progress === 'number' && (
                                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">
                                    {job.progress}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                        {getJobTitle(job)}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {getProviderLabel(job.provider)} · {getJobTypeLabel(job.type)}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                        <p className="truncate font-mono text-[10px] text-muted-foreground" title={job.id}>
                            {job.id}
                        </p>
                        <button
                            type="button"
                            onClick={copyJobId}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            title="Copy Job ID"
                            aria-label={`Copy job id ${job.id}`}
                        >
                            <Copy size={11} />
                        </button>
                    </div>
                    <p
                        className={`mt-1 truncate text-xs ${isFailedJob(job) ? 'text-red-500' : isCancelledJob(job) ? 'text-muted-foreground' : 'text-muted-foreground'}`}
                        title={job.error || undefined}
                    >
                        {getJobStatusMessage(job)}
                    </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                    {canOpenResult && (
                        <button
                            type="button"
                            onClick={() => onOpenResult?.(job)}
                            className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label={`Open result for job ${job.id}`}
                        >
                            <ExternalLink size={11} />
                            Open
                        </button>
                    )}

                    {canRetry && (
                        <button
                            type="button"
                            onClick={() => void onRetry?.(job)}
                            className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label={`Retry job ${job.id}`}
                            disabled={pendingAction === 'retry'}
                        >
                            <RotateCw size={11} className={pendingAction === 'retry' ? 'animate-spin' : undefined} />
                            {pendingAction === 'retry' ? 'Retrying...' : 'Retry'}
                        </button>
                    )}

                    {canCancel && (
                        <button
                            type="button"
                            onClick={() => void onCancel?.(job)}
                            className="rounded border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label={`Stop tracking job ${job.id}`}
                            disabled={pendingAction === 'cancel'}
                        >
                            {pendingAction === 'cancel' ? 'Stopping...' : 'Stop'}
                        </button>
                    )}

                    {canClear && (
                        <button
                            type="button"
                            onClick={() => onClear(job.id)}
                            className="rounded border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label={`Clear job ${job.id}`}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}