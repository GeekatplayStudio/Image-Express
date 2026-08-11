import { assertFetchableUrl } from '@/lib/server/outboundUrlPolicy';

/**
 * Server-side adapters for the external upscale services. Each provider gets
 * the caller's own API key (forwarded from the client, never stored here) and
 * returns either a finished data URL or a task id the caller polls.
 *
 * The provider hosts are hardcoded — the caller never supplies a URL to
 * fetch, so these proxies are not an SSRF surface. Result URLs returned *by
 * the providers* are still validated through the outbound URL policy before
 * being fetched, because a compromised or spoofed provider response must not
 * become a read of the local network.
 */

export type UpscaleJobRequest = {
    provider: string;
    /** data URL of the source image. */
    image: string;
    scale: number;
    creativity?: number;
    prompt?: string;
    sourceWidth?: number;
    sourceHeight?: number;
};

export type UpscaleJobResult =
    | { kind: 'image'; image: string }
    | { kind: 'task'; taskId: string }
    | { kind: 'error'; message: string; statusCode: number };

/** Real-ESRGAN on Replicate, pinned so output stays reproducible. */
const REPLICATE_REAL_ESRGAN_VERSION = '42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b';

/** Refuse to buffer upstream results beyond this — protects the server heap. */
const MAX_RESULT_BYTES = 96 * 1024 * 1024;

const dataUrlPattern = /^data:image\/(png|jpeg|jpg|webp);base64,/i;

export const isImageDataUrl = (value: unknown): value is string => (
    typeof value === 'string' && dataUrlPattern.test(value)
);

const dataUrlToBuffer = (dataUrl: string): { buffer: Buffer; mime: string } => {
    const [meta, payload] = dataUrl.split(',', 2);
    const mime = meta.slice('data:'.length).split(';')[0] || 'image/png';
    return { buffer: Buffer.from(payload, 'base64'), mime };
};

