import type { ModelProvider, ProviderGeneratePayload, ProviderGenerateResult } from '@/lib/agentic-edit/providers/types';
import { requestBananaImageGeneration, resolveBananaOutputBuffer } from '@/lib/server/bananaGeneration';

const bufferToDataUrl = (buffer: Buffer, mimeType = 'image/png'): string => (
    `data:${mimeType};base64,${buffer.toString('base64')}`
);

export class NanoBananaProvider implements ModelProvider {
    name = 'nanobanana';

    supports = {
        img2img: true,
        inpaint: true,
        multiReference: true,
        controlPose: true,
        mask: true,
    };

    async generate(payload: ProviderGeneratePayload): Promise<ProviderGenerateResult> {
        const apiKey = typeof payload.params.apiKey === 'string' ? payload.params.apiKey.trim() : '';
        if (!apiKey) {
            throw new Error('NanoBanana requires a Banana API key. Add it in Settings before running AI Edit Notes.');
        }

        const references = Array.isArray(payload.references)
            ? payload.references.map((reference) => ({
                role: reference.role,
                imageDataUrl: bufferToDataUrl(reference.image),
            }))
            : [];

        const result = await requestBananaImageGeneration({
            apiKey,
            mode: 'edit',
            model: typeof payload.params.model === 'string' ? payload.params.model : 'nanobanana-2',
            prompt: payload.promptPositive,
            negativePrompt: payload.promptNegative,
            imageDataUrl: bufferToDataUrl(payload.originalImage),
            maskDataUrl: payload.maskImage ? bufferToDataUrl(payload.maskImage) : undefined,
            notesOverlayDataUrl: payload.notesOverlay ? bufferToDataUrl(payload.notesOverlay) : undefined,
            poseHintDataUrl: payload.poseHint ? bufferToDataUrl(payload.poseHint) : undefined,
            references,
            params: payload.params,
        });

        return {
            outputImage: await resolveBananaOutputBuffer(result.imageUrl),
            meta: {
                provider: 'nanobanana',
                status: 'completed',
                model: result.model,
                endpoint: result.endpoint,
            },
        };
    }
}
