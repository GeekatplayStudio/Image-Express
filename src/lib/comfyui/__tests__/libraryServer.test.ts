import path from 'node:path';
import { fetchServerTemplateWorkflows, resolveComfyLibraryPaths } from '@/lib/comfyui/libraryServer';

const mockResolveAvailableComfyTransport = jest.fn();

jest.mock('@/lib/comfyui/connection', () => ({
    __esModule: true,
    resolveAvailableComfyTransport: (...args: unknown[]) => mockResolveAvailableComfyTransport(...args),
}));

jest.mock('@/lib/comfyui/proxy', () => ({
    __esModule: true,
    resolveComfyBaseUrlCandidates: jest.fn((url: string) => [url]),
}));

jest.mock('@/lib/comfyui/client', () => ({
    __esModule: true,
    ComfyUIClient: class MockComfyUIClient {},
}));

describe('resolveComfyLibraryPaths', () => {
    it('parses multiple workflow library folders from semicolon and newline separators', async () => {
        const resolvedPaths = await resolveComfyLibraryPaths({
            installPath: '/comfy',
            workflowLibraryPath: 'user/default/workflows;/mnt/official\n/opt/my-workflows;/mnt/official',
        });

        expect(resolvedPaths.workflowLibraryPath).toBe(path.join('/comfy', 'user/default/workflows'));
        expect(resolvedPaths.workflowLibraryPaths).toEqual([
            path.join('/comfy', 'user/default/workflows'),
            '/mnt/official',
            '/opt/my-workflows',
        ]);
    });
});

describe('fetchServerTemplateWorkflows', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        mockResolveAvailableComfyTransport.mockResolvedValue({
            kind: 'local',
            baseUrl: 'http://localhost:8188',
            apiBasePath: '',
            historyPathBase: '/history',
            healthCheckPath: '/system_stats',
            defaultHeaders: {},
        });
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('imports short-form Comfy template catalogs via the template JSON fallback path', async () => {
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url === 'http://localhost:8188/workflow_templates') {
                return {
                    ok: true,
                    json: async () => ({
                        ComfyUI_UltimateSDUpscale: ['basic-usdu'],
                    }),
                } as Response;
            }

            if (url === 'http://localhost:8188/workflow_templates/ComfyUI_UltimateSDUpscale/basic-usdu.json') {
                return {
                    ok: false,
                    status: 404,
                    json: async () => ({}),
                } as Response;
            }

            if (url === 'http://localhost:8188/api/workflow_templates/ComfyUI_UltimateSDUpscale/basic-usdu.json') {
                return {
                    ok: true,
                    json: async () => ({
                        '10': {
                            class_type: 'LoadImage',
                            inputs: {
                                image: 'input.png',
                            },
                        },
                        '11': {
                            class_type: 'ImageScale',
                            inputs: {
                                image: ['10', 0],
                                width: 2048,
                                height: 2048,
                            },
                        },
                        '12': {
                            class_type: 'SaveImage',
                            inputs: {
                                images: ['11', 0],
                                filename_prefix: 'ComfyUI',
                            },
                        },
                    }),
                } as Response;
            }

            return {
                ok: false,
                status: 404,
                json: async () => ({}),
            } as Response;
        }) as typeof global.fetch;

        const entries = await fetchServerTemplateWorkflows({
            mode: 'local',
            localUrl: 'http://localhost:8188',
        });

        expect(entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'basic-usdu',
                runnable: true,
                task: 'upscale',
                location: 'http://localhost:8188/workflow_templates/ComfyUI_UltimateSDUpscale/basic-usdu.json',
                registration: expect.objectContaining({
                    task: 'upscale',
                }),
            }),
        ]));
        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:8188/api/workflow_templates/ComfyUI_UltimateSDUpscale/basic-usdu.json',
            expect.objectContaining({
                headers: {},
            })
        );
    });

    it('uses the cloud transport api path and headers for short-form template catalogs', async () => {
        mockResolveAvailableComfyTransport.mockResolvedValueOnce({
            kind: 'cloud',
            baseUrl: 'https://cloud.comfy.org',
            apiBasePath: '/api',
            historyPathBase: '/api/history_v2',
            healthCheckPath: '/api/user',
            defaultHeaders: {
                'X-API-Key': 'cloud-key',
            },
        });

        global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === 'https://cloud.comfy.org/api/workflow_templates') {
                expect(init?.headers).toEqual({ 'X-API-Key': 'cloud-key' });
                return {
                    ok: true,
                    json: async () => ({
                        ComfyUI_UltimateSDUpscale: ['basic-usdu'],
                    }),
                } as Response;
            }

            if (url === 'https://cloud.comfy.org/api/workflow_templates/ComfyUI_UltimateSDUpscale/basic-usdu.json') {
                expect(init?.headers).toEqual({ 'X-API-Key': 'cloud-key' });
                return {
                    ok: true,
                    json: async () => ({
                        '10': {
                            class_type: 'LoadImage',
                            inputs: {
                                image: 'input.png',
                            },
                        },
                        '11': {
                            class_type: 'ImageScale',
                            inputs: {
                                image: ['10', 0],
                                width: 2048,
                                height: 2048,
                            },
                        },
                        '12': {
                            class_type: 'SaveImage',
                            inputs: {
                                images: ['11', 0],
                                filename_prefix: 'ComfyUI',
                            },
                        },
                    }),
                } as Response;
            }

            return {
                ok: false,
                status: 404,
                json: async () => ({}),
            } as Response;
        }) as typeof global.fetch;

        const entries = await fetchServerTemplateWorkflows({
            mode: 'cloud',
            cloudUrl: 'https://cloud.comfy.org',
            cloudApiKey: 'cloud-key',
        });

        expect(entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'basic-usdu',
                runnable: true,
                task: 'upscale',
                location: 'https://cloud.comfy.org/api/workflow_templates/ComfyUI_UltimateSDUpscale/basic-usdu.json',
                registration: expect.objectContaining({
                    task: 'upscale',
                }),
            }),
        ]));
    });
});