import {
    buildComfyProxyUrl,
    normalizeComfyBaseUrl,
} from '@/lib/comfyui/proxy';

const COMFY_CLOUD_URL_ENV_KEYS = ['COMFY_CLOUD_URL', 'NEXT_PUBLIC_COMFY_CLOUD_URL'] as const;
const COMFY_CLOUD_API_KEY_ENV_KEYS = ['COMFY_CLOUD_API_KEY', 'NEXT_PUBLIC_COMFY_CLOUD_API_KEY'] as const;
const RUNTIME_COMFY_CONFIG_ROUTE = '/api/runtime/comfy';

export type ComfyConnectionMode = 'auto' | 'local' | 'cloud';

export interface ComfyConnectionOptions {
    mode?: ComfyConnectionMode;
    localUrl?: string;
    cloudUrl?: string;
    cloudApiKey?: string;
}

export interface ResolvedComfyTransport {
    kind: 'local' | 'cloud';
    baseUrl: string;
    apiBasePath: string;
    historyPathBase: string;
    healthCheckPath: string;
    defaultHeaders: Record<string, string>;
    websocketToken?: string;
}

export interface ComfyTransportProbeResult {
    ok: boolean;
    status?: number;
    statusText?: string;
    error?: string;
    responseMessage?: string;
}

export interface ComfyConnectionCheckResult {
    ok: boolean;
    transport?: ResolvedComfyTransport;
    message: string;
}

export interface RuntimeComfyConfig {
    cloudUrl: string;
    cloudApiKey: string;
}

export const DEFAULT_COMFY_LOCAL_URL = 'http://localhost:8188';
export const DEFAULT_COMFY_CLOUD_URL = 'https://cloud.comfy.org';
export const COMFY_CLOUD_API_KEY_STORAGE_KEY = 'comfy_cloud_api_key';

const COMFY_LOCAL_HOST_MACHINE_HINT = 'If this app is running in Docker while ComfyUI is on the host machine, keep the URL as localhost or switch to host.docker.internal and the app proxy will retry it server-side.';

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

const extractProbeResponseMessage = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) {
        return '';
    }

    try {
        const parsed = JSON.parse(trimmed) as { message?: unknown; detail?: unknown; error?: unknown };
        const candidate = parsed.message || parsed.detail || parsed.error;
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    } catch {
        // Fall back to the raw response body.
    }

    return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
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

export const createLocalComfyTransport = (baseUrl: string = DEFAULT_COMFY_LOCAL_URL): ResolvedComfyTransport => ({
    kind: 'local',
    baseUrl: normalizeComfyBaseUrl(baseUrl) || DEFAULT_COMFY_LOCAL_URL,
    apiBasePath: '',
    historyPathBase: '/history',
    healthCheckPath: '/features',
    defaultHeaders: {},
});

export const createCloudComfyTransport = (
    baseUrl: string = DEFAULT_COMFY_CLOUD_URL,
    apiKey: string
): ResolvedComfyTransport => {
    const normalizedApiKey = resolveConfiguredComfyCloudApiKey(apiKey);
    if (!normalizedApiKey) {
        throw new Error('Comfy Cloud API key is required for cloud mode.');
    }

    return {
        kind: 'cloud',
        baseUrl: normalizeComfyBaseUrl(resolveConfiguredComfyCloudUrl(baseUrl)) || DEFAULT_COMFY_CLOUD_URL,
        apiBasePath: '/api',
        historyPathBase: '/api/history_v2',
        healthCheckPath: '/api/user',
        defaultHeaders: {
            'X-API-Key': normalizedApiKey,
        },
        websocketToken: normalizedApiKey,
    };
};

export const probeComfyTransportDetailed = async (
    transport: ResolvedComfyTransport,
    timeoutMs: number = 2500
): Promise<ComfyTransportProbeResult> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(buildComfyTransportRequestUrl(transport, transport.healthCheckPath), {
            method: 'GET',
            headers: transport.defaultHeaders,
            signal: controller.signal,
        });

        let responseMessage = '';
        if (!response.ok) {
            responseMessage = extractProbeResponseMessage(await response.text().catch(() => ''));
        }

        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            responseMessage,
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    } finally {
        clearTimeout(timeoutId);
    }
};

export const probeComfyTransport = async (
    transport: ResolvedComfyTransport,
    timeoutMs: number = 2500
): Promise<boolean> => (await probeComfyTransportDetailed(transport, timeoutMs)).ok;

