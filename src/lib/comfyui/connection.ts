import { normalizeComfyBaseUrl } from '@/lib/comfyui/proxy';
import {
    resolveConfiguredComfyCloudApiKey,
    resolveConfiguredComfyCloudUrl,
} from '@/lib/comfyui/cloudConfig';
import {
    createCloudComfyTransport,
    createLocalComfyTransport,
    formatComfyTransportFailure,
    probeComfyTransportDetailed,
} from '@/lib/comfyui/transport';
import {
    DEFAULT_COMFY_LOCAL_URL,
    type ComfyConnectionCheckResult,
    type ComfyConnectionMode,
    type ComfyConnectionOptions,
    type ResolvedComfyTransport,
} from '@/lib/comfyui/connectionTypes';

export type {
    ComfyConnectionMode,
    ComfyConnectionModeOption,
    ComfyConnectionOptions,
    ResolvedComfyTransport,
    ComfyTransportProbeResult,
    ComfyConnectionCheckResult,
    RuntimeComfyConfig,
} from '@/lib/comfyui/connectionTypes';
export {
    DEFAULT_COMFY_LOCAL_URL,
    DEFAULT_COMFY_CLOUD_URL,
    COMFY_CLOUD_API_KEY_STORAGE_KEY,
    COMFY_CONNECTION_MODE_OPTIONS,
    getComfyConnectionModeDescription,
} from '@/lib/comfyui/connectionTypes';
export {
    resolveConfiguredComfyCloudUrl,
    resolveConfiguredComfyCloudApiKey,
    loadComfyCloudApiKey,
    saveComfyCloudApiKey,
    fetchRuntimeComfyConfig,
    hydrateComfyCloudSettingsFromRuntime,
} from '@/lib/comfyui/cloudConfig';
export {
    createLocalComfyTransport,
    createCloudComfyTransport,
    probeComfyTransport,
    probeComfyTransportDetailed,
    shouldUseComfyBrowserProxy,
    buildComfyTransportRequestUrl,
} from '@/lib/comfyui/transport';

const normalizeConfiguredComfyUrl = (value?: string): string => {
    if (typeof value !== 'string') {
        return '';
    }

    return normalizeComfyBaseUrl(value);
};

const hasConfiguredLocalEndpoint = (options: Pick<ComfyConnectionOptions, 'localUrl' | 'tunnelUrl'> = {}): boolean => (
    Boolean(normalizeConfiguredComfyUrl(options.localUrl) || normalizeConfiguredComfyUrl(options.tunnelUrl))
);

const hasConfiguredTunnelEndpoint = (options: Pick<ComfyConnectionOptions, 'tunnelUrl'> = {}): boolean => (
    Boolean(normalizeConfiguredComfyUrl(options.tunnelUrl))
);

const isKnownBrowserLocalProbeFalseNegative = (message: string): boolean => (
    /returned a Next\.js 404 page instead of the ComfyUI API/i.test(message)
);

const hasConfiguredCloudEndpoint = (options: Pick<ComfyConnectionOptions, 'cloudUrl' | 'cloudApiKey'> = {}): boolean => (
    Boolean(resolveConfiguredComfyCloudUrl(options.cloudUrl).trim() && resolveConfiguredComfyCloudApiKey(options.cloudApiKey))
);

export const isComfyConnectionConfigured = (
    mode: ComfyConnectionMode,
    options: Pick<ComfyConnectionOptions, 'localUrl' | 'tunnelUrl' | 'cloudUrl' | 'cloudApiKey'> = {},
): boolean => {
    if (mode === 'local') {
        return hasConfiguredLocalEndpoint(options);
    }

    if (mode === 'tunnel') {
        return hasConfiguredTunnelEndpoint(options);
    }

    if (mode === 'cloud') {
        return hasConfiguredCloudEndpoint(options);
    }

    return hasConfiguredLocalEndpoint(options) || hasConfiguredCloudEndpoint(options);
};

export const resolveComfyLocalUrlCandidates = (
    options: Pick<ComfyConnectionOptions, 'localUrl' | 'tunnelUrl'> = {}
): string[] => {
    const localUrl = normalizeConfiguredComfyUrl(options.localUrl);
    const tunnelUrl = normalizeConfiguredComfyUrl(options.tunnelUrl);
    const orderedCandidates = typeof window === 'undefined'
        ? [localUrl, tunnelUrl]
        : [tunnelUrl, localUrl];

    return Array.from(new Set(orderedCandidates.filter(Boolean)));
};

