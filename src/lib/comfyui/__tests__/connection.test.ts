import {
    COMFY_CLOUD_API_KEY_STORAGE_KEY,
    createCloudComfyTransport,
    fetchRuntimeComfyConfig,
    hydrateComfyCloudSettingsFromRuntime,
    probeComfyTransportDetailed,
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
});