const formatComfyTransportFailure = (
    transport: ResolvedComfyTransport,
    probe: ComfyTransportProbeResult
): string => {
    if (probe.status) {
        const statusLabel = probe.statusText ? `${probe.status} ${probe.statusText}` : String(probe.status);
        if (transport.kind === 'cloud') {
            const isFreeTierAuthFailure = probe.status === 403
                && typeof probe.responseMessage === 'string'
                && /free tier accounts?/i.test(probe.responseMessage);

            if (probe.responseMessage) {
                if (isFreeTierAuthFailure) {
                    return `Comfy Cloud rejected API-key authentication at ${transport.baseUrl}: ${probe.responseMessage}. Use a Comfy Cloud account tier with API access, or switch to local ComfyUI.`;
                }
                return `Comfy Cloud responded with HTTP ${statusLabel} at ${transport.baseUrl}: ${probe.responseMessage}`;
            }
            return `Comfy Cloud responded with HTTP ${statusLabel} at ${transport.baseUrl}. Check the cloud URL and API key.`;
        }

        if (probe.responseMessage) {
            return `Local ComfyUI responded with HTTP ${statusLabel} at ${transport.baseUrl}: ${probe.responseMessage}`;
        }

        return `Local ComfyUI responded with HTTP ${statusLabel} at ${transport.baseUrl}.`;
    }

    if (transport.kind === 'local') {
        return `Could not reach local ComfyUI at ${transport.baseUrl}. ${COMFY_LOCAL_HOST_MACHINE_HINT}`;
    }

    return `Could not reach Comfy Cloud at ${transport.baseUrl}. Check the cloud URL and API key.`;
};

export const verifyAvailableComfyConnection = async (
    options: ComfyConnectionOptions = {}
): Promise<ComfyConnectionCheckResult> => {
    const mode = options.mode || 'auto';
    const localTransport = createLocalComfyTransport(options.localUrl);
    const resolvedCloudApiKey = resolveConfiguredComfyCloudApiKey(options.cloudApiKey);
    const hasCloudApiKey = Boolean(resolvedCloudApiKey);
    const cloudTransport = hasCloudApiKey
        ? createCloudComfyTransport(resolveConfiguredComfyCloudUrl(options.cloudUrl), resolvedCloudApiKey)
        : null;

    if (mode === 'local') {
        const localProbe = await probeComfyTransportDetailed(localTransport);
        if (!localProbe.ok) {
            return {
                ok: false,
                message: formatComfyTransportFailure(localTransport, localProbe),
            };
        }

        return {
            ok: true,
            transport: localTransport,
            message: `Connected to local ComfyUI at ${localTransport.baseUrl}.`,
        };
    }

    if (mode === 'cloud') {
        if (!cloudTransport) {
            return {
                ok: false,
                message: 'Comfy Cloud mode requires a cloud API key.',
            };
        }

        const cloudProbe = await probeComfyTransportDetailed(cloudTransport);
        if (!cloudProbe.ok) {
            return {
                ok: false,
                message: formatComfyTransportFailure(cloudTransport, cloudProbe),
            };
        }

        return {
            ok: true,
            transport: cloudTransport,
            message: `Connected to Comfy Cloud at ${cloudTransport.baseUrl}.`,
        };
    }

    const localProbe = await probeComfyTransportDetailed(localTransport);
    if (localProbe.ok) {
        return {
            ok: true,
            transport: localTransport,
            message: `Connected to local ComfyUI at ${localTransport.baseUrl}.`,
        };
    }

    if (!cloudTransport) {
        return {
            ok: false,
            message: formatComfyTransportFailure(localTransport, localProbe),
        };
    }

    const cloudProbe = await probeComfyTransportDetailed(cloudTransport);
    if (cloudProbe.ok) {
        return {
            ok: true,
            transport: cloudTransport,
            message: `Local ComfyUI was unavailable, but Comfy Cloud is reachable at ${cloudTransport.baseUrl}.`,
        };
    }

    return {
        ok: false,
        message: `${formatComfyTransportFailure(localTransport, localProbe)} ${formatComfyTransportFailure(cloudTransport, cloudProbe)}`,
    };
};

export const resolveAvailableComfyTransport = async (
    options: ComfyConnectionOptions = {}
): Promise<ResolvedComfyTransport> => {
    const verification = await verifyAvailableComfyConnection(options);
    if (!verification.ok || !verification.transport) {
        throw new Error(verification.message);
    }

    return verification.transport;
};

export const shouldUseComfyBrowserProxy = (transport: ResolvedComfyTransport): boolean => (
    transport.kind === 'local' && typeof window !== 'undefined'
);

export const buildComfyTransportRequestUrl = (
    transport: ResolvedComfyTransport,
    path: string,
    searchParams?: URLSearchParams
): string => {
    if (shouldUseComfyBrowserProxy(transport)) {
        return buildComfyProxyUrl(transport.baseUrl, path, searchParams);
    }

    const url = new URL(path, `${transport.baseUrl}/`);
    if (searchParams) {
        searchParams.forEach((value, key) => {
            url.searchParams.append(key, value);
        });
    }
    return url.toString();
};
