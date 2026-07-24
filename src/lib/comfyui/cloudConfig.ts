import {
    COMFY_CLOUD_API_KEY_STORAGE_KEY,
    DEFAULT_COMFY_CLOUD_URL,
    type RuntimeComfyConfig,
} from '@/lib/comfyui/connectionTypes';

const COMFY_CLOUD_URL_ENV_KEYS = ['COMFY_CLOUD_URL', 'NEXT_PUBLIC_COMFY_CLOUD_URL'] as const;
const COMFY_CLOUD_API_KEY_ENV_KEYS = ['COMFY_CLOUD_API_KEY', 'NEXT_PUBLIC_COMFY_CLOUD_API_KEY'] as const;
const RUNTIME_COMFY_CONFIG_ROUTE = '/api/runtime/comfy';

const readServerEnvValue = (keys: readonly string[]): string => {
    if (typeof window !== 'undefined') {
        return '';
    }

    for (const key of keys) {
        const value = process.env[key]?.trim();
        if (value) {
            return value;
        }
    }

    return '';
};

export const resolveConfiguredComfyCloudUrl = (value?: string): string => {
    const explicit = typeof value === 'string' ? value.trim() : '';
    if (explicit) {
        return explicit;
    }

    return readServerEnvValue(COMFY_CLOUD_URL_ENV_KEYS) || DEFAULT_COMFY_CLOUD_URL;
};

export const resolveConfiguredComfyCloudApiKey = (value?: string): string => {
    const explicit = typeof value === 'string' ? value.trim() : '';
    if (explicit) {
        return explicit;
    }

    return readServerEnvValue(COMFY_CLOUD_API_KEY_ENV_KEYS);
};

export const loadComfyCloudApiKey = (): string => {
    if (typeof window === 'undefined') {
        return resolveConfiguredComfyCloudApiKey();
    }

    return window.localStorage.getItem(COMFY_CLOUD_API_KEY_STORAGE_KEY) || '';
};

export const saveComfyCloudApiKey = (value: string): string => {
    if (typeof window === 'undefined') {
        return value.trim();
    }

    const nextValue = value.trim();
    window.localStorage.setItem(COMFY_CLOUD_API_KEY_STORAGE_KEY, nextValue);
    return nextValue;
};

export const fetchRuntimeComfyConfig = async (): Promise<RuntimeComfyConfig> => {
    if (typeof window === 'undefined') {
        return {
            cloudUrl: resolveConfiguredComfyCloudUrl(),
            cloudApiKey: resolveConfiguredComfyCloudApiKey(),
        };
    }

    try {
        const response = await fetch(RUNTIME_COMFY_CONFIG_ROUTE, {
            method: 'GET',
            cache: 'no-store',
        });

        if (!response.ok) {
            return {
                cloudUrl: DEFAULT_COMFY_CLOUD_URL,
                cloudApiKey: '',
            };
        }

        const data = (await response.json().catch(() => ({}))) as Partial<RuntimeComfyConfig>;
        return {
            cloudUrl: typeof data.cloudUrl === 'string' && data.cloudUrl.trim().length > 0
                ? data.cloudUrl.trim()
                : DEFAULT_COMFY_CLOUD_URL,
            cloudApiKey: typeof data.cloudApiKey === 'string' ? data.cloudApiKey.trim() : '',
        };
    } catch {
        return {
            cloudUrl: DEFAULT_COMFY_CLOUD_URL,
            cloudApiKey: '',
        };
    }
};

export const hydrateComfyCloudSettingsFromRuntime = async (): Promise<RuntimeComfyConfig> => {
    const runtimeConfig = await fetchRuntimeComfyConfig();
    if (typeof window === 'undefined') {
        return runtimeConfig;
    }

    const storedApiKey = loadComfyCloudApiKey();
    if (!storedApiKey && runtimeConfig.cloudApiKey) {
        saveComfyCloudApiKey(runtimeConfig.cloudApiKey);
    }

    return {
        cloudUrl: runtimeConfig.cloudUrl,
        cloudApiKey: storedApiKey || runtimeConfig.cloudApiKey,
    };
};
