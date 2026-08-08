/**
 * Provider poll response normalisation.
 *
 * Every 3D/upscale provider reports progress differently — different status
 * vocabularies ('SUCCEEDED' vs 'success' vs task_status: 4), different progress
 * scales (0–1 vs 0–100), different result-URL nesting. This module turns any of
 * them into one shape.
 *
 * It is pure and provider-agnostic on purpose. The equivalent logic previously
 * lived inline in `useBackgroundJobPolling` — ~250 lines of branching inside a
 * React hook, with no tests, running in the browser. Pulling it out is what
 * makes server-side polling possible *and* testable; the status vocabularies
 * below are exactly where a silent mis-read turns a finished job into a job
 * that polls forever.
 */

export type RemoteProvider = 'meshy' | 'tripo' | 'hitems' | 'stability';

export type RemotePollStatus = 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type RemotePollResult = {
    status: RemotePollStatus;
    /** 0–100. Carried forward from the previous poll when a provider omits it. */
    progress: number;
    resultUrl?: string;
    thumbnailUrl?: string;
    error?: string;
    /**
     * Meshy text-to-3d finishes a cheap "preview" first and must then be
     * re-submitted for texture refinement, which returns a NEW task id. When
     * set, the caller should start a refine request and continue polling the id
     * it returns.
     */
    needsMeshyRefine?: boolean;
};

export type PollContext = {
    /** Progress from the previous poll, so a provider that omits it never regresses. */
    previousProgress: number;
    /** Job type — Hitem3D and Meshy branch on it. */
    jobType?: string;
    /** Meshy only: 'preview' | 'refining'. */
    stage?: string;
};

/** Path on our own API that proxies this provider's status endpoint. */
export function providerPollPath(
    provider: RemoteProvider,
    taskId: string,
    jobType?: string,
): string {
    const id = encodeURIComponent(taskId);
    switch (provider) {
        case 'stability':
            return `/api/ai/stability/upscale/poll?id=${id}`;
        case 'tripo':
            return `/api/ai/tripo/${id}`;
        case 'hitems':
            if (jobType === 'hitems-relief') return `/api/ai/hitems/depth/${id}`;
            if (jobType === 'hitems-split') return `/api/ai/hitems/split/${id}`;
            return `/api/ai/hitems/${id}`;
        case 'meshy':
        default: {
            const endpoint = jobType === 'image-to-3d' ? 'image-to-3d' : 'text-to-3d';
            return `/api/ai/meshy?endpoint=${endpoint}/${id}`;
        }
    }
}

/**
 * The provider's own status endpoint.
 *
 * `providerPollPath` above returns *our* proxy path, which is what the browser
 * must use (it has no keys and would hit CORS). Server-side polling calls the
 * provider directly instead of looping a request back through our own HTTP
 * server, which would need to know its own port and would fail during startup.
 */
export function providerUpstreamUrl(
    provider: RemoteProvider,
    taskId: string,
    jobType?: string,
): string {
    const id = encodeURIComponent(taskId);
    switch (provider) {
        case 'stability':
            return `https://api.stability.ai/v2beta/stable-image/upscale/creative/result/${id}`;
        case 'tripo':
            return `https://api.tripo3d.ai/v2/openapi/task/${id}`;
        case 'hitems': {
            const base = 'https://api.hitem3d.ai/open-api/v1';
            if (jobType === 'hitems-relief') return `${base}/depth/query-task?task_id=${id}`;
            if (jobType === 'hitems-split') return `${base}/split/query-task?task_id=${id}`;
            return `${base}/query-task?task_id=${id}`;
        }
        case 'meshy':
        default: {
            // image-to-3d lives on v1, text-to-3d on v2.
            const isImage = jobType === 'image-to-3d';
            const base = isImage
                ? 'https://api.meshy.ai/openapi/v1'
                : 'https://api.meshy.ai/openapi/v2';
            return `${base}/${isImage ? 'image-to-3d' : 'text-to-3d'}/${id}`;
        }
    }
}

/**
 * Extra headers the provider's own endpoint needs beyond auth.
 * Stability returns base64 JSON only when asked for it.
 */
export function providerUpstreamExtraHeaders(provider: RemoteProvider): Record<string, string> {
    return provider === 'stability' ? { Accept: 'application/json' } : {};
}

