import type { ModelProvider, ProviderGeneratePayload, ProviderGenerateResult } from '@/lib/agentic-edit/providers/types';

export class MockProvider implements ModelProvider {
    name = 'mock';

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
                provider: 'mock',
                note: 'Mock provider returned original image. Watermark overlay is not available in this runtime.',
            },
        };
    }
}
