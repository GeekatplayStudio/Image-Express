/**
 * Foam-cut pipeline, off the main thread.
 *
 * A dense generated model takes seconds to plan even after the face budgets
 * (tophat.glb: 3.1M triangles, ~15 s end to end); on the main thread that
 * reads as the window freezing. The pipeline is pure and dependency-free, so
 * it runs here unchanged and posts one message back.
 */

import { planFoamCut, type FoamCutOptions } from './foamCut';

export type FoamCutWorkerRequest = {
    bytes: ArrayBuffer;
    modelName: string;
    options?: FoamCutOptions;
};

export type FoamCutWorkerResponse =
    | { ok: true; result: ReturnType<typeof planFoamCut> }
    | { ok: false; message: string; details: string[] };

self.onmessage = (event: MessageEvent<FoamCutWorkerRequest>) => {
    const { bytes, modelName, options } = event.data;
    try {
        const result = planFoamCut(bytes, modelName, options);
        (self as unknown as Worker).postMessage({ ok: true, result } satisfies FoamCutWorkerResponse);
    } catch (error) {
        const details = (error as { details?: string[] }).details ?? [];
        (self as unknown as Worker).postMessage({
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            details,
        } satisfies FoamCutWorkerResponse);
    }
};