/**
 * Auth headers for a provider's status endpoint.
 *
 * Hitem3D is the odd one: an `ak:sk` credential is sent verbatim (the proxy
 * exchanges it for a refreshable token), while a plain token is sent as a
 * bearer. It also wants an `Appid` alongside. Everything else is a bearer.
 */
export function providerPollHeaders(
    provider: RemoteProvider,
    apiKey: string,
    options?: { hitemsAppId?: string | null },
): Record<string, string> {
    if (provider === 'hitems') {
        const raw = apiKey.replace(/Bearer /gi, '').replace(/["']/g, '').trim();
        const headers: Record<string, string> = {
            Authorization: raw.includes(':') ? raw : `Bearer ${raw}`,
        };
        if (options?.hitemsAppId) headers.Appid = options.hitemsAppId;
        return headers;
    }
    return { Authorization: `Bearer ${apiKey}` };
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * Providers disagree on scale: some report 0–1, some 0–100. Values at or below
 * 1 are treated as a fraction, which is why an honest 1% reads as 100% — the
 * ambiguity is inherent to the wire format and the providers send whole
 * percentages in practice.
 */
function parseProgressValue(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return null;
    if (numeric <= 1) return clampPercent(numeric * 100);
    return clampPercent(numeric);
}

const EXPIRED_TOKEN = /login expired|token expired|invalid token/i;
const HITEM_TOKEN_HINT =
    ' If you are using Bearer token, refresh it. For auto-refresh use ak:sk key format.';

function normalizeStability(payload: Record<string, unknown>, ctx: PollContext): RemotePollResult {
    const status = String(payload.status ?? '').toUpperCase();
    if (status === 'SUCCEEDED') {
        return {
            status: 'SUCCEEDED',
            progress: 100,
            resultUrl: payload.image ? `data:image/png;base64,${String(payload.image)}` : undefined,
        };
    }
    if (status === 'IN_PROGRESS') {
        return { status: 'IN_PROGRESS', progress: ctx.previousProgress };
    }
    return { status: 'FAILED', progress: ctx.previousProgress, error: 'Stability upscale failed.' };
}

function normalizeTripo(payload: Record<string, unknown>, ctx: PollContext): RemotePollResult {
    const data = payload.data as Record<string, unknown> | undefined;
    if (!data) {
        const code = payload.code;
        if (code !== undefined && code !== 0) {
            return { status: 'FAILED', progress: ctx.previousProgress, error: `Tripo error code: ${code}.` };
        }
        return { status: 'IN_PROGRESS', progress: ctx.previousProgress };
    }

    const output = (data.output ?? {}) as Record<string, unknown>;
    const state = String(data.status ?? '').toLowerCase();
    const progress = parseProgressValue(data.progress) ?? ctx.previousProgress;
    const resultUrl = (output.model || output.pbr_model || output.base_model) as string | undefined;
    const thumbnailUrl = (output.rendered_image || output.render_image) as string | undefined;

    if (state === 'success') {
        return { status: 'SUCCEEDED', progress: 100, resultUrl, thumbnailUrl };
    }
    if (state === 'cancelled') {
        return { status: 'CANCELLED', progress, error: 'Tripo task cancelled.' };
    }
    if (state === 'failed') {
        return { status: 'FAILED', progress, error: 'Tripo task failed.' };
    }
    return { status: 'IN_PROGRESS', progress, resultUrl, thumbnailUrl };
}

function normalizeMeshy(payload: Record<string, unknown>, ctx: PollContext): RemotePollResult {
    const state = String(payload.status ?? '').toUpperCase();
    const progress = parseProgressValue(payload.progress) ?? ctx.previousProgress;
    const modelUrls = payload.model_urls as Record<string, unknown> | undefined;
    const resultUrl = modelUrls?.glb as string | undefined;
    const thumbnailUrl = payload.thumbnail_url as string | undefined;

    if (state === 'SUCCEEDED') {
        // A finished *preview* is not a finished job: text-to-3d must be
        // resubmitted for texture refinement, which yields a new task id.
        const needsMeshyRefine = ctx.jobType === 'text-to-3d'
            && (!ctx.stage || ctx.stage === 'preview');
        return { status: 'SUCCEEDED', progress: 100, resultUrl, thumbnailUrl, needsMeshyRefine };
    }
    if (state === 'CANCELLED' || state === 'CANCELED') {
        return { status: 'CANCELLED', progress, error: 'Meshy task cancelled.' };
    }
    if (state === 'FAILED' || state === 'EXPIRED') {
        return { status: 'FAILED', progress, error: `Meshy task ${state.toLowerCase()}.` };
    }
    return { status: 'IN_PROGRESS', progress, resultUrl, thumbnailUrl };
}

function normalizeHitems(payload: Record<string, unknown>, ctx: PollContext): RemotePollResult {
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const taskResult = (data.task_result ?? {}) as Record<string, unknown>;

    const message = (data.task_msg || data.message || payload.message || payload.msg) as string | undefined;
    const statusCode = data.task_status as number | undefined;
    const state = typeof data.state === 'string' ? data.state.toLowerCase() : '';
    const codeText = payload.code !== undefined ? String(payload.code) : undefined;
    const isOkCode = codeText === undefined || codeText === '200' || codeText === '0';

    const parsedProgress = [
        data.process_pct, data.progress, data.process, data.percentage, data.percent,
    ].map(parseProgressValue).find((value): value is number => value !== null);

    const resultUrl = (taskResult.model_url || taskResult.url || data.model_url || data.url) as string | undefined;
    const thumbnailUrl = (
        taskResult.render_url || taskResult.cover_url || data.render_url || data.cover_url
    ) as string | undefined;

    let status: RemotePollStatus;
    let error: string | undefined;

    if (statusCode === 4 || state === 'success') {
        status = 'SUCCEEDED';
    } else if (statusCode === -1 || state === 'failed') {
        status = 'FAILED';
        const base = message || `Hitem task failed${statusCode !== undefined ? ` (status ${statusCode})` : ''}.`;
        error = EXPIRED_TOKEN.test(base) ? `${base}${HITEM_TOKEN_HINT}` : base;
    } else if (typeof message === 'string' && /expired|invalid token/i.test(message)) {
        status = 'FAILED';
        error = `${message}${HITEM_TOKEN_HINT}`;
    } else if (!isOkCode) {
        status = 'FAILED';
        error = message || `Hitem response code ${codeText}.`;
    } else {
        status = 'IN_PROGRESS';
    }

    let progress = parsedProgress ?? ctx.previousProgress;
    if (parsedProgress === undefined && status === 'IN_PROGRESS') {
        // Hitem3D often reports no percentage at all; give the user coarse
        // movement from the state name rather than a frozen bar.
        if (state === 'created') progress = Math.max(progress, 5);
        else if (state === 'queueing') progress = Math.max(progress, 15);
        else if (state === 'processing' || state === 'running') progress = Math.max(progress, 30);
    }

    // A model URL means the job finished, whatever the status field claimed.
    if (status !== 'FAILED' && resultUrl) {
        return { status: 'SUCCEEDED', progress: 100, resultUrl, thumbnailUrl };
    }
    if (status === 'SUCCEEDED') progress = 100;

    return { status, progress, resultUrl, thumbnailUrl, error };
}

/** Normalise any provider's poll payload into one shape. */
export function normalizeProviderPoll(
    provider: RemoteProvider,
    payload: unknown,
    ctx: PollContext,
): RemotePollResult {
    const body = (payload ?? {}) as Record<string, unknown>;
    switch (provider) {
        case 'stability': return normalizeStability(body, ctx);
        case 'tripo': return normalizeTripo(body, ctx);
        case 'hitems': return normalizeHitems(body, ctx);
        case 'meshy':
        default: return normalizeMeshy(body, ctx);
    }
}

export const isTerminalPollStatus = (status: RemotePollStatus): boolean => (
    status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED'
);

/**
 * Poll interval with exponential backoff and jitter.
 *
 * Backoff resets on real progress, so an active job stays responsive while an
 * idle one stops hammering the provider. Jitter prevents several jobs started
 * together from synchronising into bursts.
 */
export function nextPollDelayMs(
    currentDelayMs: number,
    progressed: boolean,
    options?: { minMs?: number; maxMs?: number; jitter?: () => number },
): number {
    const min = options?.minMs ?? 2000;
    const max = options?.maxMs ?? 15_000;
    const jitter = options?.jitter ?? Math.random;
    const base = progressed ? min : Math.min(max, Math.round(currentDelayMs * 1.5));
    const factor = 0.85 + jitter() * 0.3;
    return Math.max(min, Math.min(max, Math.round(base * factor)));
}
