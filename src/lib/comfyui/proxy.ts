export const COMFY_PROXY_ROUTE = '/api/ai/comfy/proxy';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const normalizeComfyBaseUrl = (url: string): string => url.trim().replace(/\/$/, '');

export const isLoopbackComfyHost = (hostname: string): boolean => LOOPBACK_HOSTS.has(hostname.toLowerCase());

export const resolveComfyBaseUrlCandidates = (baseUrl: string): string[] => {
    const normalized = normalizeComfyBaseUrl(baseUrl);
    if (!normalized) {
        return [];
    }

    try {
        const parsed = new URL(normalized);
        const candidates = [parsed.toString().replace(/\/$/, '')];
        const hostname = parsed.hostname.toLowerCase();

        if (isLoopbackComfyHost(hostname)) {
            const dockerReachable = new URL(parsed.toString());
            dockerReachable.hostname = 'host.docker.internal';
            candidates.push(dockerReachable.toString().replace(/\/$/, ''));
        } else if (hostname === 'host.docker.internal') {
            const hostReachable = new URL(parsed.toString());
            hostReachable.hostname = 'localhost';
            candidates.push(hostReachable.toString().replace(/\/$/, ''));
        }

        return Array.from(new Set(candidates));
    } catch {
        return [normalized];
    }
};

export const buildComfyProxyUrl = (
    upstreamBaseUrl: string,
    path: string,
    searchParams?: URLSearchParams
): string => {
    const params = new URLSearchParams(searchParams);
    params.set('upstream', normalizeComfyBaseUrl(upstreamBaseUrl));
    params.set('path', path.startsWith('/') ? path : `/${path}`);
    return `${COMFY_PROXY_ROUTE}?${params.toString()}`;
};
