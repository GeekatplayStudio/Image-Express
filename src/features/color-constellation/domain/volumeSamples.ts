import type { Oklch } from '../contracts/types';
import { isInSrgbGamut, oklchToHex, oklchToScenePosition } from './oklch';

export type VolumeSample = {
    position: [number, number, number];
    hex: string;
    /** Relative bead size 0–1 (outer gamut beads read larger). */
    weight: number;
};

/**
 * Dense OKLCH volume for the constellation scene.
 * Biased toward outer chroma rings so the solid reads as a colorful Volume-like form.
 */
export function buildVolumeSamples(options?: {
    lightnessSteps?: number;
    chromaSteps?: number;
    hueSteps?: number;
    maxChroma?: number;
    chromaScale?: number;
}): VolumeSample[] {
    const lightnessSteps = options?.lightnessSteps ?? 13;
    const chromaSteps = options?.chromaSteps ?? 7;
    const hueSteps = options?.hueSteps ?? 64;
    const maxChroma = options?.maxChroma ?? 0.36;
    const chromaScale = options?.chromaScale ?? 9.5;
    const samples: VolumeSample[] = [];

    for (let li = 0; li < lightnessSteps; li += 1) {
        const l = lightnessSteps === 1 ? 0.5 : li / (lightnessSteps - 1);
        for (let ci = 1; ci <= chromaSteps; ci += 1) {
            const t = ci / chromaSteps;
            const c = t * maxChroma;
            // Outer rings denser in hue; inner rings thinner
            const ringHueSteps = Math.max(12, Math.round(hueSteps * (0.45 + t * 0.55)));
            for (let hi = 0; hi < ringHueSteps; hi += 1) {
                const h = (hi / ringHueSteps) * 360;
                const oklch: Oklch = { l, c, h };
                if (!isInSrgbGamut(oklch)) continue;
                samples.push({
                    position: oklchToScenePosition(oklch, chromaScale),
                    hex: oklchToHex(oklch),
                    weight: 0.35 + t * 0.65,
                });
            }
        }
    }

    for (let li = 0; li < lightnessSteps; li += 1) {
        const l = lightnessSteps === 1 ? 0.5 : li / (lightnessSteps - 1);
        const oklch: Oklch = { l, c: 0, h: 0 };
        samples.push({
            position: oklchToScenePosition(oklch, chromaScale),
            hex: oklchToHex(oklch),
            weight: 0.55,
        });
    }

    return samples;
}
