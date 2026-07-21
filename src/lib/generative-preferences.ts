'use client';

import { DEFAULT_COMFY_LOCAL_URL, type ComfyConnectionMode } from '@/lib/comfyui/connection';

export type GenerativeProviderId = 'comfy' | 'ollama' | 'stability' | 'openai' | 'google' | 'banana';

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
    comfyTunnelUrl: string;
    comfyConnectionMode: ComfyConnectionMode;
    comfyCloudUrl: string;
    comfyInstallPath: string;
    comfyCustomNodesPath: string;
    comfyWorkflowLibraryPath: string;
    autoStartInpaintMasking: boolean;
    showInpaintPromptDock: boolean;
};

export const GENERATIVE_PREFERENCES_STORAGE_KEY = 'image-express-generative-preferences';
export const GENERATIVE_PREFERENCES_CHANGED_EVENT = 'image-express:generative-preferences-changed';

const LEGACY_PROVIDER_STORAGE_KEYS = ['image-express-gen-provider', 'image-express-provider'] as const;
const LEGACY_COMFY_URL_STORAGE_KEY = 'image-express-comfy-url';
const LEGACY_DEFAULT_COMFY_URL = 'http://127.0.0.1:8188';
const WORKFLOW_LIBRARY_PATH_SPLIT_PATTERN = /[\r\n;]+/;

const GENERATIVE_PROVIDER_SET = new Set<GenerativeProviderId>(['comfy', 'ollama', 'stability', 'openai', 'google', 'banana']);
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
    labelKey: string;
    descriptionKey: string;
    status: GenerativeProviderStatus;
    supportedWorkflows: GenerativeWorkflowId[];
}> = [
    {
        id: 'stability',
        labelKey: 'genProvider.stability',
        descriptionKey: 'genProvider.stability.desc',
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
        id: 'ollama',
        labelKey: 'genProvider.ollama',
        descriptionKey: 'genProvider.ollama.desc',
        status: 'ready',
        supportedWorkflows: ['zone'],
    },
    {
        id: 'openai',
        labelKey: 'genProvider.openai',
        descriptionKey: 'genProvider.openai.desc',
        status: 'ready',
        supportedWorkflows: ['zone'],
    },
    {
        id: 'google',
        labelKey: 'genProvider.google',
        descriptionKey: 'genProvider.google.desc',
        status: 'ready',
        supportedWorkflows: ['zone'],
    },
    {
        id: 'banana',
        labelKey: 'genProvider.banana',
        descriptionKey: 'genProvider.banana.desc',
        status: 'ready',
        supportedWorkflows: ['zone'],
    },
    {
        id: 'comfy',
        labelKey: 'genProvider.comfy',
        descriptionKey: 'genProvider.comfy.desc',
        status: 'ready',
        supportedWorkflows: ['zone'],
    },
];

export const GENERATIVE_WORKFLOW_OPTIONS: Array<{ id: GenerativeWorkflowId; labelKey: string; descriptionKey: string }> = [
    { id: 'stability-inpaint', labelKey: 'genWorkflow.inpaint', descriptionKey: 'genWorkflow.inpaint.desc' },
    { id: 'zone', labelKey: 'genWorkflow.zone', descriptionKey: 'genWorkflow.zone.desc' },
    { id: 'stability-generate', labelKey: 'genWorkflow.generate', descriptionKey: 'genWorkflow.generate.desc' },
    { id: 'stability-img2img', labelKey: 'genWorkflow.img2img', descriptionKey: 'genWorkflow.img2img.desc' },
    { id: 'stability-outpaint', labelKey: 'genWorkflow.outpaint', descriptionKey: 'genWorkflow.outpaint.desc' },
    { id: 'stability-upscale', labelKey: 'genWorkflow.upscale', descriptionKey: 'genWorkflow.upscale.desc' },
    { id: 'stability-removebg', labelKey: 'genWorkflow.removebg', descriptionKey: 'genWorkflow.removebg.desc' },
];

