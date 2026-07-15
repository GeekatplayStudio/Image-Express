import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { placeAtViewportCenter } from '@/lib/canvas-placement';

import type { BackgroundJob, ThreeDGroup, ThreeDImage } from '@/types';
import { persistAssetToLibrary } from '@/lib/assetPersistence';

type UseBackgroundJobPollingArgs = {
    backgroundJobs: BackgroundJob[];
    setBackgroundJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
    canvas: fabric.Canvas | null;
    user: string;
};

export function useBackgroundJobPolling({
    backgroundJobs,
    setBackgroundJobs,
    canvas,
    user,
}: UseBackgroundJobPollingArgs) {
    const backgroundJobsRef = useRef<BackgroundJob[]>([]);
    const pollTimersRef = useRef<Map<string, number>>(new Map());
    const pollIntervalsRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        backgroundJobsRef.current = backgroundJobs;
    }, [backgroundJobs]);

    useEffect(() => {
        const activeJobs = backgroundJobs.filter((job) => job.status === 'PENDING' || job.status === 'IN_PROGRESS');
        if (activeJobs.length === 0) return;

        const checkJobStatus = async (job: BackgroundJob) => {
            if (!job.id) return;
            if (!job.apiKey) {
                const updatedJob: BackgroundJob = {
                    ...job,
                    status: 'FAILED',
                    error: 'Missing API key for job polling. Re-enter key in Settings and recover this job ID.',
                };
                setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));
                return { status: 'FAILED', progress: job.progress || 0, progressed: false };
            }
            try {
                type TripoOutput = {
                    model?: string;
                    pbr_model?: string;
                    base_model?: string;
                    rendered_image?: string;
                    render_image?: string;
                };

                type TripoData = {
                    status: string;
                    progress: number;
                    output?: TripoOutput;
                };

                type ApiResponse = {
                    status?: string;
                    progress?: number;
                    model_urls?: { glb: string };
                    thumbnail_url?: string;
                    data?: TripoData;
                    code?: number;
                };

                let data: ApiResponse | null = null;
                let status: BackgroundJob['status'] = job.status;
                let progress = job.progress || 0;
                const previousProgress = job.progress || 0;
                let resultUrl = job.resultUrl;
                let thumbnailUrl = job.thumbnailUrl;
                let errorDetail = job.error;

                if (job.provider === 'stability') {
                    const res = await fetch(`/api/ai/stability/upscale/poll?id=${job.id}`, { headers: { Authorization: `Bearer ${job.apiKey}` } });
                    if (!res.ok) return;
                    const json = await res.json();
                    if (json.status === 'SUCCEEDED') {
                        status = 'SUCCEEDED';
                        resultUrl = `data:image/png;base64,${json.image}`;
                    } else if (json.status === 'IN_PROGRESS') {
                        status = 'IN_PROGRESS';
                    } else {
                        status = 'FAILED';
                    }
                } else if (job.provider === 'tripo') {
                    const res = await fetch(`/api/ai/tripo/${job.id}`, { headers: { Authorization: `Bearer ${job.apiKey}` } });
                    if (!res.ok) {
                        const text = await res.text().catch(() => '');
                        status = 'FAILED';
                        errorDetail = `Tripo poll failed (${res.status}). ${text || res.statusText || 'No details returned.'}`.trim();
                        const updatedJob: BackgroundJob = { ...job, status, error: errorDetail, progress };
                        setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));
                        return { status, progress, progressed: false };
                    }
                    const json = (await res.json()) as ApiResponse;
                    if (json.data) {
                        const tData = json.data;
                        if (tData.status === 'success') status = 'SUCCEEDED';
                        else if (tData.status === 'cancelled') {
                            status = 'CANCELLED';
                            errorDetail = 'Tripo task cancelled.';
                        } else if (tData.status === 'failed') {
                            status = 'FAILED';
                            errorDetail = `Tripo task ${tData.status}.`;
                        } else status = 'IN_PROGRESS';
                        progress = tData.progress;
                        resultUrl = tData.output?.model || tData.output?.pbr_model || tData.output?.base_model;
                        thumbnailUrl = tData.output?.rendered_image || tData.output?.render_image;
                    } else if (json.code !== undefined && json.code !== 0) {
                        status = 'FAILED';
                        errorDetail = `Tripo error code: ${json.code}.`;
                    }
                } else if (job.provider === 'hitems') {
                    const appId = typeof window !== 'undefined' ? localStorage.getItem('hitems_appid') : null;
                    const rawKey = (job.apiKey || '').replace(/Bearer /gi, '').replace(/["']/g, '').trim();
                    const hitemsAuthHeader = rawKey.includes(':') ? rawKey : `Bearer ${rawKey}`;
                    const headers: Record<string, string> = { Authorization: hitemsAuthHeader };
                    if (appId) headers.Appid = appId;
                    const hitemsQueryPath = job.type === 'hitems-relief'
                        ? `/api/ai/hitems/depth/${job.id}`
                        : job.type === 'hitems-split'
                            ? `/api/ai/hitems/split/${job.id}`
                            : `/api/ai/hitems/${job.id}`;
                    const res = await fetch(hitemsQueryPath, { headers });
                    if (!res.ok) {
                        const payload = await res.json().catch(() => null) as
                            | { message?: string; msg?: string; detail?: string; error?: string }
                            | null;
                        const reason = payload?.message || payload?.msg || payload?.detail || payload?.error || `Hitem poll failed (${res.status}).`;
                        status = 'FAILED';
                        errorDetail = reason;
                        const updatedJob: BackgroundJob = { ...job, status, error: errorDetail, progress };
                        setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));
                        return { status, progress, progressed: false };
                    }
                    const json = (await res.json()) as {
                        code?: number | string;
                        message?: string;
                        msg?: string;
                        data?: {
                            task_status?: number;
                            state?: string;
                            task_msg?: string;
                            message?: string;
                            process_pct?: number;
                            progress?: number | string;
                            process?: number | string;
                            percentage?: number | string;
                            percent?: number | string;
                            task_result?: {
                                model_url?: string;
                                render_url?: string;
                                url?: string;
                                cover_url?: string;
                            };
                            url?: string;
                            model_url?: string;
                            cover_url?: string;
                            render_url?: string;
                        };
                    };
                    const hitemMsg = json.data?.task_msg || json.data?.message || json.message || json.msg;
                    const statusCode = json.data?.task_status;
                    const state = typeof json.data?.state === 'string' ? json.data.state.toLowerCase() : '';
                    const codeText = json.code !== undefined ? `${json.code}` : undefined;
                    const isOkCode = codeText === undefined || codeText === '200' || codeText === '0';
                    const parseProgressValue = (value: unknown) => {
                        if (value === null || value === undefined) return null;
                        const numeric = typeof value === 'number' ? value : Number(value);
                        if (!Number.isFinite(numeric)) return null;
                        if (numeric <= 1) return Math.max(0, Math.min(100, Math.round(numeric * 100)));
                        return Math.max(0, Math.min(100, Math.round(numeric)));
                    };
                    const progressCandidates = [
                        json.data?.process_pct,
                        json.data?.progress,
                        json.data?.process,
                        json.data?.percentage,
                        json.data?.percent,
                    ];
                    const parsedProgress = progressCandidates.map(parseProgressValue).find((value): value is number => value !== null);

                    if (statusCode === 4 || state === 'success') status = 'SUCCEEDED';
                    else if (statusCode === -1 || state === 'failed') {
                        status = 'FAILED';
                        const baseError = hitemMsg || `Hitem task failed${statusCode !== undefined ? ` (status ${statusCode})` : ''}.`;
                        errorDetail = /login expired|token expired|invalid token/i.test(baseError)
                            ? `${baseError} If you are using Bearer token, refresh it. For auto-refresh use ak:sk key format.`
                            : baseError;
                    } else if (typeof hitemMsg === 'string' && /login expired|token expired|invalid token|expired/i.test(hitemMsg)) {
                        status = 'FAILED';
                        errorDetail = `${hitemMsg} If you are using Bearer token, refresh it. For auto-refresh use ak:sk key format.`;
                    } else if (statusCode !== undefined || ['created', 'queueing', 'processing', 'pending', 'running'].includes(state) || isOkCode) {
                        status = 'IN_PROGRESS';
                    } else if (!isOkCode) {
                        status = 'FAILED';
                        errorDetail = hitemMsg || `Hitem response code ${codeText}.`;
                    } else status = 'IN_PROGRESS';

                    if (parsedProgress !== undefined) {
                        progress = parsedProgress;
                    } else if (status === 'IN_PROGRESS') {
                        if (state === 'created') progress = Math.max(progress, 5);
                        else if (state === 'queueing') progress = Math.max(progress, 15);
                        else if (state === 'processing' || state === 'running') progress = Math.max(progress, 30);
                    }
                    if (status === 'SUCCEEDED') progress = 100;
                    const resolvedModelUrl =
                        json.data?.task_result?.model_url ||
                        json.data?.task_result?.url ||
                        json.data?.model_url ||
                        json.data?.url;
                    resultUrl = resolvedModelUrl || resultUrl;
                    thumbnailUrl =
                        json.data?.task_result?.render_url ||
                        json.data?.task_result?.cover_url ||
                        json.data?.render_url ||
                        json.data?.cover_url ||
                        thumbnailUrl;
                    if (status !== 'FAILED' && resolvedModelUrl) {
                        status = 'SUCCEEDED';
                        progress = 100;
                    }
                } else {
                    const endpoint = job.type === 'image-to-3d' ? 'image-to-3d' : 'text-to-3d';
                    const res = await fetch(`/api/ai/meshy?endpoint=${endpoint}/${job.id}`, { headers: { Authorization: `Bearer ${job.apiKey}` } });
                    if (!res.ok) {
                        const text = await res.text().catch(() => '');
                        status = 'FAILED';
                        errorDetail = `Meshy poll failed (${res.status}). ${text || res.statusText || 'No details returned.'}`.trim();
                        const updatedJob: BackgroundJob = { ...job, status, error: errorDetail, progress };
                        setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));
                        return { status, progress, progressed: false };
                    }
                    data = (await res.json()) as ApiResponse;
                    const meshyStatus = typeof data.status === 'string' ? data.status.toUpperCase() : '';
                    if (meshyStatus === 'SUCCEEDED') status = 'SUCCEEDED';
                    else if (meshyStatus === 'CANCELLED' || meshyStatus === 'CANCELED') {
                        status = 'CANCELLED';
                        errorDetail = 'Meshy task cancelled.';
                    } else if (meshyStatus === 'FAILED' || meshyStatus === 'EXPIRED') {
                        status = 'FAILED';
                        errorDetail = `Meshy task ${meshyStatus.toLowerCase()}.`;
                    } else status = 'IN_PROGRESS';
                    if (data.progress !== undefined) progress = data.progress;
                    resultUrl = data.model_urls?.glb;
                    thumbnailUrl = data.thumbnail_url;

                    if (status === 'SUCCEEDED' && job.type === 'text-to-3d' && job.provider === 'meshy' && (!job.stage || job.stage === 'preview')) {
                        console.log('Preview finished. Starting refinement for textures...');
                        try {
                            const refineBody = {
                                mode: 'refine',
                                preview_task_id: job.id,
                                enable_pbr: true,
                                ai_model: 'meshy-4',
                            };
                            const refineRes = await fetch('/api/ai/meshy?endpoint=text-to-3d', {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${job.apiKey}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify(refineBody),
                            });
                            const refineJson = await refineRes.json();
                            const refineId = refineJson.result;

                            if (refineId) {
                                const updatedJob: BackgroundJob = {
                                    ...job,
                                    id: refineId,
                                    stage: 'refining',
                                    status: 'IN_PROGRESS',
                                    progress: 0,
                                };
                                setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));
                                return;
                            } else {
                                console.error('Refine failed to start:', refineJson);
                            }
                        } catch (error) {
                            console.error('Refine launch error', error);
                        }
                    }
                }

                if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED') {
                    const updatedJob: BackgroundJob = {
                        ...job,
                        status,
                        resultUrl,
                        thumbnailUrl,
                        progress: status === 'SUCCEEDED' ? 100 : progress,
                        error: status === 'FAILED'
                            ? (errorDetail || 'Failed to process.')
                            : status === 'CANCELLED'
                                ? (errorDetail || 'Tracking stopped by user.')
                                : undefined,
                    };
                    setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));
                    if (status === 'SUCCEEDED' && resultUrl) {
                        let filename = (job.prompt || 'generated').slice(0, 15).replace(/[^a-z0-9]/gi, '_');
                        const urlMatch = resultUrl.match(/\.([a-z0-9]+)(?:$|[?#])/i);
                        const extension = (urlMatch?.[1] || 'glb').toLowerCase();
                        if (!filename.toLowerCase().endsWith(`.${extension}`)) filename += `.${extension}`;
                        try {
                            await persistAssetToLibrary({
                                source: resultUrl,
                                filename,
                                type: 'models',
                                category: 'uploads',
                                owner: user,
                            });
                        } catch (error) {
                            console.error('Failed to auto-save asset', error);
                        }

                        const addFallbackPlaceholder = () => {
                            if (!canvas) return;
                            const group = new fabric.Group([], { left: 150, top: 150, subTargetCheck: true, interactive: true });
                            const box = new fabric.Rect({ width: 100, height: 100, fill: '#3b82f6', rx: 10, ry: 10 });
                            const text = new fabric.IText('3D', { fontSize: 30, fill: 'white', left: 30, top: 35, fontFamily: 'sans-serif', fontWeight: 'bold' });
                            group.add(box);
                            group.add(text);
                            const threeDGroup = group as ThreeDGroup;
                            threeDGroup.is3DModel = true;
                            threeDGroup.modelUrl = resultUrl;
                            canvas.add(threeDGroup);
                            canvas.setActiveObject(threeDGroup);
                            canvas.requestRenderAll();
                        };

                        if (canvas) {
                            if (thumbnailUrl) {
                                fabric.FabricImage.fromURL(thumbnailUrl, { crossOrigin: 'anonymous' })
                                    .then((img) => {
                                        if (!img) throw new Error('Image loaded but null');
                                        img.scaleToWidth(200);
                                        placeAtViewportCenter(canvas, img);
                                        const threeDImg = img as ThreeDImage;
                                        threeDImg.is3DModel = true;
                                        threeDImg.modelUrl = resultUrl;
                                        canvas.add(threeDImg);
                                        canvas.setActiveObject(threeDImg);
                                        canvas.requestRenderAll();
                                    })
                                    .catch(() => {
                                        addFallbackPlaceholder();
                                    });
                            } else {
                                addFallbackPlaceholder();
                            }
                        }
                    }
                } else if (progress !== job.progress || status !== job.status) {
                    setBackgroundJobs((prev) =>
                        prev.map((p) => (p.id === job.id ? { ...p, progress, status, error: status === 'IN_PROGRESS' ? undefined : p.error } : p))
                    );
                }
                return { status, progress, progressed: progress > previousProgress };
            } catch (error) {
                const reason = error instanceof Error ? error.message : 'Unexpected polling error.';
                const updatedJob: BackgroundJob = { ...job, status: 'FAILED', error: reason, progress: job.progress };
                setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));
                return { status: 'FAILED', progress: job.progress || 0, progressed: false };
            }
        };

        const getJobById = (id: string) => backgroundJobsRef.current.find((job) => job.id === id);

        const schedulePoll = (jobId: string) => {
            const currentJob = getJobById(jobId);
            if (!currentJob) return;
            if (currentJob.status !== 'PENDING' && currentJob.status !== 'IN_PROGRESS') return;

            const interval = pollIntervalsRef.current.get(jobId) ?? 2000;
            const timerId = window.setTimeout(async () => {
                const latest = getJobById(jobId);
                if (!latest || (latest.status !== 'PENDING' && latest.status !== 'IN_PROGRESS')) {
                    const existing = pollTimersRef.current.get(jobId);
                    if (existing) window.clearTimeout(existing);
                    pollTimersRef.current.delete(jobId);
                    pollIntervalsRef.current.delete(jobId);
                    return;
                }

                const result = await checkJobStatus(latest);
                if (result?.progressed) {
                    pollIntervalsRef.current.set(jobId, 2000);
                } else {
                    pollIntervalsRef.current.set(jobId, Math.min(interval * 1.5, 10000));
                }

                const after = getJobById(jobId);
                if (after && (after.status === 'PENDING' || after.status === 'IN_PROGRESS')) {
                    schedulePoll(jobId);
                } else {
                    const existing = pollTimersRef.current.get(jobId);
                    if (existing) window.clearTimeout(existing);
                    pollTimersRef.current.delete(jobId);
                    pollIntervalsRef.current.delete(jobId);
                }
            }, interval);

            pollTimersRef.current.set(jobId, timerId);
        };

        activeJobs.forEach((job) => {
            if (!pollTimersRef.current.has(job.id)) {
                pollIntervalsRef.current.set(job.id, pollIntervalsRef.current.get(job.id) ?? 2000);
                schedulePoll(job.id);
            }
        });

        for (const [id, timer] of pollTimersRef.current) {
            const job = getJobById(id);
            if (!job || (job.status !== 'PENDING' && job.status !== 'IN_PROGRESS')) {
                window.clearTimeout(timer);
                pollTimersRef.current.delete(id);
                pollIntervalsRef.current.delete(id);
            }
        }
    }, [backgroundJobs, canvas, user, setBackgroundJobs]);

    useEffect(() => {
        const pollTimers = pollTimersRef.current;
        const pollIntervals = pollIntervalsRef.current;

        return () => {
            for (const timer of pollTimers.values()) {
                window.clearTimeout(timer);
            }
            pollTimers.clear();
            pollIntervals.clear();
        };
    }, []);
}