const buildLocalComfyTransports = (
    options: Pick<ComfyConnectionOptions, 'localUrl' | 'tunnelUrl'> = {}
): ResolvedComfyTransport[] => {
    const candidates = resolveComfyLocalUrlCandidates(options);
    if (candidates.length === 0) {
        return [createLocalComfyTransport()];
    }

    return candidates.map((candidate) => createLocalComfyTransport(candidate));
};

const probeAvailableLocalTransport = async (
    options: Pick<ComfyConnectionOptions, 'localUrl' | 'tunnelUrl'> = {}
): Promise<
    | { ok: true; transport: ResolvedComfyTransport; message: string }
    | { ok: false; message: string }
> => {
    const failureMessages: string[] = [];

    for (const localTransport of buildLocalComfyTransports(options)) {
        const localProbe = await probeComfyTransportDetailed(localTransport);
        if (localProbe.ok) {
            return {
                ok: true,
                transport: localTransport,
                message: `Connected to local ComfyUI at ${localTransport.baseUrl}.`,
            };
        }

        failureMessages.push(formatComfyTransportFailure(localTransport, localProbe));
    }

    return {
        ok: false,
        message: failureMessages.join(' '),
    };
};

const probeSpecifiedLocalTransport = async (
    endpointUrl: string,
    successMessage: string,
    missingMessage: string,
): Promise<ComfyConnectionCheckResult> => {
    const normalizedUrl = normalizeConfiguredComfyUrl(endpointUrl);
    if (!normalizedUrl) {
        return {
            ok: false,
            message: missingMessage,
        };
    }

    const transport = createLocalComfyTransport(normalizedUrl);
    const probe = await probeComfyTransportDetailed(transport);
    if (!probe.ok) {
        return {
            ok: false,
            message: formatComfyTransportFailure(transport, probe),
        };
    }

    return {
        ok: true,
        transport,
        message: successMessage.replace('{url}', transport.baseUrl),
    };
};

export const verifyAvailableComfyConnection = async (
    options: ComfyConnectionOptions = {}
): Promise<ComfyConnectionCheckResult> => {
    const mode = options.mode || 'auto';
    const resolvedCloudApiKey = resolveConfiguredComfyCloudApiKey(options.cloudApiKey);
    const hasCloudApiKey = Boolean(resolvedCloudApiKey);
    const cloudTransport = hasCloudApiKey
        ? createCloudComfyTransport(resolveConfiguredComfyCloudUrl(options.cloudUrl), resolvedCloudApiKey)
        : null;

    if (mode === 'local') {
        return probeSpecifiedLocalTransport(
            options.localUrl || options.tunnelUrl || DEFAULT_COMFY_LOCAL_URL,
            'Connected to ComfyUI at {url}.',
            'Local mode requires a local ComfyUI URL or a configured fallback tunnel URL.'
        );
    }

    if (mode === 'tunnel') {
        return probeSpecifiedLocalTransport(
            options.tunnelUrl || '',
            'Connected to the ComfyUI tunnel at {url}.',
            'Tunnel mode requires a tunnel URL.'
        );
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

    const localResult = await probeAvailableLocalTransport(options);
    if (localResult.ok) {
        return {
            ok: true,
            transport: localResult.transport,
            message: localResult.message,
        };
    }

    if (!cloudTransport) {
        return {
            ok: false,
            message: localResult.message,
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
        message: `${localResult.message} ${formatComfyTransportFailure(cloudTransport, cloudProbe)}`,
    };
};

export const resolveAvailableComfyTransport = async (
    options: ComfyConnectionOptions = {}
): Promise<ResolvedComfyTransport> => {
    const verification = await verifyAvailableComfyConnection(options);
    if (!verification.ok || !verification.transport) {
        if (typeof window !== 'undefined' && isKnownBrowserLocalProbeFalseNegative(verification.message)) {
            const localCandidates = resolveComfyLocalUrlCandidates(options);
            const optimisticLocalCandidate = localCandidates[0];
            if (optimisticLocalCandidate) {
                return createLocalComfyTransport(optimisticLocalCandidate);
            }
        }

        throw new Error(verification.message);
    }

    return verification.transport;
};