const DEFAULT_GENERATIVE_PREFERENCES: GenerativePreferences = {
    defaultProvider: 'comfy',
    defaultWorkflow: 'zone',
    comfyServerUrl: DEFAULT_COMFY_LOCAL_URL,
    comfyTunnelUrl: '',
    comfyConnectionMode: 'auto',
    comfyCloudUrl: 'https://cloud.comfy.org',
    comfyInstallPath: '',
    comfyCustomNodesPath: '',
    comfyWorkflowLibraryPath: '',
    autoStartInpaintMasking: false,
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

const coerceComfyConnectionMode = (value: unknown): ComfyConnectionMode | null => (
    value === 'auto' || value === 'local' || value === 'tunnel' || value === 'cloud'
        ? value
        : null
);

const normalizeWorkflowLibraryPathInput = (value: string): string => {
    const configuredPaths = value
        .split(WORKFLOW_LIBRARY_PATH_SPLIT_PATTERN)
        .map((entry) => entry.trim())
        .filter(Boolean);

    return Array.from(new Set(configuredPaths)).join('\n');
};

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
    if (!trimmed) return null;
    return trimmed === LEGACY_DEFAULT_COMFY_URL ? DEFAULT_COMFY_LOCAL_URL : trimmed;
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
            ? (parsed.comfyServerUrl.trim() === LEGACY_DEFAULT_COMFY_URL ? DEFAULT_COMFY_LOCAL_URL : parsed.comfyServerUrl.trim())
            : (resolveLegacyComfyUrl() || DEFAULT_GENERATIVE_PREFERENCES.comfyServerUrl);
        const comfyTunnelUrl = typeof parsed.comfyTunnelUrl === 'string'
            ? parsed.comfyTunnelUrl.trim()
            : DEFAULT_GENERATIVE_PREFERENCES.comfyTunnelUrl;
        const comfyConnectionMode = coerceComfyConnectionMode(parsed.comfyConnectionMode)
            || DEFAULT_GENERATIVE_PREFERENCES.comfyConnectionMode;
        const comfyCloudUrl = typeof parsed.comfyCloudUrl === 'string' && parsed.comfyCloudUrl.trim().length > 0
            ? parsed.comfyCloudUrl.trim()
            : DEFAULT_GENERATIVE_PREFERENCES.comfyCloudUrl;
        const comfyInstallPath = typeof parsed.comfyInstallPath === 'string'
            ? parsed.comfyInstallPath.trim()
            : DEFAULT_GENERATIVE_PREFERENCES.comfyInstallPath;
        const comfyCustomNodesPath = typeof parsed.comfyCustomNodesPath === 'string'
            ? parsed.comfyCustomNodesPath.trim()
            : DEFAULT_GENERATIVE_PREFERENCES.comfyCustomNodesPath;
        const comfyWorkflowLibraryPath = typeof parsed.comfyWorkflowLibraryPath === 'string'
            ? normalizeWorkflowLibraryPathInput(parsed.comfyWorkflowLibraryPath)
            : DEFAULT_GENERATIVE_PREFERENCES.comfyWorkflowLibraryPath;

        return {
            defaultProvider: provider,
            defaultWorkflow: workflow,
            comfyServerUrl,
            comfyTunnelUrl,
            comfyConnectionMode,
            comfyCloudUrl,
            comfyInstallPath,
            comfyCustomNodesPath,
            comfyWorkflowLibraryPath,
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
    const normalizedComfyServerUrl = (updates.comfyServerUrl ?? current.comfyServerUrl).trim();
    const normalizedComfyTunnelUrl = (updates.comfyTunnelUrl ?? current.comfyTunnelUrl).trim();
    const next: GenerativePreferences = {
        ...current,
        ...updates,
        comfyServerUrl: (
            (normalizedComfyServerUrl === LEGACY_DEFAULT_COMFY_URL ? DEFAULT_COMFY_LOCAL_URL : normalizedComfyServerUrl)
            || DEFAULT_GENERATIVE_PREFERENCES.comfyServerUrl
        ),
        comfyTunnelUrl: normalizedComfyTunnelUrl,
        comfyCloudUrl: (updates.comfyCloudUrl ?? current.comfyCloudUrl).trim() || DEFAULT_GENERATIVE_PREFERENCES.comfyCloudUrl,
        comfyInstallPath: (updates.comfyInstallPath ?? current.comfyInstallPath).trim(),
        comfyCustomNodesPath: (updates.comfyCustomNodesPath ?? current.comfyCustomNodesPath).trim(),
        comfyWorkflowLibraryPath: normalizeWorkflowLibraryPathInput(updates.comfyWorkflowLibraryPath ?? current.comfyWorkflowLibraryPath),
        comfyConnectionMode: coerceComfyConnectionMode(updates.comfyConnectionMode) || current.comfyConnectionMode,
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
            return 'generate';
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

    if (
        resolvedProvider === 'stability'
        && isStabilityWorkflow(preferences.defaultWorkflow)
        && availableProviders.includes('stability')
    ) {
        return {
            provider: 'stability',
            mode: 'stability',
            stabilityTab: workflowToStabilityTab(preferences.defaultWorkflow),
        };
    }

    return {
        provider: resolvedProvider,
        mode: 'zone',
        stabilityTab: 'generate',
    };
};
