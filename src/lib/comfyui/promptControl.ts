import {
    buildComfyTransportRequestUrl,
    resolveAvailableComfyTransport,
    type ComfyConnectionOptions,
    type ResolvedComfyTransport,
} from '@/lib/comfyui/connection';

/**
 * Stopping a job, naming an upload, and explaining a refused prompt.
 *
 * These follow the Photoshop bridge (ComfyUI-Geekatplay-Photoshop), which has
 * run against real servers for longer than this client: cancel really stops the
 * server, uploads never share a name, and a refused prompt says which node and
 * input were wrong.
 */

const apiUrl = (transport: ResolvedComfyTransport, path: string) => (
    buildComfyTransportRequestUrl(transport, `${transport.apiBasePath}${path}`)
);

const postJson = (transport: ResolvedComfyTransport, path: string, body: unknown) => fetch(apiUrl(transport, path), {
    method: 'POST',
    headers: { ...transport.defaultHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

/** Queue entries are `[number, promptId, ...]`. */
const queueHasPrompt = (entries: unknown, promptId: string): boolean => (
    Array.isArray(entries) && entries.some((entry) => Array.isArray(entry) && entry[1] === promptId)
);

export type ComfyCancelOutcome = 'interrupted' | 'dequeued' | 'not-queued';

/**
 * Stop one prompt on the server: interrupt it if it is running, remove it from
 * the queue if it is waiting.
 *
 * The queue is read first on purpose. Older ComfyUI builds ignore the
 * `prompt_id` in an interrupt and stop whatever is running, so interrupting a
 * prompt that is only waiting would kill somebody else's job.
 */
export async function cancelComfyPromptOnTransport(
    transport: ResolvedComfyTransport,
    promptId: string,
): Promise<ComfyCancelOutcome> {
    const response = await fetch(apiUrl(transport, '/queue'), { headers: transport.defaultHeaders });
    if (!response.ok) throw new Error(`Could not read the ComfyUI queue: ${response.status} ${response.statusText}`);
    const queue = await response.json() as { queue_running?: unknown; queue_pending?: unknown };

    if (queueHasPrompt(queue.queue_running, promptId)) {
        await postJson(transport, '/interrupt', { prompt_id: promptId });
        return 'interrupted';
    }
    if (queueHasPrompt(queue.queue_pending, promptId)) {
        await postJson(transport, '/queue', { delete: [promptId] });
        return 'dequeued';
    }
    return 'not-queued';
}

/**
 * Cancel from the UI. Never throws: the user has already moved on, and a
 * server that cannot be reached has nothing left to cancel from here.
 */
export async function cancelComfyPrompt(
    job: { promptId: string; connection: ComfyConnectionOptions } | null | undefined,
): Promise<ComfyCancelOutcome | 'failed'> {
    if (!job?.promptId) return 'not-queued';
    try {
        const transport = await resolveAvailableComfyTransport(job.connection);
        return await cancelComfyPromptOnTransport(transport, job.promptId);
    } catch (error) {
        console.warn('ComfyUI cancel did not reach the server', error);
        return 'failed';
    }
}

/** FNV-1a over the string, run twice with different seeds for a 64-bit name. */
const hashText = (text: string): string => {
    let a = 0x811c9dc5;
    let b = 0x01000193;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        a = Math.imul(a ^ code, 0x01000193);
        b = Math.imul(b ^ code, 0x85ebca6b);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
};

/**
 * An upload name derived from the image itself.
 *
 * A fixed name meant a second job queued before the first had run replaced the
 * first job's input on the server. Naming by content keeps jobs apart and lets
 * the same image be reused instead of stored again.
 */
export function uniqueComfyUploadName(dataUrl: string, baseName: string): string {
    const dot = baseName.lastIndexOf('.');
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    const extension = dot > 0 ? baseName.slice(dot) : '.png';
    return `${stem}-${hashText(`${dataUrl.length}:${dataUrl}`)}${extension}`;
}

interface ComfyNodeError {
    class_type?: string;
    errors?: Array<{ message?: string; details?: string }>;
}

/**
 * Turn a refused `/prompt` into something a person can act on.
 *
 * ComfyUI answers with `{ error: { message }, node_errors: { id: { class_type,
 * errors: [{ message, details }] } } }`. The node errors are the useful part
 * and sit at the end, which is exactly what a character cut-off loses.
 */
export function formatComfyPromptError(status: number, statusText: string, body: string): string {
    if (status === 413) {
        return 'The image is larger than ComfyUI accepts. Start ComfyUI with a higher --max-upload-size, or use a smaller image.';
    }
    let parsed: { error?: { message?: string } | string; node_errors?: Record<string, ComfyNodeError> } | null = null;
    try {
        parsed = JSON.parse(body);
    } catch {
        parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') {
        const detail = body.trim().slice(0, 280);
        return `ComfyUI refused the workflow: ${status} ${statusText}${detail ? ` (${detail})` : ''}`;
    }

    const headline = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
    const nodeLines: string[] = [];
    for (const [nodeId, nodeError] of Object.entries(parsed.node_errors ?? {})) {
        for (const error of nodeError?.errors ?? []) {
            const detail = error.details ? ` (${error.details})` : '';
            nodeLines.push(`${nodeError.class_type || `node ${nodeId}`}: ${error.message || 'invalid input'}${detail}`);
        }
    }
    const shown = nodeLines.slice(0, 8);
    if (nodeLines.length > shown.length) shown.push(`…and ${nodeLines.length - shown.length} more`);
    return [`ComfyUI refused the workflow: ${headline || `${status} ${statusText}`}`, ...shown].join('\n');
}

/** After this many consecutive polls with the prompt nowhere to be found, it is gone. */
const LOST_AFTER_POLLS = 3;

/**
 * Watches a queued prompt's place in the server's queue while its history is
 * awaited.
 *
 * Waiting on history alone cannot tell "still working" from "no longer there":
 * a prompt deleted from the queue, or lost when ComfyUI restarted, never gets
 * a history entry, and the wait ran to its 30-minute timeout. The queue says
 * which it is, and where a waiting prompt stands.
 */
export function createPromptQueueWatch(transport: ResolvedComfyTransport, promptId: string) {
    let absentPolls = 0;
    return {
        /**
         * Call once per history poll. Returns a status line for a prompt that is
         * queued or running, null when the queue could not be read, and throws
         * once the prompt has been absent from queue and history long enough.
         */
        async check(hasHistoryEntry: boolean): Promise<string | null> {
            if (hasHistoryEntry) return null;
            let queue: { queue_running?: unknown; queue_pending?: unknown };
            try {
                const response = await fetch(apiUrl(transport, '/queue'), { headers: transport.defaultHeaders });
                if (!response.ok) return null;
                queue = await response.json();
            } catch {
                // A queue that cannot be read proves nothing either way.
                return null;
            }
            if (queueHasPrompt(queue.queue_running, promptId)) {
                absentPolls = 0;
                return 'ComfyUI is running this job';
            }
            const pending = Array.isArray(queue.queue_pending) ? queue.queue_pending : [];
            const position = pending
                .filter((entry): entry is unknown[] => Array.isArray(entry))
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .findIndex((entry) => entry[1] === promptId);
            if (position >= 0) {
                absentPolls = 0;
                return `Waiting in the ComfyUI queue (${position + 1} of ${pending.length})`;
            }
            absentPolls += 1;
            if (absentPolls >= LOST_AFTER_POLLS) {
                throw new Error(
                    'This job is no longer in the ComfyUI queue and produced no result. '
                    + 'It was removed from the queue, or ComfyUI restarted. Run it again.',
                );
            }
            return null;
        },
    };
}
