'use client';

/**
 * Optional in-browser CLIP image/text embeddings via transformers.js.
 * Used when the user wants visual similarity without round-tripping every
 * image through Ollama captions. Lazy-loads ~100MB model on first use.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let textPipelinePromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let imagePipelinePromise: Promise<any> | null = null;

const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';

async function getTextPipeline() {
    if (!textPipelinePromise) {
        textPipelinePromise = (async () => {
            const { pipeline } = await import('@huggingface/transformers');
            const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
            try {
                return await pipeline('feature-extraction', CLIP_MODEL, {
                    device: hasWebGPU ? 'webgpu' : 'wasm',
                });
            } catch {
                return await pipeline('feature-extraction', CLIP_MODEL, { device: 'wasm' });
            }
        })();
        textPipelinePromise.catch(() => { textPipelinePromise = null; });
    }
    return textPipelinePromise;
}

async function getImagePipeline() {
    if (!imagePipelinePromise) {
        imagePipelinePromise = (async () => {
            const { pipeline } = await import('@huggingface/transformers');
            const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
            try {
                return await pipeline('image-feature-extraction', CLIP_MODEL, {
                    device: hasWebGPU ? 'webgpu' : 'wasm',
                });
            } catch {
                return await pipeline('image-feature-extraction', CLIP_MODEL, { device: 'wasm' });
            }
        })();
        imagePipelinePromise.catch(() => { imagePipelinePromise = null; });
    }
    return imagePipelinePromise;
}

function flattenEmbedding(output: unknown): number[] {
    // transformers.js may return Tensor-like objects or nested arrays.
    const maybeData = output as { data?: ArrayLike<number>; tolist?: () => unknown };
    if (maybeData?.data) {
        return Array.from(maybeData.data as ArrayLike<number>);
    }
    if (typeof maybeData?.tolist === 'function') {
        const listed = maybeData.tolist();
        return flattenEmbedding(listed);
    }
    if (Array.isArray(output)) {
        if (typeof output[0] === 'number') return output as number[];
        return flattenEmbedding(output[0]);
    }
    return [];
}

function normalize(vector: number[]): number[] {
    let mag = 0;
    for (const value of vector) mag += value * value;
    mag = Math.sqrt(mag) || 1;
    return vector.map((value) => value / mag);
}

export async function embedTextWithClip(text: string): Promise<number[]> {
    const extractor = await getTextPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const vector = flattenEmbedding(output);
    return vector.length ? normalize(vector) : [];
}

export async function embedImageUrlWithClip(imageUrl: string): Promise<number[]> {
    const extractor = await getImagePipeline();
    const output = await extractor(imageUrl, { pooling: 'mean', normalize: true });
    const vector = flattenEmbedding(output);
    return vector.length ? normalize(vector) : [];
}

export function isClipReady() {
    return textPipelinePromise !== null || imagePipelinePromise !== null;
}
