import { extractApiErrorMessage, parseApiResponse } from '@/lib/apiErrorParsing';

import type { BackgroundJob, BackgroundJobRequest } from '@/types';

type RetriedJob = Partial<BackgroundJob> & {
    id: string;
    status: BackgroundJob['status'];
    type: BackgroundJob['type'];
};

export type CancelBackgroundJobResult = {
    cancelledRemotely: boolean;
    message: string;
};

function sanitizeApiKey(value: string) {
    return value.replace(/Bearer /gi, '').replace(/["']/g, '').trim();
}

function resolveJobApiKey(job: BackgroundJob, provider: BackgroundJobRequest['provider']) {
    const directKey = typeof job.apiKey === 'string' ? job.apiKey : '';
    const storedKey = typeof window !== 'undefined' ? (localStorage.getItem(`${provider}_api_key`) || '') : '';
    const apiKey = sanitizeApiKey(directKey || storedKey);

    if (!apiKey) {
        throw new Error(`Missing API key for ${provider}. Configure it in Settings and try again.`);
    }

    return apiKey;
}

export function supportsRemoteBackgroundJobCancel(job: BackgroundJob) {
    return job.request?.provider === 'meshy';
}

function inferImageExtension(url: string) {
    const lowered = url.toLowerCase();

    if (lowered.includes('image/jpeg') || lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) {
        return 'jpg';
    }

    if (lowered.includes('image/webp') || lowered.endsWith('.webp')) {
        return 'webp';
    }

    return 'png';
}

async function buildTripoImageBody(imageUrl: string, apiKey: string) {
    if (!imageUrl.startsWith('data:')) {
        return {
            type: 'image_to_model',
            file: {
                type: inferImageExtension(imageUrl),
                url: imageUrl,
            },
        };
    }

    const uploadBlob = await fetch(imageUrl).then((response) => response.blob());
    const fileExtension = inferImageExtension(uploadBlob.type || imageUrl);
    const formData = new FormData();
    formData.append('file', uploadBlob, `image.${fileExtension}`);

    const uploadRes = await fetch('/api/ai/tripo/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
    });

    const { data: uploadData, responseText } = await parseApiResponse(uploadRes);
    if (uploadData?.code === 0 && typeof uploadData?.data === 'object' && uploadData.data && 'image_token' in uploadData.data) {
        const imageToken = (uploadData.data as { image_token?: string }).image_token;
        if (typeof imageToken === 'string' && imageToken.trim().length > 0) {
            return {
                type: 'image_to_model',
                file: {
                    type: fileExtension,
                    file_token: imageToken,
                },
            };
        }
    }

    throw new Error(extractApiErrorMessage({
        data: uploadData,
        responseText,
        status: uploadRes.status,
        statusText: uploadRes.statusText,
        fallback: 'Failed to upload image to Tripo for retry.',
    }));
}

async function retryMeshyJob(job: BackgroundJob, request: Extract<BackgroundJobRequest, { provider: 'meshy' }>): Promise<RetriedJob> {
    const apiKey = resolveJobApiKey(job, request.provider);
    const endpoint = request.mode === 'text' ? 'text-to-3d' : 'image-to-3d';
    const body = request.mode === 'text'
        ? {
            mode: 'preview',
            prompt: request.prompt,
            art_style: 'realistic',
            ai_model: 'meshy-4',
            topology: 'quad',
            should_remesh: true,
        }
        : {
            image_url: request.imageUrl,
            enable_pbr: true,
            should_texture: true,
            should_remesh: true,
        };

    const res = await fetch(`/api/ai/meshy?endpoint=${endpoint}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const { data, responseText } = await parseApiResponse(res);
    const taskId =
        (typeof data?.result === 'string' && data.result.trim().length > 0 ? data.result : null)
        || (typeof data?.id === 'string' && data.id.trim().length > 0 ? data.id : null);

    if (!taskId) {
        throw new Error(extractApiErrorMessage({
            data,
            responseText,
            status: res.status,
            statusText: res.statusText,
            fallback: 'Meshy retry failed to return a task id.',
        }));
    }

    return {
        id: taskId,
        type: request.mode === 'text' ? 'text-to-3d' : 'image-to-3d',
        provider: request.provider,
        status: 'IN_PROGRESS',
        prompt: request.mode === 'text' ? request.prompt : 'Image to 3D',
        createdAt: Date.now(),
        apiKey,
        request,
    };
}

async function retryTripoJob(job: BackgroundJob, request: Extract<BackgroundJobRequest, { provider: 'tripo' }>): Promise<RetriedJob> {
    const apiKey = resolveJobApiKey(job, request.provider);
    const body = request.mode === 'text'
        ? {
            type: 'text_to_model',
            prompt: request.prompt,
        }
        : await buildTripoImageBody(request.imageUrl, apiKey);

    const res = await fetch('/api/ai/tripo', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const { data, responseText } = await parseApiResponse(res);
    if (!(data?.code === 0 && typeof data?.data === 'object' && data.data && 'task_id' in data.data)) {
        throw new Error(extractApiErrorMessage({
            data,
            responseText,
            status: res.status,
            statusText: res.statusText,
            fallback: 'Tripo retry failed to return a task id.',
        }));
    }

    const taskId = (data.data as { task_id?: string }).task_id;
    if (typeof taskId !== 'string' || taskId.trim().length === 0) {
        throw new Error('Tripo retry failed to return a task id.');
    }

    return {
        id: taskId,
        type: request.mode === 'text' ? 'text-to-3d' : 'image-to-3d',
        provider: request.provider,
        status: 'IN_PROGRESS',
        prompt: request.mode === 'text' ? request.prompt : 'Image to 3D',
        createdAt: Date.now(),
        apiKey,
        request,
    };
}

async function retryHitemsJob(job: BackgroundJob, request: Extract<BackgroundJobRequest, { provider: 'hitems' }>): Promise<RetriedJob> {
    const apiKey = resolveJobApiKey(job, request.provider);
    const appId = typeof window !== 'undefined' ? sanitizeApiKey(localStorage.getItem('hitems_appid') || '') : '';
    const multiImageUrls = request.extraImageUrls && request.extraImageUrls.length > 0
        ? [request.imageUrl, ...request.extraImageUrls]
        : undefined;

    const res = await fetch('/api/ai/hitems', {
        method: 'POST',
        headers: {
            Authorization: apiKey.includes(':') ? apiKey : `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(appId ? { Appid: appId } : {}),
        },
        body: JSON.stringify({
            imageUrl: request.imageUrl,
            multiImageUrls,
            multi_images_bit: request.multiImagesBit,
            model: request.model,
            request_type: request.requestType,
            resolution: request.resolution,
            format: request.format,
            face: request.face,
            mesh_url: request.meshUrl,
            pbr: request.pbr === undefined ? undefined : (request.pbr ? '1' : '0'),
        }),
    });

    const { data, responseText } = await parseApiResponse(res);
    const nestedTaskId = (() => {
        if (!data?.data || typeof data.data !== 'object') return null;
        const taskIdCandidate = (data.data as Record<string, unknown>).task_id;
        return typeof taskIdCandidate === 'string' && taskIdCandidate.trim().length > 0 ? taskIdCandidate : null;
    })();
    const taskId = nestedTaskId || (typeof data?.task_id === 'string' && data.task_id.trim().length > 0 ? data.task_id : null);

    if (!taskId) {
        throw new Error(extractApiErrorMessage({
            data,
            responseText,
            status: res.status,
            statusText: res.statusText,
            fallback: 'Hitems retry failed to return a task id.',
        }));
    }

    return {
        id: taskId,
        type: 'image-to-3d',
        provider: request.provider,
        status: 'IN_PROGRESS',
        prompt: `${request.model} (${request.resolution})`,
        createdAt: Date.now(),
        apiKey,
        request,
    };
}

