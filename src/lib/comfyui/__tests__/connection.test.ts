import {
    COMFY_CLOUD_API_KEY_STORAGE_KEY,
    createCloudComfyTransport,
    createLocalComfyTransport,
    fetchRuntimeComfyConfig,
    hydrateComfyCloudSettingsFromRuntime,
    isComfyConnectionConfigured,
    probeComfyTransportDetailed,
    resolveAvailableComfyTransport,
    resolveComfyLocalUrlCandidates,
    verifyAvailableComfyConnection,
} from '@/lib/comfyui/connection';

describe('comfy connection helpers', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        window.localStorage.clear();
        delete process.env.COMFY_CLOUD_API_KEY;
        delete process.env.COMFY_CLOUD_URL;
        jest.restoreAllMocks();
    });

    it('surfaces detailed Comfy Cloud API failures', async () => {
        globalThis.fetch = jest.fn(async () => ({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            text: async () => JSON.stringify({ message: 'API key authentication is not available for free tier accounts' }),
        })) as typeof fetch;

        const result = await verifyAvailableComfyConnection({
            mode: 'cloud',
            cloudUrl: 'https://cloud.comfy.org',
            cloudApiKey: 'test-key',
        });

        expect(result.ok).toBe(false);
        expect(result.message).toContain('Comfy Cloud rejected API-key authentication');
        expect(result.message).toContain('API key authentication is not available for free tier accounts');
        expect(result.message).toContain('Use a Comfy Cloud account tier with API access');
    });

    it('combines local reachability guidance with free-tier cloud auth failures in auto mode', async () => {
        globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (
                url.includes('/api/ai/comfy/proxy')
                || url.includes('localhost:8188')
                || url.includes('host.docker.internal:8188')
            ) {
                throw new Error('connect ECONNREFUSED 127.0.0.1:8188');
            }

            return {
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                text: async () => JSON.stringify({ message: 'API key authentication is not available for free tier accounts' }),
            } as Response;
        }) as typeof fetch;

        const result = await verifyAvailableComfyConnection({
            mode: 'auto',
            localUrl: 'http://localhost:8188',
            cloudUrl: 'https://cloud.comfy.org',
            cloudApiKey: 'test-key',
        });

        expect(result.ok).toBe(false);
        expect(result.message).toContain('Could not reach local ComfyUI at http://localhost:8188');
        expect(result.message).toContain('host machine');
        expect(result.message).toContain('Comfy Cloud rejected API-key authentication');
        expect(result.message).not.toContain('Could not reach Comfy Cloud');
    });

    it('prefers the configured tunnel URL for browser-side auto checks', async () => {
        expect(resolveComfyLocalUrlCandidates({
            localUrl: 'http://localhost:8188',
            tunnelUrl: 'https://comfy.tailnet.ts.net',
        })).toEqual([
            'https://comfy.tailnet.ts.net',
            'http://localhost:8188',
        ]);

        globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url.includes('comfy.tailnet.ts.net')) {
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    text: async () => '',
                } as Response;
            }

            throw new Error(`Unexpected probe target: ${url}`);
        }) as typeof fetch;

        const result = await verifyAvailableComfyConnection({
            mode: 'auto',
            localUrl: 'http://localhost:8188',
            tunnelUrl: 'https://comfy.tailnet.ts.net',
        });

        expect(result.ok).toBe(true);
        expect(result.message).toContain('https://comfy.tailnet.ts.net');
    });

    it('treats tunnel mode as a separately configurable endpoint', () => {
        expect(isComfyConnectionConfigured('tunnel', {
            tunnelUrl: 'https://comfy.tailnet.ts.net',
        })).toBe(true);

        expect(isComfyConnectionConfigured('tunnel', {
            localUrl: 'http://localhost:8188',
        })).toBe(false);
    });

    it('hydrates cloud config from the runtime route and persists the key', async () => {
        globalThis.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                cloudUrl: 'https://cloud.comfy.org',
                cloudApiKey: 'runtime-key',
            }),
        })) as typeof fetch;

        const runtimeConfig = await hydrateComfyCloudSettingsFromRuntime();

        expect(runtimeConfig.cloudUrl).toBe('https://cloud.comfy.org');
        expect(runtimeConfig.cloudApiKey).toBe('runtime-key');
        expect(window.localStorage.getItem(COMFY_CLOUD_API_KEY_STORAGE_KEY)).toBe('runtime-key');
    });

    it('returns direct runtime config values from the helper route fetch', async () => {
        globalThis.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                cloudUrl: 'https://example.com/cloud',
                cloudApiKey: 'runtime-key',
            }),
        })) as typeof fetch;

        await expect(fetchRuntimeComfyConfig()).resolves.toEqual({
            cloudUrl: 'https://example.com/cloud',
            cloudApiKey: 'runtime-key',
        });
    });

    it('captures response body messages during a detailed probe', async () => {
        globalThis.fetch = jest.fn(async () => ({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            text: async () => JSON.stringify({ message: 'free tier' }),
        })) as typeof fetch;

        const probe = await probeComfyTransportDetailed(createCloudComfyTransport('https://cloud.comfy.org', 'test-key'));

        expect(probe.ok).toBe(false);
        expect(probe.responseMessage).toBe('free tier');
    });

    it('falls back to /system_stats when /features returns 404 for a local Comfy probe', async () => {
        globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url.includes('path=%2Ffeatures')) {
                return {
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    text: async () => 'missing /features',
                } as Response;
            }

            if (url.includes('path=%2Fsystem_stats')) {
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    text: async () => '',
                } as Response;
            }

            throw new Error(`Unexpected probe target: ${url}`);
        }) as typeof fetch;

        const probe = await probeComfyTransportDetailed(createLocalComfyTransport('http://127.0.0.1:8188'));

        expect(probe.ok).toBe(true);
        expect((globalThis.fetch as jest.Mock).mock.calls).toHaveLength(2);
    });

    it('surfaces a targeted error when the local URL returns a Next.js 404 page', async () => {
        globalThis.fetch = jest.fn(async () => ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => '<!DOCTYPE html><html><head><meta data-next-head="" /><title>404: This page could not be found</title></head><body></body></html>',
        })) as typeof fetch;

        const result = await verifyAvailableComfyConnection({
            mode: 'local',
            localUrl: 'http://127.0.0.1:8188',
        });

        expect(result.ok).toBe(false);
        expect(result.message).toContain('returned a Next.js 404 page instead of the ComfyUI API');
        expect(result.message).toContain('points at this app or another web app');
    });

    it('optimistically keeps the local transport in browser contexts when the known Next.js 404 false-negative occurs', async () => {
        globalThis.fetch = jest.fn(async () => ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => '<!DOCTYPE html><html><head><meta data-next-head="" /><title>404: This page could not be found</title></head><body></body></html>',
        })) as typeof fetch;

        const transport = await resolveAvailableComfyTransport({
            mode: 'local',
            localUrl: 'http://127.0.0.1:8188',
        });

        expect(transport.kind).toBe('local');
        expect(transport.baseUrl).toBe('http://127.0.0.1:8188');
    });
});