import { getQueue } from '@/lib/server/jobQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;

const encoder = new TextEncoder();

const sseChunk = (event: string, data: unknown): Uint8Array => (
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
);

/**
 * Server-Sent Events stream of queue mutations. Push replaces client-side
 * polling: one connection carries every job's lifecycle (Adobe's
 * event-driven alternative to status polling, in single-machine form).
 * EventSource reconnects natively, and each connection opens with a full
 * snapshot so no transition can be missed across reconnects.
 */
export async function GET() {
    const queue = getQueue();
    const jobs = await queue.listJobs();

    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const safeEnqueue = (chunk: Uint8Array) => {
                try {
                    controller.enqueue(chunk);
                } catch {
                    // Controller already closed (client went away).
                }
            };

            safeEnqueue(sseChunk('snapshot', { jobs }));

            unsubscribe = queue.subscribe((event) => {
                if (event.type === 'job') {
                    safeEnqueue(sseChunk('job', event.job));
                }
            });

            heartbeat = setInterval(() => {
                safeEnqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
            }, HEARTBEAT_MS);
        },
        cancel() {
            if (heartbeat) clearInterval(heartbeat);
            unsubscribe?.();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
