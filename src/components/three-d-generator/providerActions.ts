'use client';

import { extractApiErrorMessage, parseApiResponse } from '@/lib/apiErrorParsing';

export const SUPPORTED_PROVIDERS = ['meshy', 'tripo', 'hitems'];

interface ToastShape {
    title: string;
    description: string;
    variant: 'warning' | 'success' | 'destructive';
}

interface CreateProviderActionsArgs {
    selectedProvider: string;
    prompt: string;
    mode: 'text' | 'image';
    initialImage?: string;
    runSingleFlight: <T>(action: () => Promise<T>) => Promise<T | undefined>;
    getSelectedKey: () => string;
    isMissingSanitizedKey: (value: string) => boolean;
    toast: (payload: ToastShape) => void;
    setIsLoading: (value: boolean) => void;
    onStartBackgroundJob?: (job: Partial<import('@/types').BackgroundJob>) => void;
    generateHitems: (key: string) => Promise<void>;
}

export const createProviderActions = ({
    selectedProvider,
    prompt,
    mode,
    initialImage,
    runSingleFlight,
    getSelectedKey,
    isMissingSanitizedKey,
    toast,
    setIsLoading,
    onStartBackgroundJob,
    generateHitems,
}: CreateProviderActionsArgs) => {
    const generateMeshy = async (key: string) => {
        let body: Record<string, unknown> = {};
        let endpoint = '';

        if (mode === 'text') {
            if (!prompt) {
                toast({ title: 'Missing prompt', description: 'Please enter a prompt.', variant: 'warning' });
                setIsLoading(false);
                return;
            }
            endpoint = 'text-to-3d';
            body = {
                mode: 'preview',
                prompt,
                art_style: 'realistic',
                ai_model: 'meshy-4',
                topology: 'quad',
                should_remesh: true,
            };
        } else {
            if (!initialImage) {
                setIsLoading(false);
                return;
            }
            endpoint = 'image-to-3d';
            body = {
                image_url: initialImage,
                enable_pbr: true,
                should_texture: true,
                should_remesh: true,
            };
        }

        const res = await fetch(`/api/ai/meshy?endpoint=${endpoint}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const { data, responseText } = await parseApiResponse(res);
        const taskId =
            (typeof data?.result === 'string' && data.result.trim().length > 0 ? data.result : null)
            || (typeof data?.id === 'string' && data.id.trim().length > 0 ? data.id : null);

        if (taskId) {
            onStartBackgroundJob?.({
                id: taskId,
                type: mode === 'text' ? 'text-to-3d' : 'image-to-3d',
                provider: 'meshy',
                status: 'IN_PROGRESS',
                prompt: mode === 'text' ? prompt : 'Image to 3D',
                createdAt: Date.now(),
                apiKey: key,
            });
            return;
        }

        const reason = extractApiErrorMessage({
            data,
            responseText,
            status: res.status,
            statusText: res.statusText,
            fallback: res.ok ? 'Meshy request succeeded but did not return a task id' : 'Meshy request failed',
        });
        toast({ title: 'Generation failed', description: reason, variant: 'destructive' });
        setIsLoading(false);
    };

    const generateTripo = async (key: string) => {
        let body: Record<string, unknown> = {};

        if (mode === 'text') {
            if (!prompt) {
                toast({ title: 'Missing prompt', description: 'Please enter a prompt.', variant: 'warning' });
                setIsLoading(false);
                return;
            }
            body = {
                type: 'text_to_model',
                prompt,
            };
        } else {
            if (!initialImage) {
                setIsLoading(false);
                return;
            }

            if (initialImage.startsWith('data:')) {
                try {
                    const fetchRes = await fetch(initialImage);
                    const blob = await fetchRes.blob();
                    const mimeType = blob.type;
                    let fileExt = 'png';
                    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') fileExt = 'jpg';
                    else if (mimeType === 'image/webp') fileExt = 'webp';

                    const formData = new FormData();
                    formData.append('file', blob, `image.${fileExt}`);

                    const uploadRes = await fetch('/api/ai/tripo/upload', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${key}` },
                        body: formData,
                    });

                    const { data: uploadJson, responseText: uploadResponseText } = await parseApiResponse(uploadRes);
                    if (uploadJson?.code === 0 && typeof uploadJson?.data === 'object' && uploadJson.data && 'image_token' in uploadJson.data) {
                        const uploadData = uploadJson.data as { image_token?: string };
                        body = {
                            type: 'image_to_model',
                            file: { type: fileExt, file_token: uploadData.image_token },
                        };
                    } else {
                        const uploadReason = extractApiErrorMessage({
                            data: uploadJson,
                            responseText: uploadResponseText,
                            status: uploadRes.status,
                            statusText: uploadRes.statusText,
                            fallback: 'Failed to upload image to Tripo',
                        });
                        toast({ title: 'Upload failed', description: uploadReason, variant: 'destructive' });
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Failed to process image for upload', error);
                    toast({ title: 'Upload failed', description: 'Failed to process upload.', variant: 'destructive' });
                    setIsLoading(false);
                    return;
                }
            } else {
                let fileExt = 'png';
                if (initialImage.toLowerCase().endsWith('.jpg') || initialImage.toLowerCase().endsWith('.jpeg')) fileExt = 'jpg';
                else if (initialImage.toLowerCase().endsWith('.webp')) fileExt = 'webp';

                body = {
                    type: 'image_to_model',
                    file: {
                        type: fileExt,
                        url: initialImage,
                    },
                };
            }
        }

        const res = await fetch('/api/ai/tripo', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const { data, responseText } = await parseApiResponse(res);
        if (data?.code === 0 && typeof data?.data === 'object' && data.data && 'task_id' in data.data) {
            const tripoData = data.data as { task_id?: string };
            if (typeof tripoData.task_id === 'string' && tripoData.task_id.trim().length > 0) {
                onStartBackgroundJob?.({
                    id: tripoData.task_id,
                    type: mode === 'text' ? 'text-to-3d' : 'image-to-3d',
                    provider: 'tripo',
                    status: 'IN_PROGRESS',
                    prompt: mode === 'text' ? prompt : 'Image to 3D',
                    createdAt: Date.now(),
                    apiKey: key,
                });
            }
            return;
        }

        const errorMsg = extractApiErrorMessage({
            data,
            responseText,
            status: res.status,
            statusText: res.statusText,
            fallback: res.ok ? 'Tripo request succeeded but did not return a task id' : 'Error starting Tripo generation',
        });
        toast({ title: 'Generation failed', description: errorMsg, variant: 'destructive' });
        setIsLoading(false);
    };

    const handleGenerate = async () => {
        await runSingleFlight(async () => {
            let key = getSelectedKey();
            if (!key) {
                toast({ title: 'Missing API key', description: `Configure API key for ${selectedProvider}.`, variant: 'warning' });
                return;
            }

            key = key.replace(/Bearer /gi, '').replace(/["']/g, '').trim();
            if (isMissingSanitizedKey(key)) {
                toast({ title: 'Missing API key', description: `Configure a valid API key for ${selectedProvider} in Settings.`, variant: 'warning' });
                return;
            }

            setIsLoading(true);
            try {
                if (selectedProvider === 'meshy') {
                    await generateMeshy(key);
                } else if (selectedProvider === 'tripo') {
                    await generateTripo(key);
                } else if (selectedProvider === 'hitems') {
                    if (mode === 'text' || !initialImage) {
                        toast({ title: 'Image required', description: 'Hitem3D currently supports image-to-3D only. Select an image first.', variant: 'warning' });
                        setIsLoading(false);
                        return;
                    }
                    await generateHitems(key);
                } else {
                    toast({ title: 'Coming soon', description: 'Service integration in progress.', variant: 'warning' });
                    setIsLoading(false);
                }
            } catch (error) {
                console.error(error);
                setIsLoading(false);
            }
        });
    };

    return { handleGenerate };
};
