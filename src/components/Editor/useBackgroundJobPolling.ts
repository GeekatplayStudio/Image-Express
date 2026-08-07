import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { placeAtViewportCenter } from '@/lib/canvas-placement';

import type { BackgroundJob, ExtendedFabricObject, ThreeDGroup, ThreeDImage } from '@/types';
import { persistAssetToLibrary } from '@/lib/assetPersistence';
import { renderModelThumbnail } from '@/lib/modelThumbnail';

type UseBackgroundJobPollingArgs = {
    backgroundJobs: BackgroundJob[];
    setBackgroundJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
    canvas: fabric.Canvas | null;
    user: string;
};

const POLL_MIN_INTERVAL_MS = 2000;
const POLL_MAX_INTERVAL_MS = 15_000;
const POLL_HIDDEN_MAX_INTERVAL_MS = 60_000;
const POLL_MAX_CONCURRENT = 3;

type PollOutcome = { status: BackgroundJob['status']; progress: number; progressed: boolean };

export function useBackgroundJobPolling({
    backgroundJobs,
    setBackgroundJobs,
    canvas,
    user,
}: UseBackgroundJobPollingArgs) {
    const backgroundJobsRef = useRef<BackgroundJob[]>([]);
    const pollIntervalsRef = useRef<Map<string, number>>(new Map());
    const nextDueRef = useRef<Map<string, number>>(new Map());
    const checkJobStatusRef = useRef<((job: BackgroundJob) => Promise<PollOutcome | undefined>) | null>(null);
    const wakeSchedulerRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        backgroundJobsRef.current = backgroundJobs;
    }, [backgroundJobs]);

    useEffect(() => {
        const activeJobs = backgroundJobs.filter((job) => job.status === 'PENDING' || job.status === 'IN_PROGRESS');
        if (activeJobs.length === 0) return;

        const checkJobStatus = async (job: BackgroundJob): Promise<PollOutcome | undefined> => {
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
                            if (job.prompt) (threeDGroup as ExtendedFabricObject).name = job.prompt.slice(0, 40);
                            canvas.add(threeDGroup);
                            canvas.setActiveObject(threeDGroup);
                            canvas.requestRenderAll();
                        };

                        const placeImage = (dataUrl: string, crossOrigin?: 'anonymous') => (
                            fabric.FabricImage.fromURL(dataUrl, crossOrigin ? { crossOrigin } : undefined)
                                .then((img) => {
                                    if (!img) throw new Error('Image loaded but null');
                                    if (!canvas) return;
                                    img.scaleToWidth(280);
                                    placeAtViewportCenter(canvas, img);
                                    const threeDImg = img as ThreeDImage;
                                    threeDImg.is3DModel = true;
                                    threeDImg.modelUrl = resultUrl;
                                    if (job.prompt) {
                                        (threeDImg as ExtendedFabricObject).name = job.prompt.slice(0, 40);
                                    }
                                    canvas.add(threeDImg);
                                    canvas.setActiveObject(threeDImg);
                                    canvas.requestRenderAll();
                                })
                        );

                        if (canvas) {
                            // Show the model that actually came back. Render the
                            // returned GLB offscreen so the canvas gets a real
                            // still of the generated geometry; the provider
                            // thumbnail and the "3D" box are only fallbacks for
                            // when the model cannot be rendered here.
                            const canRenderModel = /\.(glb|gltf)(?:$|[?#])/i.test(resultUrl);
                            const renderPromise = canRenderModel
                                ? renderModelThumbnail(resultUrl, resultUrl, 512).then((dataUrl) => placeImage(dataUrl))
                                : Promise.reject(new Error('Not a renderable model URL'));

                            renderPromise.catch(() => {
                                if (!thumbnailUrl) {
                                    addFallbackPlaceholder();
                                    return;
                                }
                                return placeImage(thumbnailUrl, 'anonymous').catch(() => {
                                    addFallbackPlaceholder();
                                });
                            });
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

        // Expose the freshest checkJobStatus (it closes over canvas/user) to
        // the singleton scheduler below.
        checkJobStatusRef.current = checkJobStatus;

        // Register jobs that need polling; the scheduler picks them up on its
        // next wake. New jobs get an immediate first check.
        const now = Date.now();
        for (const job of activeJobs) {
            if (!nextDueRef.current.has(job.id)) {
                nextDueRef.current.set(job.id, now);
                pollIntervalsRef.current.set(job.id, POLL_MIN_INTERVAL_MS);
            }
        }
        // Drop finished/removed jobs from the schedule.
        for (const id of Array.from(nextDueRef.current.keys())) {
            const job = backgroundJobsRef.current.find((entry) => entry.id === id);
            if (!job || (job.status !== 'PENDING' && job.status !== 'IN_PROGRESS')) {
                nextDueRef.current.delete(id);
                pollIntervalsRef.current.delete(id);
            }
        }
        wakeSchedulerRef.current?.();
    }, [backgroundJobs, canvas, user, setBackgroundJobs]);

    /**
     * Singleton scheduler — one timer for ALL jobs instead of a timer chain
     * per job. Behaves like a small worker pool:
     * - at most POLL_MAX_CONCURRENT status requests in flight at once, so ten
     *   queued generations don't fire ten simultaneous requests;
     * - per-job exponential backoff with jitter (fast again on real progress),
     *   so providers aren't hammered in lockstep;
     * - when the tab is hidden, intervals stretch to the background cap and
     *   snap back on return, so an idle tab stops spamming.
     */
    useEffect(() => {
        let disposed = false;
        let timer: number | null = null;
        const inFlight = new Set<string>();

        const jitter = (ms: number) => ms * (0.85 + Math.random() * 0.3);

        const runDueJobs = async () => {
            const now = Date.now();
            const due: string[] = [];
            for (const [id, dueAt] of nextDueRef.current) {
                if (dueAt <= now && !inFlight.has(id)) due.push(id);
            }
            // Oldest-due first: round-robin fairness across providers/jobs.
            due.sort((a, b) => (nextDueRef.current.get(a) ?? 0) - (nextDueRef.current.get(b) ?? 0));

            for (const id of due.slice(0, Math.max(0, POLL_MAX_CONCURRENT - inFlight.size))) {
                const job = backgroundJobsRef.current.find((entry) => entry.id === id);
                if (!job || (job.status !== 'PENDING' && job.status !== 'IN_PROGRESS')) {
                    nextDueRef.current.delete(id);
                    pollIntervalsRef.current.delete(id);
                    continue;
                }
                inFlight.add(id);
                void (async () => {
                    try {
                        const result = await checkJobStatusRef.current?.(job);
                        // undefined means a transient failure (e.g. a non-ok
                        // poll response that didn't fail the job) — keep
                        // polling with backoff rather than abandoning the job.
                        const stillActive = !result
                            || result.status === 'PENDING'
                            || result.status === 'IN_PROGRESS';
                        if (!stillActive) {
                            nextDueRef.current.delete(id);
                            pollIntervalsRef.current.delete(id);
                            return;
                        }
                        const prev = pollIntervalsRef.current.get(id) ?? POLL_MIN_INTERVAL_MS;
                        const hidden = typeof document !== 'undefined' && document.hidden;
                        const cap = hidden ? POLL_HIDDEN_MAX_INTERVAL_MS : POLL_MAX_INTERVAL_MS;
                        const next = result?.progressed
                            ? POLL_MIN_INTERVAL_MS
                            : Math.min(prev * 1.5, cap);
                        pollIntervalsRef.current.set(id, next);
                        nextDueRef.current.set(id, Date.now() + jitter(next));
                    } finally {
                        inFlight.delete(id);
                        schedule();
                    }
                })();
            }
        };

        const schedule = () => {
            if (disposed) return;
            if (timer !== null) {
                window.clearTimeout(timer);
                timer = null;
            }
            if (nextDueRef.current.size === 0) return;

            // Every worker is busy. A job's `nextDue` only moves forward once
            // its request settles, so arming a timer now would compute a
            // negative delay, fire immediately, dispatch nothing (the pool is
            // full), and re-arm at 0ms — a tight CPU spin for the whole poll
            // cycle. Each in-flight job calls schedule() from its `finally`,
            // so doing nothing here is both correct and self-healing.
            if (inFlight.size >= POLL_MAX_CONCURRENT) return;

            const now = Date.now();
            let earliest = Number.POSITIVE_INFINITY;
            for (const [id, dueAt] of nextDueRef.current) {
                // Same reason: an in-flight job's due time is stale until it
                // settles, and it reschedules itself when it does.
                if (inFlight.has(id)) continue;
                if (dueAt < earliest) earliest = dueAt;
            }
            if (earliest === Number.POSITIVE_INFINITY) return;

            timer = window.setTimeout(() => {
                timer = null;
                void runDueJobs();
                schedule();
            }, Math.max(0, Math.min(earliest - now, POLL_MAX_INTERVAL_MS)));
        };

        // Coming back to the tab: forget the stretched background intervals and
        // check everything promptly.
        const onVisible = () => {
            if (document.hidden) return;
            const now = Date.now();
            for (const id of nextDueRef.current.keys()) {
                pollIntervalsRef.current.set(id, POLL_MIN_INTERVAL_MS);
                nextDueRef.current.set(id, now);
            }
            schedule();
        };

        wakeSchedulerRef.current = schedule;
        document.addEventListener('visibilitychange', onVisible);
        schedule();

        return () => {
            disposed = true;
            wakeSchedulerRef.current = null;
            document.removeEventListener('visibilitychange', onVisible);
            if (timer !== null) window.clearTimeout(timer);
        };
    }, []);
}
