// Local monocular depth estimation for the 3D layer's relight/VFX modes.
// Runs Depth Anything V2 (small) fully in-browser via transformers.js —
// WebGPU when available, WASM otherwise. The model (~50 MB) downloads from
// the Hugging Face hub on first use and is cached by the browser.

const MODEL_ID = 'onnx-community/depth-anything-v2-small';
const MAX_DEPTH_DIM = 768;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null;

async function getDepthPipeline() {
    if (!pipelinePromise) {
        pipelinePromise = (async () => {
            const { pipeline } = await import('@huggingface/transformers');
            const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
            try {
                return await pipeline('depth-estimation', MODEL_ID, {
                    device: hasWebGPU ? 'webgpu' : 'wasm',
                });
            } catch {
                // WebGPU adapters can fail at init (headless, old drivers) —
                // fall back to WASM before giving up.
                return await pipeline('depth-estimation', MODEL_ID, { device: 'wasm' });
            }
        })();
        pipelinePromise.catch(() => { pipelinePromise = null; });
    }
    return pipelinePromise;
}

/** True once the model is loaded (used to label the first-run wait). */
export function isDepthModelReady(): boolean {
    return pipelinePromise !== null;
}

/**
 * Estimate depth for an image (dataURL or object URL). Returns a grayscale
 * canvas in DISPARITY space (near = bright), capped at MAX_DEPTH_DIM on the
 * long side — relighting reads it as a texture, full resolution buys nothing.
 */
export async function estimateDepth(imageSrc: string): Promise<HTMLCanvasElement> {
    const estimator = await getDepthPipeline();
    const result = await estimator(imageSrc);
    // transformers.js returns { depth: RawImage } with a single channel.
    const raw = result.depth ?? result[0]?.depth;
    if (!raw) throw new Error('3D layer depth: estimator returned no depth map');

    const { width, height, data, channels } = raw as {
        width: number; height: number; data: Uint8Array | Float32Array; channels: number;
    };
    const out = document.createElement('canvas');
    const scale = Math.min(1, MAX_DEPTH_DIM / Math.max(width, height));
    const full = document.createElement('canvas');
    full.width = width;
    full.height = height;
    const ctx = full.getContext('2d')!;
    const img = ctx.createImageData(width, height);

    // Normalize to 0..255 regardless of dtype.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < width * height; i++) {
        const v = data[i * channels];
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const range = Math.max(max - min, 1e-6);
    for (let i = 0; i < width * height; i++) {
        const v = Math.round(((data[i * channels] - min) / range) * 255);
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    out.width = Math.round(width * scale);
    out.height = Math.round(height * scale);
    const octx = out.getContext('2d')!;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(full, 0, 0, out.width, out.height);
    return out;
}

/**
 * Cheap luminance pseudo-depth fallback for when the model can't run
 * (offline, no WASM). Not real geometry — but lets relight shadows and
 * point-light z still do something sensible.
 */
export function luminancePseudoDepth(source: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
    const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
    const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
    const scale = Math.min(1, MAX_DEPTH_DIM / Math.max(w, h));
    const out = document.createElement('canvas');
    out.width = Math.round(w * scale);
    out.height = Math.round(h * scale);
    const ctx = out.getContext('2d')!;
    ctx.filter = 'grayscale(1) blur(2px)';
    ctx.drawImage(source, 0, 0, out.width, out.height);
    return out;
}
