import type { ModelProvider, ProviderGeneratePayload, ProviderGenerateResult } from '@/lib/agentic-edit/providers/types';

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
        return {
            outputImage: payload.originalImage,
            meta: {
                provider: 'nanobanana',
                status: 'stub',
                message: 'NanoBanana provider is wired as a stub. Add endpoint/API key integration to enable real generation.',
            },
        };
    }
}
