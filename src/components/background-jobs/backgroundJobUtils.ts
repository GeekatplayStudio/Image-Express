import type { BackgroundJob } from '@/types';

export type BackgroundJobStatusFilter = 'all' | 'active' | 'failed' | 'finished';
export type BackgroundJobTypeFilter = BackgroundJob['type'] | 'all';
export type BackgroundJobProviderFilter = string | 'all';

export type BackgroundJobOption<TValue extends string> = {
    value: TValue;
    /** Vendor brand name for providers; empty string means "unspecified". */
    label: string;
    /** Dictionary key for job types; empty for provider options (use `label`). */
    labelKey?: string;
    count: number;
};

/**
 * A translatable message: dictionary key plus placeholder values. An empty
 * `key` means `vars.text` is already-human passthrough (a server error). An
 * optional `typeKey` is a nested dictionary key resolved into the `type` var
 * (the "<Stability Image>: prompt" title needs its type name translated too).
 */
export type JobMessage = {
    key: string;
    vars?: Record<string, string | number>;
    typeKey?: string;
};

/** Resolve a JobMessage to display text via a translate function. */
export function renderJobMessage(
    t: (key: string, vars?: Record<string, string | number>) => string,
    message: JobMessage,
): string {
    if (message.key === '') {
        return String(message.vars?.text ?? '');
    }
    const vars = message.typeKey
        ? { ...message.vars, type: t(message.typeKey) }
        : message.vars;
    return t(message.key, vars);
}

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

// Display text lives in the dictionary under jobType.<type>; the map is 1:1
// with the type union so a new job type is a compile error until keyed.
const JOB_TYPE_LABEL_KEYS: Record<BackgroundJob['type'], string> = {
    upscale: 'jobType.upscale',
    'remove-bg': 'jobType.remove-bg',
    'generate-3d': 'jobType.generate-3d',
    'train-model': 'jobType.train-model',
    'stability-upscale': 'jobType.stability-upscale',
    'stability-image': 'jobType.stability-image',
    'image-to-3d': 'jobType.image-to-3d',
    'text-to-3d': 'jobType.text-to-3d',
    'hitems-relief': 'jobType.hitems-relief',
    'hitems-split': 'jobType.hitems-split',
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

/** Provider brand name (Meshy, OpenAI, …); '' when unspecified. */
export function getProviderLabel(provider?: string) {
    const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    if (!normalized) {
        return '';
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

export function getJobTypeLabelKey(type: BackgroundJob['type']): string {
    return JOB_TYPE_LABEL_KEYS[type] || type;
}

/** Job row title as a translatable message (Gen: <prompt>, <type>: <prompt>, or the type). */
export function getJobTitleMessage(job: BackgroundJob): JobMessage {
    const prompt = typeof job.prompt === 'string' ? job.prompt.trim() : '';

    if (job.type === 'text-to-3d' && prompt) {
        return { key: 'jobs.titleGen', vars: { prompt } };
    }

    if (job.type === 'stability-image' && prompt) {
        return { key: 'jobs.titlePrompt', vars: { prompt }, typeKey: getJobTypeLabelKey(job.type) };
    }

    return { key: getJobTypeLabelKey(job.type) };
}

/**
 * Status line as a translatable message. A server-supplied `job.error` is
 * passed through verbatim (it is already human text, not a dictionary key).
 */
export function getJobStatusMessage(job: BackgroundJob): JobMessage {
    if (isSucceededJob(job)) {
        return { key: 'jobs.statusSaved' };
    }

    if (isCancelledJob(job)) {
        return job.error ? { key: '', vars: { text: job.error } } : { key: 'jobs.statusStopped' };
    }

    if (isFailedJob(job)) {
        return job.error ? { key: '', vars: { text: job.error } } : { key: 'jobs.statusFailed' };
    }

    if (typeof job.progress === 'number') {
        return { key: 'jobs.statusProcessingPct', vars: { progress: job.progress } };
    }

    return { key: 'jobs.statusProcessing' };
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
        .map(([value, count]) => ({ value, count, label: '', labelKey: getJobTypeLabelKey(value) }))
        .sort((left, right) => left.value.localeCompare(right.value));
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