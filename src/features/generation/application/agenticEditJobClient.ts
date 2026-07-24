import {
    GenerateJobResultSchema,
    GenerateJobStatusSchema,
    PublicApiErrorSchema,
    QueueGenerateJobResponseSchema,
    type GenerateJobResult,
    type GenerateJobStatus,
} from '../contracts/agenticEditJob';
import {
    toAppOperationError,
    type OperationState,
} from '@/shared/application/operationState';

const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_MAX_WAIT_MS = 30 * 60 * 1000;

type FetchLike = typeof fetch;

class AgenticEditApiError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly retryable: boolean,
        public readonly requestId?: string,
    ) {
        super(message);
        this.name = 'AgenticEditApiError';
    }
}

export interface RunAgenticEditJobOptions {
    signal: AbortSignal;
    onState?: (state: OperationState<GenerateJobResult>) => void;
    fetchImpl?: FetchLike;
    pollIntervalMs?: number;
    maxWaitMs?: number;
    now?: () => number;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

function abortError(): DOMException {
    return new DOMException('Aborted', 'AbortError');
}

export function waitWithAbort(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(abortError());
            return;
        }
        const onAbort = () => {
            globalThis.clearTimeout(timeout);
            reject(abortError());
        };
        const timeout = globalThis.setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, milliseconds);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

async function readResponseJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function responseError(payload: unknown, fallback: string): Error {
    const parsed = PublicApiErrorSchema.safeParse(payload);
    if (!parsed.success) {
        return new Error(fallback);
    }
    return new AgenticEditApiError(
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.retryable,
        parsed.data.error.requestId,
    );
}

export async function runAgenticEditJob(
    formData: FormData,
    options: RunAgenticEditJobOptions,
): Promise<GenerateJobResult> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const now = options.now ?? Date.now;
    const wait = options.wait ?? waitWithAbort;
    const startedAt = now();

    options.onState?.({ status: 'validating' });

    try {
        if (options.signal.aborted) {
            throw abortError();
        }

        options.onState?.({
            status: 'running',
            startedAt,
            message: 'Queueing generation job…',
            progress: 0,
        });
        const queueResponse = await fetchImpl('/api/generate', {
            method: 'POST',
            body: formData,
            signal: options.signal,
        });
        const queuePayload = await readResponseJson(queueResponse);
        const queued = QueueGenerateJobResponseSchema.safeParse(queuePayload);
        if (!queueResponse.ok || !queued.success) {
            throw responseError(queuePayload, 'Failed to queue AI Edit Notes job.');
        }

        const jobId = queued.data.job_id;
        const maximumWait = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
        const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

        while (now() - startedAt < maximumWait) {
            await wait(pollInterval, options.signal);
            const statusResponse = await fetchImpl(`/api/jobs/${encodeURIComponent(jobId)}`, {
                signal: options.signal,
            });
            const statusPayload = await readResponseJson(statusResponse);
            const status = GenerateJobStatusSchema.safeParse(statusPayload);
            if (!statusResponse.ok || !status.success) {
                throw responseError(statusPayload, 'Failed to poll generation job status.');
            }

            const jobState: GenerateJobStatus = status.data;
            options.onState?.({
                status: 'running',
                startedAt,
                message: jobState.message || jobState.status,
                progress: jobState.progress,
            });

            if (jobState.status === 'failed') {
                throw new Error(jobState.error || 'AI Edit Notes generation failed.');
            }
            if (jobState.status !== 'succeeded') {
                continue;
            }

            const resultResponse = await fetchImpl(
                `/api/jobs/${encodeURIComponent(jobId)}/result`,
                { signal: options.signal },
            );
            const resultPayload = await readResponseJson(resultResponse);
            const result = GenerateJobResultSchema.safeParse(resultPayload);
            if (!resultResponse.ok || !result.success) {
                throw responseError(resultPayload, 'Generation completed without a usable result.');
            }
            options.onState?.({ status: 'succeeded', result: result.data });
            return result.data;
        }

        throw new Error('Timed out waiting for AI Edit Notes result after 30 minutes.');
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            options.onState?.({ status: 'cancelled' });
        } else {
            options.onState?.({
                status: 'failed',
                error: error instanceof AgenticEditApiError
                    ? {
                        code: error.code,
                        message: error.message,
                        retryable: error.retryable,
                        requestId: error.requestId,
                    }
                    : toAppOperationError(error, 'agentic_edit_failed'),
            });
        }
        throw error;
    }
}
