'use client';

export type GenerativeProviderId = 'comfy' | 'stability' | 'openai' | 'google' | 'banana';

export type GenerativeWorkflowId =
    | 'zone'
    | 'stability-generate'
    | 'stability-inpaint'
    | 'stability-img2img'
    | 'stability-outpaint'
    | 'stability-upscale'
    | 'stability-removebg';

export type GenerativeStabilityTab = 'generate' | 'inpaint' | 'img2img' | 'outpaint' | 'upscale' | 'removebox';

export type GenerativeProviderStatus = 'ready' | 'coming-soon';

export type GenerativePreferences = {
    defaultProvider: GenerativeProviderId;
    defaultWorkflow: GenerativeWorkflowId;
    comfyServerUrl: string;
    autoStartInpaintMasking: boolean;
    showInpaintPromptDock: boolean;
};

export const GENERATIVE_PREFERENCES_STORAGE_KEY = 'image-express-generative-preferences';
export const GENERATIVE_PREFERENCES_CHANGED_EVENT = 'image-express:generative-preferences-changed';

const LEGACY_PROVIDER_STORAGE_KEYS = ['image-express-gen-provider', 'image-express-provider'] as const;
const LEGACY_COMFY_URL_STORAGE_KEY = 'image-express-comfy-url';

const GENERATIVE_PROVIDER_SET = new Set<GenerativeProviderId>(['comfy', 'stability', 'openai', 'google', 'banana']);
const GENERATIVE_WORKFLOW_SET = new Set<GenerativeWorkflowId>([
    'zone',
    'stability-generate',
    'stability-inpaint',
    'stability-img2img',
    'stability-outpaint',
    'stability-upscale',
    'stability-removebg',
]);

export const GENERATIVE_PROVIDER_OPTIONS: Array<{
    id: GenerativeProviderId;
    label: string;
    description: string;
    status: GenerativeProviderStatus;
    supportedWorkflows: GenerativeWorkflowId[];
}> = [
    {
        id: 'stability',
        label: 'Stability AI',
        description: 'Best current support for fill, inpaint, outpaint, upscale.',
        status: 'ready',
        supportedWorkflows: [
            'zone',
            'stability-generate',
            'stability-inpaint',
            'stability-img2img',
            'stability-outpaint',
            'stability-upscale',
            'stability-removebg',
        ],
    },
    {
        id: 'openai',
        label: 'ChatGPT / OpenAI',
        description: 'Text-to-image generation (DALL-E style).',
        status: 'ready',
        supportedWorkflows: ['zone'],
    },
    {
        id: 'google',
        label: 'Gemini / Google',
        description: 'Remote Google image stack (coming soon in generator route).',
        status: 'coming-soon',
        supportedWorkflows: ['zone'],
    },
    {
        id: 'banana',
        label: 'Banana.dev',
        description: 'Remote GPU provider (route support in progress).',
        status: 'coming-soon',
        supportedWorkflows: ['zone'],
    },
    {
        id: 'comfy',
        label: 'Local ComfyUI',
        description: 'Local-first workflow via your ComfyUI server.',
        status: 'ready',
        supportedWorkflows: ['zone'],
    },
];

export const GENERATIVE_WORKFLOW_OPTIONS: Array<{ id: GenerativeWorkflowId; label: string; description: string }> = [
    { id: 'stability-inpaint', label: 'Generative Fill (Inpaint)', description: 'Reference-style flow: mask area, prompt, fill.' },
    { id: 'zone', label: 'Prompt + Zone', description: 'Universal text-to-image generation inside a zone rectangle.' },
    { id: 'stability-generate', label: 'Stability Generate', description: 'Stability text-to-image defaults.' },
    { id: 'stability-img2img', label: 'Stability Reimagine (Img2Img)', description: 'Transform selected image/canvas with prompt + strength.' },
    { id: 'stability-outpaint', label: 'Stability Outpaint', description: 'Extend the image beyond its current boundaries.' },
    { id: 'stability-upscale', label: 'Stability Upscale', description: 'Conservative or creative upscale pipeline.' },
    { id: 'stability-removebg', label: 'Stability Remove Background', description: 'Fast background removal flow.' },
];

const DEFAULT_GENERATIVE_PREFERENCES: GenerativePreferences = {
    defaultProvider: 'stability',
    defaultWorkflow: 'stability-inpaint',
    comfyServerUrl: 'http://127.0.0.1:8188',
    autoStartInpaintMasking: true,
    showInpaintPromptDock: true,
};

const coerceProvider = (value: unknown): GenerativeProviderId | null => (
    typeof value === 'string' && GENERATIVE_PROVIDER_SET.has(value as GenerativeProviderId)
        ? (value as GenerativeProviderId)
        : null
);

const coerceWorkflow = (value: unknown): GenerativeWorkflowId | null => (
    typeof value === 'string' && GENERATIVE_WORKFLOW_SET.has(value as GenerativeWorkflowId)
        ? (value as GenerativeWorkflowId)
        : null
);

const coerceBoolean = (value: unknown, fallback: boolean): boolean => (
    typeof value === 'boolean' ? value : fallback
);

const resolveLegacyProvider = (): GenerativeProviderId | null => {
    if (typeof window === 'undefined') return null;
    for (const key of LEGACY_PROVIDER_STORAGE_KEYS) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const normalized = raw.trim().toLowerCase();
        if (GENERATIVE_PROVIDER_SET.has(normalized as GenerativeProviderId)) {
            return normalized as GenerativeProviderId;
        }
        if (normalized === 'api') return 'stability';
        if (normalized === 'local') return 'comfy';
    }
    return null;
};

const resolveLegacyComfyUrl = (): string | null => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(LEGACY_COMFY_URL_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
};

