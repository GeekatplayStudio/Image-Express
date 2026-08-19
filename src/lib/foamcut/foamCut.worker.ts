/**
 * Foam-cut pipeline, off the main thread.
 *
 * A dense generated model takes seconds to plan even after the face budgets
 * (tophat.glb: 3.1M triangles, ~15 s end to end); on the main thread that
 * reads as the window freezing. The pipeline is pure and dependency-free, so
 * it runs here unchanged, streams stage-progress messages while it works, and
 * posts one result message at the end.
 */

import { planFoamCut, type FoamCutOptions, type FoldProgressEvent } from './foamCut';

export type FoamCutWorkerRequest = {
    bytes: ArrayBuffer;
    modelName: string;
    options?: Omit<FoamCutOptions, 'onProgress'>;
};

export type FoamCutWorkerResponse =
    | { type: 'progress'; event: FoldProgressEvent }
    | { type: 'result'; ok: true; result: ReturnType<typeof planFoamCut> }
    | { type: 'result'; ok: false; message: string; details: string[] };

const post = (message: FoamCutWorkerResponse) => (self as unknown as Worker).postMessage(message);

self.onmessage = (event: MessageEvent<FoamCutWorkerRequest>) => {
    const { bytes, modelName, options } = event.data;
    try {
        const result = planFoamCut(bytes, modelName, {
            ...options,
            onProgress: (progress) => post({ type: 'progress', event: progress }),
        });
        post({ type: 'result', ok: true, result });
    } catch (error) {
        const details = (error as { details?: string[] }).details ?? [];
        post({
            type: 'result',
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            details,
        });
    }
};
