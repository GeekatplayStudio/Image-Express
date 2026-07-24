export type ComfyConnectionMode = 'auto' | 'local' | 'tunnel' | 'cloud';

export interface ComfyConnectionModeOption {
    value: ComfyConnectionMode;
    label: string;
    description: string;
}

export interface ComfyConnectionOptions {
    mode?: ComfyConnectionMode;
    localUrl?: string;
    tunnelUrl?: string;
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

export const COMFY_CONNECTION_MODE_OPTIONS: ComfyConnectionModeOption[] = [
    {
        value: 'auto',
        label: 'Auto (Prefer tunnel/local, then web service)',
        description: 'Try the browser-reachable tunnel first, then the local URL, then Comfy Cloud if it is configured.',
    },
    {
        value: 'local',
        label: 'Local URL only',
        description: 'Use the direct ComfyUI server URL on this machine or LAN.',
    },
    {
        value: 'tunnel',
        label: 'Tunnel / Reverse Proxy',
        description: 'Use the configured Tailscale, Funnel, or reverse-proxy URL for browser access.',
    },
    {
        value: 'cloud',
        label: 'Web Service / Comfy Cloud',
        description: 'Use the managed Comfy Cloud endpoint and API key.',
    },
];

export const getComfyConnectionModeDescription = (mode: ComfyConnectionMode): string => (
    COMFY_CONNECTION_MODE_OPTIONS.find((option) => option.value === mode)?.description
    || COMFY_CONNECTION_MODE_OPTIONS[0].description
);
