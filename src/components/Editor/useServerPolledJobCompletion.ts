'use client';

import { useCallback, useEffect, useRef } from 'react';
import type * as fabric from 'fabric';

import type { BackgroundJob } from '@/types';
import { useQueueStream } from '@/hooks/useQueueStream';
import { materializeCompletedJob } from '@/components/Editor/backgroundJobCompletion';
import type { QueueJobRecord } from '@/lib/server/jobQueue/types';

/**
 * Finishes jobs the *server* polled.
 *
 * Once a task is handed to the queue the browser stops polling it, so nothing
 * in this tab would otherwise notice it completing — the model would never
 * reach the canvas. This listens to the same SSE stream the pipeline rail uses
 * and runs the shared completion path when a handed-off job reaches a terminal
 * state.
 *
 * The completion work itself has to stay client-side: it saves to the library,
 * renders the GLB offscreen and places the result on a Fabric canvas.
 */

type Args = {
    backgroundJobs: BackgroundJob[];
    setBackgroundJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
    canvas: fabric.Canvas | null;
    user: string;
};

export function useServerPolledJobCompletion({
    backgroundJobs,
    setBackgroundJobs,
    canvas,
    user,
}: Args) {
    // Latest values without re-subscribing the stream on every job update.
    // Written in an effect, not during render: a ref mutated in render is not
    // safe under concurrent rendering.
    const jobsRef = useRef(backgroundJobs);
    const canvasRef = useRef(canvas);
    const userRef = useRef(user);
    useEffect(() => {
        jobsRef.current = backgroundJobs;
        canvasRef.current = canvas;
        userRef.current = user;
    }, [backgroundJobs, canvas, user]);

    /**
     * A completed job must be materialised exactly once. SSE re-sends a full
     * snapshot on every reconnect, so without this guard a dropped connection
     * would add the same model to the canvas again.
     */
    const handled = useRef(new Set<string>());

    const apply = useCallback((record: QueueJobRecord) => {
        if (record.kind !== 'remote-poll') return;
        if (record.status !== 'succeeded' && record.status !== 'failed') return;
        if (handled.current.has(record.id)) return;

        const job = jobsRef.current.find((entry) => entry.queueJobId === record.id);
        if (!job) return;
        // Already finished by some other path (e.g. a recovery action).
        if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
            handled.current.add(record.id);
            return;
        }

        handled.current.add(record.id);
        void materializeCompletedJob({
            job,
            outcome: record.status === 'succeeded'
                ? { status: 'SUCCEEDED', progress: 100, resultUrl: record.resultUrl }
                : { status: 'FAILED', progress: job.progress ?? 0, error: record.error },
            canvas: canvasRef.current,
            user: userRef.current,
            setBackgroundJobs,
        });
    }, [setBackgroundJobs]);

    /** Mirror in-flight server progress so the panel keeps moving. */
    const applyProgress = useCallback((record: QueueJobRecord) => {
        if (record.kind !== 'remote-poll' || record.status !== 'running') return;
        const job = jobsRef.current.find((entry) => entry.queueJobId === record.id);
        if (!job) return;
        const percent = Math.round(Math.min(1, Math.max(0, record.progress)) * 100);
        if (percent === job.progress) return;
        setBackgroundJobs((prev) => prev.map((entry) => (
            entry.id === job.id ? { ...entry, progress: percent, status: 'IN_PROGRESS' } : entry
        )));
    }, [setBackgroundJobs]);

    useQueueStream(true, {
        onSnapshot: (records) => {
            for (const record of records) {
                applyProgress(record);
                apply(record);
            }
        },
        onJob: (record) => {
            applyProgress(record);
            apply(record);
        },
    });
}