/** Fetch a provider-returned result URL and re-encode it as a data URL. */
const fetchResultAsDataUrl = async (rawUrl: string): Promise<UpscaleJobResult> => {
    let url: URL;
    try {
        url = assertFetchableUrl(rawUrl);
    } catch (error) {
        return {
            kind: 'error',
            statusCode: 502,
            message: `Provider returned an unfetchable result URL: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    const response = await fetch(url);
    if (!response.ok) {
        return { kind: 'error', statusCode: 502, message: `Fetching the upscaled result failed (HTTP ${response.status}).` };
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_RESULT_BYTES) {
        return { kind: 'error', statusCode: 502, message: 'The upscaled result is larger than the supported limit.' };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESULT_BYTES) {
        return { kind: 'error', statusCode: 502, message: 'The upscaled result is larger than the supported limit.' };
    }
    const mime = response.headers.get('content-type')?.split(';')[0] || 'image/png';
    return { kind: 'image', image: `data:${mime};base64,${bytes.toString('base64')}` };
};

const readUpstreamError = async (response: Response, providerLabel: string): Promise<UpscaleJobResult> => {
    const text = await response.text().catch(() => '');
    let message = `${providerLabel} error (HTTP ${response.status}).`;
    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const candidate = (parsed.message ?? parsed.detail ?? parsed.error) as unknown;
        if (typeof candidate === 'string' && candidate.trim()) {
            message = `${providerLabel}: ${candidate.trim()}`;
        } else if (Array.isArray((parsed as { errors?: Array<{ message?: string }> }).errors)) {
            const first = (parsed as { errors: Array<{ message?: string }> }).errors[0]?.message;
            if (first) message = `${providerLabel}: ${first}`;
        }
    } catch {
        if (text.trim()) message = `${providerLabel}: ${text.trim().slice(0, 300)}`;
    }
    return { kind: 'error', statusCode: response.status, message };
};

// --- Fal.ai (Clarity upscaler) — synchronous over fal.run ---

const runFal = async (job: UpscaleJobRequest, apiKey: string): Promise<UpscaleJobResult> => {
    const response = await fetch('https://fal.run/fal-ai/clarity-upscaler', {
        method: 'POST',
        headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image_url: job.image,
            upscale_factor: job.scale,
            creativity: typeof job.creativity === 'number' ? job.creativity : 0.35,
            ...(job.prompt ? { prompt: job.prompt } : {}),
        }),
    });
    if (!response.ok) {
        return readUpstreamError(response, 'Fal.ai');
    }
    const data = await response.json() as { image?: { url?: string } };
    if (!data.image?.url) {
        return { kind: 'error', statusCode: 502, message: 'Fal.ai returned no result image.' };
    }
    return fetchResultAsDataUrl(data.image.url);
};

// --- Replicate (Real-ESRGAN) — sync-preferred with poll fallback ---

type ReplicatePrediction = {
    id?: string;
    status?: string;
    output?: unknown;
    error?: unknown;
};

const replicateResult = async (prediction: ReplicatePrediction): Promise<UpscaleJobResult> => {
    if (prediction.status === 'succeeded') {
        const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        if (typeof output !== 'string') {
            return { kind: 'error', statusCode: 502, message: 'Replicate returned no result image.' };
        }
        return fetchResultAsDataUrl(output);
    }
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
        const detail = typeof prediction.error === 'string' && prediction.error.trim() ? `: ${prediction.error.trim()}` : '.';
        return { kind: 'error', statusCode: 502, message: `Replicate prediction ${prediction.status}${detail}` };
    }
    if (prediction.id) {
        return { kind: 'task', taskId: prediction.id };
    }
    return { kind: 'error', statusCode: 502, message: 'Replicate returned an unexpected response.' };
};

const runReplicate = async (job: UpscaleJobRequest, apiKey: string): Promise<UpscaleJobResult> => {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait=60',
        },
        body: JSON.stringify({
            version: REPLICATE_REAL_ESRGAN_VERSION,
            input: {
                image: job.image,
                scale: job.scale,
                face_enhance: false,
            },
        }),
    });
    if (!response.ok && response.status !== 201) {
        return readUpstreamError(response, 'Replicate');
    }
    return replicateResult(await response.json() as ReplicatePrediction);
};

const pollReplicate = async (taskId: string, apiKey: string): Promise<UpscaleJobResult> => {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
        return readUpstreamError(response, 'Replicate');
    }
    return replicateResult(await response.json() as ReplicatePrediction);
};

// --- Magnific via the Freepik API — task id + poll ---

const runFreepik = async (job: UpscaleJobRequest, apiKey: string): Promise<UpscaleJobResult> => {
    const { buffer } = dataUrlToBuffer(job.image);
    const response = await fetch('https://api.freepik.com/v1/ai/image-upscaler', {
        method: 'POST',
        headers: {
            'x-freepik-api-key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image: buffer.toString('base64'),
            scale_factor: `${job.scale}x`,
            ...(job.prompt ? { prompt: job.prompt } : {}),
            // Freepik's creativity dial is -10..10; ours is 0..1.
            creativity: Math.round(((typeof job.creativity === 'number' ? job.creativity : 0.35) * 20) - 10),
        }),
    });
    if (!response.ok) {
        return readUpstreamError(response, 'Magnific (Freepik)');
    }
    const data = await response.json() as { data?: { task_id?: string }; task_id?: string };
    const taskId = data.data?.task_id || data.task_id;
    if (!taskId) {
        return { kind: 'error', statusCode: 502, message: 'Magnific (Freepik) returned no task id.' };
    }
    return { kind: 'task', taskId };
};

const pollFreepik = async (taskId: string, apiKey: string): Promise<UpscaleJobResult> => {
    const response = await fetch(`https://api.freepik.com/v1/ai/image-upscaler/${encodeURIComponent(taskId)}`, {
        headers: { 'x-freepik-api-key': apiKey },
    });
    if (!response.ok) {
        return readUpstreamError(response, 'Magnific (Freepik)');
    }
    const data = await response.json() as { data?: { status?: string; generated?: string[] } };
    const status = data.data?.status?.toUpperCase() || '';
    if (status === 'COMPLETED') {
        const resultUrl = data.data?.generated?.[0];
        if (!resultUrl) {
            return { kind: 'error', statusCode: 502, message: 'Magnific (Freepik) completed without a result image.' };
        }
        return fetchResultAsDataUrl(resultUrl);
    }
    if (status === 'FAILED') {
        return { kind: 'error', statusCode: 502, message: 'Magnific (Freepik) reported the task failed.' };
    }
    return { kind: 'task', taskId };
};