async function retryStabilityJob(job: BackgroundJob, request: Extract<BackgroundJobRequest, { provider: 'stability' }>): Promise<RetriedJob> {
    const apiKey = resolveJobApiKey(job, request.provider);
    const blobInfo = await fetch(request.imageUrl).then((response) => response.blob());
    const formData = new FormData();
    formData.append('image', blobInfo);
    formData.append('prompt', request.prompt || '');
    formData.append('output_format', 'png');

    const res = await fetch(`/api/ai/stability/upscale?type=${request.upscaleType}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
    });

    const data = await res.json();
    if (!data.success) {
        throw new Error(typeof data.message === 'string' ? data.message : 'Stability retry failed.');
    }

    if (data.status === 'IN_PROGRESS' && typeof data.id === 'string' && data.id.trim().length > 0) {
        return {
            id: data.id,
            type: 'stability-upscale',
            provider: request.provider,
            status: 'IN_PROGRESS',
            createdAt: Date.now(),
            apiKey,
            prompt: request.prompt,
            request,
        };
    }

    if (typeof data.image === 'string' && data.image.trim().length > 0) {
        return {
            id: `${job.id}-retry-${Date.now()}`,
            type: 'stability-upscale',
            provider: request.provider,
            status: 'SUCCEEDED',
            createdAt: Date.now(),
            apiKey,
            prompt: request.prompt,
            request,
            resultUrl: `data:image/png;base64,${data.image}`,
        };
    }

    throw new Error('Stability retry completed without a usable result.');
}

async function cancelMeshyJob(
    job: BackgroundJob,
    request: Extract<BackgroundJobRequest, { provider: 'meshy' }>,
): Promise<CancelBackgroundJobResult> {
    const apiKey = resolveJobApiKey(job, request.provider);
    const endpoint = request.mode === 'text' ? 'text-to-3d' : 'image-to-3d';
    const res = await fetch(`/api/ai/meshy?endpoint=${endpoint}/${encodeURIComponent(job.id)}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    const { data, responseText } = await parseApiResponse(res);
    if (!res.ok) {
        throw new Error(extractApiErrorMessage({
            data,
            responseText,
            status: res.status,
            statusText: res.statusText,
            fallback: `Failed to cancel Meshy job ${job.id}.`,
        }));
    }

    return {
        cancelledRemotely: true,
        message: 'Cancelled remotely by user.',
    };
}

export async function retryBackgroundJob(job: BackgroundJob): Promise<RetriedJob> {
    if (!job.request) {
        throw new Error('This job does not have enough saved request data to retry.');
    }

    const provider = job.request.provider;

    switch (provider) {
        case 'meshy':
            return retryMeshyJob(job, job.request);
        case 'tripo':
            return retryTripoJob(job, job.request);
        case 'hitems':
            return retryHitemsJob(job, job.request);
        case 'stability':
            return retryStabilityJob(job, job.request);
        default:
            throw new Error(`Retry is not implemented for provider ${provider}.`);
    }
}

export async function cancelBackgroundJob(job: BackgroundJob): Promise<CancelBackgroundJobResult> {
    if (!job.request) {
        return {
            cancelledRemotely: false,
            message: 'Tracking stopped by user.',
        };
    }

    const provider = job.request.provider;

    switch (provider) {
        case 'meshy':
            return cancelMeshyJob(job, job.request);
        case 'tripo':
        case 'hitems':
        case 'stability':
            return {
                cancelledRemotely: false,
                message: 'Tracking stopped by user.',
            };
        default:
            throw new Error(`Cancel is not implemented for provider ${provider}.`);
    }
}