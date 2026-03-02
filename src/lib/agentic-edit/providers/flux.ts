import type { ModelProvider, ProviderGeneratePayload, ProviderGenerateResult } from '@/lib/agentic-edit/providers/types';

export class FluxProvider implements ModelProvider {
    name = 'flux';

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
                provider: 'flux',
                status: 'stub',
                message: 'Flux provider is wired as a stub. Add endpoint/API key integration to enable real generation.',
            },
        };
    }
}
