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
}

export interface ComfyConnectionCheckResult {
    ok: boolean;
    transport?: ResolvedComfyTransport;
    message: string;
}

export const DEFAULT_COMFY_LOCAL_URL = 'http://localhost:8188';
export const DEFAULT_COMFY_CLOUD_URL = 'https://cloud.comfy.org';
export const COMFY_CLOUD_API_KEY_STORAGE_KEY = 'comfy_cloud_api_key';

const normalizeBaseUrl = (url: string) => url.trim().replace(/\/$/, '');

export const loadComfyCloudApiKey = (): string => {
    if (typeof window === 'undefined') {
        return '';
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
    baseUrl: normalizeBaseUrl(baseUrl) || DEFAULT_COMFY_LOCAL_URL,
    apiBasePath: '',
    historyPathBase: '/history',
    healthCheckPath: '/features',
    defaultHeaders: {},
});

export const createCloudComfyTransport = (
    baseUrl: string = DEFAULT_COMFY_CLOUD_URL,
    apiKey: string
): ResolvedComfyTransport => {
    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
        throw new Error('Comfy Cloud API key is required for cloud mode.');
    }

    return {
        kind: 'cloud',
        baseUrl: normalizeBaseUrl(baseUrl) || DEFAULT_COMFY_CLOUD_URL,
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
        const response = await fetch(`${transport.baseUrl}${transport.healthCheckPath}`, {
            method: 'GET',
            headers: transport.defaultHeaders,
            signal: controller.signal,
        });

        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
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
            return `Comfy Cloud responded with HTTP ${statusLabel} at ${transport.baseUrl}. Check the cloud URL and API key.`;
        }

        return `Local ComfyUI responded with HTTP ${statusLabel} at ${transport.baseUrl}.`;
    }

    if (transport.kind === 'local') {
        return `Could not reach local ComfyUI from the browser at ${transport.baseUrl}. If ComfyUI is running, start it with --enable-cors-header.`;
    }

    return `Could not reach Comfy Cloud at ${transport.baseUrl}. Check the cloud URL and API key.`;
};

export const verifyAvailableComfyConnection = async (
    options: ComfyConnectionOptions = {}
): Promise<ComfyConnectionCheckResult> => {
    const mode = options.mode || 'auto';
    const localTransport = createLocalComfyTransport(options.localUrl);
    const hasCloudApiKey = Boolean(options.cloudApiKey && options.cloudApiKey.trim());
    const cloudTransport = hasCloudApiKey
        ? createCloudComfyTransport(options.cloudUrl, options.cloudApiKey as string)
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
