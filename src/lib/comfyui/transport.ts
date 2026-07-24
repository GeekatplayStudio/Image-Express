import {
    buildComfyProxyUrl,
    normalizeComfyBaseUrl,
} from '@/lib/comfyui/proxy';
import {
    resolveConfiguredComfyCloudApiKey,
    resolveConfiguredComfyCloudUrl,
} from '@/lib/comfyui/cloudConfig';
import {
    DEFAULT_COMFY_CLOUD_URL,
    DEFAULT_COMFY_LOCAL_URL,
    type ComfyTransportProbeResult,
    type ResolvedComfyTransport,
} from '@/lib/comfyui/connectionTypes';

const LOCAL_COMFY_FALLBACK_HEALTH_CHECK_PATH = '/system_stats';
const COMFY_LOCAL_HOST_MACHINE_HINT = 'If this app is running in Docker while ComfyUI is on the host machine, keep the URL as localhost or switch to host.docker.internal and the app proxy will retry it server-side.';

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

export const looksLikeNextNotFoundResponse = (probe: Pick<ComfyTransportProbeResult, 'status' | 'responseMessage'>): boolean => {
    if (probe.status !== 404 || !probe.responseMessage) {
        return false;
    }

    return /data-next-head|__next_data__|404:\s*this page could not be found/i.test(probe.responseMessage);
};

const runComfyTransportProbeRequest = async (
    transport: ResolvedComfyTransport,
    path: string,
    signal: AbortSignal
): Promise<ComfyTransportProbeResult> => {
    const response = await fetch(buildComfyTransportRequestUrl(transport, path), {
        method: 'GET',
        headers: transport.defaultHeaders,
        signal,
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
};

export const probeComfyTransportDetailed = async (
    transport: ResolvedComfyTransport,
    timeoutMs: number = 2500
): Promise<ComfyTransportProbeResult> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const primaryProbe = await runComfyTransportProbeRequest(
            transport,
            transport.healthCheckPath,
            controller.signal,
        );
        if (primaryProbe.ok) {
            return primaryProbe;
        }

        if (
            transport.kind === 'local'
            && primaryProbe.status === 404
            && transport.healthCheckPath !== LOCAL_COMFY_FALLBACK_HEALTH_CHECK_PATH
        ) {
            const fallbackProbe = await runComfyTransportProbeRequest(
                transport,
                LOCAL_COMFY_FALLBACK_HEALTH_CHECK_PATH,
                controller.signal,
            );
            if (fallbackProbe.ok) {
                return fallbackProbe;
            }

            if (looksLikeNextNotFoundResponse(fallbackProbe)) {
                return fallbackProbe;
            }
        }

        return primaryProbe;
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

export const formatComfyTransportFailure = (
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

        if (looksLikeNextNotFoundResponse(probe)) {
            return `Local ComfyUI check at ${transport.baseUrl} returned a Next.js 404 page instead of the ComfyUI API. This usually means the configured local URL points at this app or another web app rather than a running ComfyUI server. Start ComfyUI on its own port and use that URL here.`;
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