export const loadGenerativePreferences = (): GenerativePreferences => {
    if (typeof window === 'undefined') return DEFAULT_GENERATIVE_PREFERENCES;

    try {
        const raw = window.localStorage.getItem(GENERATIVE_PREFERENCES_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<GenerativePreferences>) : {};

        const provider = coerceProvider(parsed.defaultProvider)
            || resolveLegacyProvider()
            || DEFAULT_GENERATIVE_PREFERENCES.defaultProvider;
        const workflow = coerceWorkflow(parsed.defaultWorkflow)
            || DEFAULT_GENERATIVE_PREFERENCES.defaultWorkflow;
        const comfyServerUrl = typeof parsed.comfyServerUrl === 'string' && parsed.comfyServerUrl.trim().length > 0
            ? parsed.comfyServerUrl.trim()
            : (resolveLegacyComfyUrl() || DEFAULT_GENERATIVE_PREFERENCES.comfyServerUrl);

        return {
            defaultProvider: provider,
            defaultWorkflow: workflow,
            comfyServerUrl,
            autoStartInpaintMasking: coerceBoolean(
                parsed.autoStartInpaintMasking,
                DEFAULT_GENERATIVE_PREFERENCES.autoStartInpaintMasking
            ),
            showInpaintPromptDock: coerceBoolean(
                parsed.showInpaintPromptDock,
                DEFAULT_GENERATIVE_PREFERENCES.showInpaintPromptDock
            ),
        };
    } catch {
        return {
            ...DEFAULT_GENERATIVE_PREFERENCES,
            defaultProvider: resolveLegacyProvider() || DEFAULT_GENERATIVE_PREFERENCES.defaultProvider,
            comfyServerUrl: resolveLegacyComfyUrl() || DEFAULT_GENERATIVE_PREFERENCES.comfyServerUrl,
        };
    }
};

export const saveGenerativePreferences = (updates: Partial<GenerativePreferences>): GenerativePreferences => {
    if (typeof window === 'undefined') {
        return { ...DEFAULT_GENERATIVE_PREFERENCES, ...updates };
    }

    const current = loadGenerativePreferences();
    const next: GenerativePreferences = {
        ...current,
        ...updates,
        comfyServerUrl: (updates.comfyServerUrl ?? current.comfyServerUrl).trim() || DEFAULT_GENERATIVE_PREFERENCES.comfyServerUrl,
    };

    window.localStorage.setItem(GENERATIVE_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(GENERATIVE_PREFERENCES_CHANGED_EVENT));
    return next;
};

const PROVIDER_OPTION_BY_ID: Record<GenerativeProviderId, (typeof GENERATIVE_PROVIDER_OPTIONS)[number]> =
    Object.fromEntries(
        GENERATIVE_PROVIDER_OPTIONS.map((option) => [option.id, option])
    ) as Record<GenerativeProviderId, (typeof GENERATIVE_PROVIDER_OPTIONS)[number]>;

export const getGenerativeProviderOption = (provider: GenerativeProviderId) => PROVIDER_OPTION_BY_ID[provider];

export const isGenerativeProviderReady = (provider: GenerativeProviderId): boolean => (
    getGenerativeProviderOption(provider).status === 'ready'
);

export const getSupportedWorkflowsForProvider = (provider: GenerativeProviderId): GenerativeWorkflowId[] => (
    getGenerativeProviderOption(provider).supportedWorkflows
);

export const isWorkflowSupportedByProvider = (
    provider: GenerativeProviderId,
    workflow: GenerativeWorkflowId
): boolean => getSupportedWorkflowsForProvider(provider).includes(workflow);

export const resolveCompatibleWorkflowForProvider = (
    provider: GenerativeProviderId,
    workflow: GenerativeWorkflowId
): GenerativeWorkflowId => {
    if (isWorkflowSupportedByProvider(provider, workflow)) return workflow;
    const fallback = getSupportedWorkflowsForProvider(provider)[0];
    return fallback || 'zone';
};

export const isStabilityWorkflow = (workflow: GenerativeWorkflowId): boolean => workflow.startsWith('stability-');

export const workflowToStabilityTab = (workflow: GenerativeWorkflowId): GenerativeStabilityTab => {
    switch (workflow) {
        case 'stability-generate':
            return 'generate';
        case 'stability-inpaint':
            return 'inpaint';
        case 'stability-img2img':
            return 'img2img';
        case 'stability-outpaint':
            return 'outpaint';
        case 'stability-upscale':
            return 'upscale';
        case 'stability-removebg':
            return 'removebox';
        default:
            return 'inpaint';
    }
};

export const resolveGenerativeLaunchState = (
    preferences: GenerativePreferences,
    availableProviders: GenerativeProviderId[]
): {
    provider: GenerativeProviderId;
    mode: 'zone' | 'stability';
    stabilityTab: GenerativeStabilityTab;
} => {
    const readyProviders = availableProviders.filter((provider) => isGenerativeProviderReady(provider));
    const fallbackProvider: GenerativeProviderId = readyProviders.includes('comfy')
        ? 'comfy'
        : (readyProviders[0] || availableProviders[0] || 'comfy');
    const preferredProvider = availableProviders.includes(preferences.defaultProvider)
        ? preferences.defaultProvider
        : fallbackProvider;
    const resolvedProvider = isGenerativeProviderReady(preferredProvider)
        ? preferredProvider
        : fallbackProvider;

    if (isStabilityWorkflow(preferences.defaultWorkflow) && availableProviders.includes('stability')) {
        return {
            provider: 'stability',
            mode: 'stability',
            stabilityTab: workflowToStabilityTab(preferences.defaultWorkflow),
        };
    }

    return {
        provider: resolvedProvider,
        mode: 'zone',
        stabilityTab: 'inpaint',
    };
};
