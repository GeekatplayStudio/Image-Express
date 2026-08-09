import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { BackgroundJob } from '@/types';
import {
    cancelBackgroundJob,
    retryBackgroundJob,
    supportsRemoteBackgroundJobCancel,
} from '@/components/Editor/backgroundJobRequests';
import { getJobResultUrl, getProviderLabel, isThreeDResultJob } from '@/components/background-jobs/backgroundJobUtils';
import { localizeResultUrl } from '@/features/generation/application/client/localizeResultUrl';
import type { ToastOptions } from '@/providers/ToastProvider';

type Toast = (options: ToastOptions) => void;

interface UseEditorBackgroundJobControlsArgs {
    backgroundJobs: BackgroundJob[];
    setBackgroundJobs: Dispatch<SetStateAction<BackgroundJob[]>>;
    upsertBackgroundJob: (jobData: Partial<BackgroundJob>) => void;
    handleOpenThreeDEditor: (url: string) => void;
    handleAssetSelect: (url: string, type: string, name?: string) => void;
    toast: Toast;
}

export function useEditorBackgroundJobControls({
    backgroundJobs,
    setBackgroundJobs,
    upsertBackgroundJob,
    handleOpenThreeDEditor,
    handleAssetSelect,
    toast,
}: UseEditorBackgroundJobControlsArgs) {
    const handleClear = useCallback((jobId: string) => {
        setBackgroundJobs((prev) => prev.filter((job) => job.id !== jobId));
    }, [setBackgroundJobs]);

    const handleOpenResult = useCallback(async (job: BackgroundJob) => {
        const resultUrl = getJobResultUrl(job);
        if (!resultUrl) {
            return;
        }

        const isModel = isThreeDResultJob(job);

        // Jobs that finished before results were stored server-side still hold
        // the provider's signed CDN URL. Opening one is blocked by CORS, the
        // loader throws, and the editor goes down — so save it first. New jobs
        // are already local and this is a no-op.
        const localized = await localizeResultUrl(resultUrl, {
            type: isModel ? 'models' : 'images',
            provider: job.provider,
        });

        if (!localized.ok) {
            toast({
                title: 'Could not open this result',
                description: `${localized.reason}. The provider link may have expired.`,
                variant: 'destructive',
            });
            return;
        }

        if (localized.wasRemote) {
            // Keep the local URL, so the next click (and the next reload) does
            // not re-download a link that is one day closer to expiring.
            upsertBackgroundJob({ id: job.id, resultUrl: localized.url });
        }

        if (isModel) {
            handleOpenThreeDEditor(localized.url);
            return;
        }

        handleAssetSelect(localized.url, 'images', job.prompt?.trim() || undefined);
    }, [handleAssetSelect, handleOpenThreeDEditor, toast, upsertBackgroundJob]);

    const handleCancel = useCallback(async (job: BackgroundJob) => {
        const supportsRemoteCancel = supportsRemoteBackgroundJobCancel(job);

        try {
            const cancelResult = await cancelBackgroundJob(job);

            setBackgroundJobs((prev) => prev.map((entry) => (
                entry.id === job.id
                    ? {
                        ...entry,
                        status: 'CANCELLED',
                        error: cancelResult.message,
                    }
                    : entry
            )));

            toast({
                title: cancelResult.cancelledRemotely ? 'Job cancelled' : 'Tracking stopped',
                description: cancelResult.cancelledRemotely
                    ? `Cancelled ${job.id} in ${getProviderLabel(job.provider)}.`
                    : `Stopped tracking ${job.id}.`,
                variant: 'success',
            });
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'Unable to cancel this job remotely.';
            const fallbackMessage = `Tracking stopped locally after remote cancel failed: ${reason}`;

            setBackgroundJobs((prev) => prev.map((entry) => (
                entry.id === job.id
                    ? {
                        ...entry,
                        status: 'CANCELLED',
                        error: fallbackMessage,
                    }
                    : entry
            )));

            toast({
                title: supportsRemoteCancel ? 'Remote cancel failed' : 'Tracking stopped',
                description: supportsRemoteCancel
                    ? `Stopped tracking ${job.id} locally. ${reason}`
                    : `Stopped tracking ${job.id}.`,
                variant: supportsRemoteCancel ? 'destructive' : 'success',
            });
        }
    }, [setBackgroundJobs, toast]);

    const handleRetry = useCallback(async (job: BackgroundJob) => {
        try {
            const retriedJob = await retryBackgroundJob(job);

            setBackgroundJobs((prev) => prev.filter((entry) => entry.id !== job.id));
            upsertBackgroundJob(retriedJob);

            toast({
                title: retriedJob.status === 'SUCCEEDED' ? 'Retry completed' : 'Retry started',
                description: retriedJob.status === 'SUCCEEDED'
                    ? `Finished retry for ${job.id}.`
                    : `Started a new ${retriedJob.provider || job.provider || 'provider'} job.`,
                variant: 'success',
            });
        } catch (error) {
            toast({
                title: 'Retry failed',
                description: error instanceof Error ? error.message : 'Unable to retry this job.',
                variant: 'destructive',
            });
        }
    }, [setBackgroundJobs, toast, upsertBackgroundJob]);

    return useMemo(() => ({
        jobs: backgroundJobs,
        onClear: handleClear,
        onOpenResult: handleOpenResult,
        onRetry: handleRetry,
        onCancel: handleCancel,
    }), [backgroundJobs, handleCancel, handleClear, handleOpenResult, handleRetry]);
}