// --- Topaz Labs — synchronous multipart, returns image bytes ---

const runTopaz = async (job: UpscaleJobRequest, apiKey: string): Promise<UpscaleJobResult> => {
    if (!job.sourceWidth || !job.sourceHeight) {
        return { kind: 'error', statusCode: 400, message: 'Topaz upscaling needs the source image dimensions.' };
    }
    const { buffer, mime } = dataUrlToBuffer(job.image);
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(buffer)], { type: mime }), 'source.png');
    form.append('output_width', String(Math.round(job.sourceWidth * job.scale)));
    form.append('output_height', String(Math.round(job.sourceHeight * job.scale)));

    const response = await fetch('https://api.topazlabs.com/image/v1/enhance', {
        method: 'POST',
        headers: {
            'X-API-Key': apiKey,
            Accept: 'image/jpeg',
        },
        body: form,
    });
    if (!response.ok) {
        return readUpstreamError(response, 'Topaz Labs');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESULT_BYTES) {
        return { kind: 'error', statusCode: 502, message: 'The upscaled result is larger than the supported limit.' };
    }
    const resultMime = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    return { kind: 'image', image: `data:${resultMime};base64,${bytes.toString('base64')}` };
};

// --- Claid.ai — synchronous JSON edit ---

const runClaid = async (job: UpscaleJobRequest, apiKey: string): Promise<UpscaleJobResult> => {
    const response = await fetch('https://api.claid.ai/v1-beta1/image/edit', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            input: job.image,
            operations: {
                resizing: { fit: 'bounds', width: `${job.scale * 100}%` },
                restorations: { upscale: 'smart_enhance' },
            },
            output: { format: 'png' },
        }),
    });
    if (!response.ok) {
        return readUpstreamError(response, 'Claid.ai');
    }
    const data = await response.json() as { data?: { output?: { tmp_url?: string } } };
    const resultUrl = data.data?.output?.tmp_url;
    if (!resultUrl) {
        return { kind: 'error', statusCode: 502, message: 'Claid.ai returned no result image.' };
    }
    return fetchResultAsDataUrl(resultUrl);
};

export const runUpscaleJob = async (job: UpscaleJobRequest, apiKey: string): Promise<UpscaleJobResult> => {
    switch (job.provider) {
        case 'fal': return runFal(job, apiKey);
        case 'replicate': return runReplicate(job, apiKey);
        case 'freepik': return runFreepik(job, apiKey);
        case 'topaz': return runTopaz(job, apiKey);
        case 'claid': return runClaid(job, apiKey);
        default:
            return { kind: 'error', statusCode: 400, message: `Unknown upscale provider: ${job.provider}` };
    }
};

export const pollUpscaleTask = async (provider: string, taskId: string, apiKey: string): Promise<UpscaleJobResult> => {
    switch (provider) {
        case 'replicate': return pollReplicate(taskId, apiKey);
        case 'freepik': return pollFreepik(taskId, apiKey);
        default:
            return { kind: 'error', statusCode: 400, message: `Provider ${provider} has no polling flow.` };
    }
};
