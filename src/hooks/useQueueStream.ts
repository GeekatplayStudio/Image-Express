'use client';

/**
 * Client subscription to the unified server job queue.
 *
 * One EventSource connection carries every job's lifecycle. EventSource
 * reconnects natively, and the server opens each connection with a full
 * snapshot, so transitions cannot be missed across reconnects.
 *
 * Consumers receive events through callbacks (invoked from the
 * EventSource handlers) and own their state, which keeps React updates
 * inside external-event callbacks rather than effect bodies.
 */

import { useEffect, useRef } from 'react';

import type { QueueJobRecord } from '@/lib/server/jobQueue/types';

export interface QueueStreamHandlers {
    /** Full state on (re)connect. Treat as authoritative resync. */
    onSnapshot: (jobs: QueueJobRecord[]) => void;
    /** A single job transitioned. */
    onJob: (job: QueueJobRecord) => void;
}

export function useQueueStream(enabled: boolean, handlers: QueueStreamHandlers): void {
    const handlersRef = useRef(handlers);
    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined') {
            return;
        }

        const source = new EventSource('/api/queue/stream');

        const applySnapshot = (event: MessageEvent) => {
            try {
                const parsed = JSON.parse(event.data) as { jobs?: QueueJobRecord[] };
                handlersRef.current.onSnapshot(Array.isArray(parsed.jobs) ? parsed.jobs : []);
            } catch {
                // Ignore malformed frames; the next snapshot resyncs.
            }
        };

        const applyJob = (event: MessageEvent) => {
            try {
                const job = JSON.parse(event.data) as QueueJobRecord;
                if (job && typeof job.id === 'string') {
                    handlersRef.current.onJob(job);
                }
            } catch {
                // Ignore malformed frames.
            }
        };

        source.addEventListener('snapshot', applySnapshot);
        source.addEventListener('job', applyJob);

        return () => {
            source.removeEventListener('snapshot', applySnapshot);
            source.removeEventListener('job', applyJob);
            source.close();
        };
    }, [enabled]);
}
