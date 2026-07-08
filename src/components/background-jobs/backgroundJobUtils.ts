import type { BackgroundJob } from '@/types';

export type BackgroundJobStatusFilter = 'all' | 'active' | 'failed' | 'finished';
export type BackgroundJobTypeFilter = BackgroundJob['type'] | 'all';
export type BackgroundJobProviderFilter = string | 'all';

export type BackgroundJobOption<TValue extends string> = {
    value: TValue;
    label: string;
    count: number;
};

export const UNKNOWN_PROVIDER_FILTER = '__unknown__';

const MODEL_RESULT_PATTERN = /\.(glb|gltf|fbx|obj)(?:$|[?#])/i;

const PROVIDER_LABELS: Record<string, string> = {
    banana: 'Banana',
    google: 'Google',
    hitems: 'Hitems',
    meshy: 'Meshy',
    openai: 'OpenAI',
    stability: 'Stability',
    tripo: 'Tripo',
};

const JOB_TYPE_LABELS: Record<BackgroundJob['type'], string> = {
    upscale: 'Upscale',
    'remove-bg': 'Remove BG',
    'generate-3d': 'Generate 3D',
    'train-model': 'Train Model',
    'stability-upscale': 'Stability Upscale',
    'stability-image': 'Stability Image',
    'image-to-3d': 'Image to 3D',
    'text-to-3d': 'Text to 3D',
    'hitems-relief': '3D Relief (Depth)',
    'hitems-split': 'Model Split',
};

function normalizeStatus(status: BackgroundJob['status']) {
    return status.trim().toLowerCase();
}

export function isFailedJob(job: BackgroundJob) {
    return normalizeStatus(job.status) === 'failed';
}

export function isSucceededJob(job: BackgroundJob) {
    const normalized = normalizeStatus(job.status);
    return normalized === 'completed' || normalized === 'succeeded';
}

export function isCancelledJob(job: BackgroundJob) {
    return normalizeStatus(job.status) === 'cancelled';
}

export function isActiveJob(job: BackgroundJob) {
    const normalized = normalizeStatus(job.status);
    return normalized === 'pending' || normalized === 'processing' || normalized === 'in_progress';
}

export function isFinishedJob(job: BackgroundJob) {
    return isSucceededJob(job) || isFailedJob(job) || isCancelledJob(job);
}

export function getJobCounts(jobs: BackgroundJob[]) {
    const active = jobs.filter(isActiveJob).length;
    const failed = jobs.filter(isFailedJob).length;
    const finished = jobs.filter(isFinishedJob).length;

    return {
        all: jobs.length,
        active,
        failed,
        finished,
    };
}

export function getJobResultUrl(job: BackgroundJob) {
    if (typeof job.resultUrl === 'string' && job.resultUrl.trim().length > 0) {
        return job.resultUrl;
    }

    if (typeof job.thumbnailUrl === 'string' && job.thumbnailUrl.trim().length > 0) {
        return job.thumbnailUrl;
    }

    return null;
}

export function isThreeDResultJob(job: BackgroundJob) {
    const resultUrl = getJobResultUrl(job);
    return job.type === 'generate-3d'
        || job.type === 'image-to-3d'
        || job.type === 'text-to-3d'
        || job.type === 'hitems-split'
        || (typeof resultUrl === 'string' && MODEL_RESULT_PATTERN.test(resultUrl));
}

export function canRetryJob(job: BackgroundJob) {
    return Boolean(job.request);
}

export function getProviderFilterValue(provider?: string) {
    const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    return normalized || UNKNOWN_PROVIDER_FILTER;
}

export function getProviderLabel(provider?: string) {
    const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    if (!normalized) {
        return 'Unspecified';
    }

    if (PROVIDER_LABELS[normalized]) {
        return PROVIDER_LABELS[normalized];
    }

    return normalized
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function getJobTypeLabel(type: BackgroundJob['type']) {
    return JOB_TYPE_LABELS[type] || type;
}

export function getJobTitle(job: BackgroundJob) {
    const prompt = typeof job.prompt === 'string' ? job.prompt.trim() : '';

    if (job.type === 'text-to-3d' && prompt) {
        return `Gen: ${prompt}`;
    }

    if (job.type === 'stability-image' && prompt) {
        return `${getJobTypeLabel(job.type)}: ${prompt}`;
    }

    return getJobTypeLabel(job.type);
}

export function getJobStatusMessage(job: BackgroundJob) {
    if (isSucceededJob(job)) {
        return 'Saved to server & added.';
    }

    if (isCancelledJob(job)) {
        return job.error || 'Tracking stopped by user.';
    }

    if (isFailedJob(job)) {
        return job.error || 'Failed to process.';
    }

    if (typeof job.progress === 'number') {
        return `Processing... ${job.progress}%`;
    }

    return 'Processing...';
}

export function getProviderOptions(
    jobs: BackgroundJob[],
    selectedProvider: BackgroundJobProviderFilter,
): Array<BackgroundJobOption<string>> {
    const counts = new Map<string, { count: number; label: string }>();

    jobs.forEach((job) => {
        const value = getProviderFilterValue(job.provider);
        const existing = counts.get(value);
        counts.set(value, {
            count: (existing?.count || 0) + 1,
            label: existing?.label || getProviderLabel(job.provider),
        });
    });

    if (selectedProvider !== 'all' && !counts.has(selectedProvider)) {
        counts.set(selectedProvider, {
            count: 0,
            label: selectedProvider === UNKNOWN_PROVIDER_FILTER ? getProviderLabel(undefined) : getProviderLabel(selectedProvider),
        });
    }

    return Array.from(counts.entries())
        .map(([value, entry]) => ({ value, ...entry }))
        .sort((left, right) => left.label.localeCompare(right.label));
}

export function getTypeOptions(
    jobs: BackgroundJob[],
    selectedType: BackgroundJobTypeFilter,
): Array<BackgroundJobOption<BackgroundJob['type']>> {
    const counts = new Map<BackgroundJob['type'], number>();

    jobs.forEach((job) => {
        counts.set(job.type, (counts.get(job.type) || 0) + 1);
    });

    if (selectedType !== 'all' && !counts.has(selectedType)) {
        counts.set(selectedType, 0);
    }

    return Array.from(counts.entries())
        .map(([value, count]) => ({ value, count, label: getJobTypeLabel(value) }))
        .sort((left, right) => left.label.localeCompare(right.label));
}

export function filterJobs(
    jobs: BackgroundJob[],
    filters: {
        status: BackgroundJobStatusFilter;
        provider: BackgroundJobProviderFilter;
        type: BackgroundJobTypeFilter;
    },
) {
    return jobs.filter((job) => {
        const matchesStatus = (() => {
            switch (filters.status) {
                case 'active':
                    return isActiveJob(job);
                case 'failed':
                    return isFailedJob(job);
                case 'finished':
                    return isFinishedJob(job);
                case 'all':
                default:
                    return true;
            }
        })();

        if (!matchesStatus) {
            return false;
        }

        if (filters.provider !== 'all' && getProviderFilterValue(job.provider) !== filters.provider) {
            return false;
        }

        if (filters.type !== 'all' && job.type !== filters.type) {
            return false;
        }

        return true;
    });
}