import type { ModelProvider } from '@/lib/agentic-edit/providers/types';
import { FluxProvider } from '@/lib/agentic-edit/providers/flux';
import { NanoBananaProvider } from '@/lib/agentic-edit/providers/nanobanana';
import { MockProvider } from '@/lib/agentic-edit/providers/mock';

const providerRegistry: Record<string, ModelProvider> = {
    flux: new FluxProvider(),
    nanobanana: new NanoBananaProvider(),
    mock: new MockProvider(),
};

export const resolveModelProvider = (name: string): ModelProvider => {
    const normalized = name.toLowerCase();
    return providerRegistry[normalized] || providerRegistry.mock;
};
