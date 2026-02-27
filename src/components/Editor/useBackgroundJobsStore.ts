import { useCallback, useEffect, useState } from 'react';

import type { BackgroundJob } from '@/types';

const BACKGROUND_JOBS_STORAGE_KEY = 'image-express-background-jobs';
const MAX_PERSISTED_JOBS = 80;
const MAX_JOB_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function useBackgroundJobsStore() {
    const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
    const [jobsHydrated, setJobsHydrated] = useState(false);

    const upsertBackgroundJob = useCallback((jobData: Partial<BackgroundJob>) => {
        setBackgroundJobs((prev) => {
            const id = typeof jobData.id === 'string' ? jobData.id.trim() : '';
            if (!id) return prev;

            const normalized: BackgroundJob = {
                id,
                type: (jobData.type || 'image-to-3d') as BackgroundJob['type'],
                status: (jobData.status || 'IN_PROGRESS') as BackgroundJob['status'],
                progress: jobData.progress,
                result: jobData.result,
                resultUrl: jobData.resultUrl,
                thumbnailUrl: jobData.thumbnailUrl,
                error: jobData.error,
                createdAt: jobData.createdAt || Date.now(),
                apiKey: jobData.apiKey,
                provider: jobData.provider,
                stage: jobData.stage,
                prompt: jobData.prompt,
            };

            const existing = prev.find((job) => job.id === id);
            if (!existing) {
                return [...prev, normalized];
            }

            const merged: BackgroundJob = {
                ...existing,
                ...normalized,
                error: normalized.status === 'IN_PROGRESS' || normalized.status === 'PENDING' ? undefined : (normalized.error || existing.error),
            };
            return prev.map((job) => (job.id === id ? merged : job));
        });
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem(BACKGROUND_JOBS_STORAGE_KEY);
            if (!raw) {
                setJobsHydrated(true);
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                setJobsHydrated(true);
                return;
            }

            const now = Date.now();
            const restored = parsed
                .filter((entry) => entry && typeof entry === 'object')
                .map((entry) => {
                    const source = entry as Partial<BackgroundJob>;
                    const id = typeof source.id === 'string' ? source.id.trim() : '';
                    if (!id) return null;
                    const createdAt = typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
                        ? source.createdAt
                        : now;
                    if (now - createdAt > MAX_JOB_AGE_MS) return null;

                    const provider = source.provider;
                    let apiKey = source.apiKey;
                    if (!apiKey && provider) {
                        apiKey = localStorage.getItem(`${provider}_api_key`) || undefined;
                    }

                    return {
                        id,
                        type: (source.type || 'image-to-3d') as BackgroundJob['type'],
                        status: (source.status || 'IN_PROGRESS') as BackgroundJob['status'],
                        progress: typeof source.progress === 'number' ? source.progress : undefined,
                        resultUrl: source.resultUrl,
                        thumbnailUrl: source.thumbnailUrl,
                        error: source.error,
                        createdAt,
                        apiKey,
                        provider,
                        stage: source.stage,
                        prompt: source.prompt,
                    } as BackgroundJob;
                })
                .filter((entry): entry is BackgroundJob => Boolean(entry))
                .slice(-MAX_PERSISTED_JOBS);

            if (restored.length > 0) {
                setBackgroundJobs((prev) => (prev.length > 0 ? prev : restored));
            }
        } catch (error) {
            console.error('Failed to restore background jobs', error);
        } finally {
            setJobsHydrated(true);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !jobsHydrated) return;
        try {
            const compact = backgroundJobs
                .slice(-MAX_PERSISTED_JOBS)
                .map((job) => ({
                    id: job.id,
                    type: job.type,
                    status: job.status,
                    progress: job.progress,
                    resultUrl: job.resultUrl,
                    thumbnailUrl: job.thumbnailUrl,
                    error: job.error,
                    createdAt: job.createdAt,
                    apiKey: job.apiKey,
                    provider: job.provider,
                    stage: job.stage,
                    prompt: job.prompt,
                }));
            localStorage.setItem(BACKGROUND_JOBS_STORAGE_KEY, JSON.stringify(compact));
        } catch (error) {
            console.error('Failed to persist background jobs', error);
        }
    }, [backgroundJobs, jobsHydrated]);

    return {
        backgroundJobs,
        setBackgroundJobs,
        jobsHydrated,
        upsertBackgroundJob,
    };
}
