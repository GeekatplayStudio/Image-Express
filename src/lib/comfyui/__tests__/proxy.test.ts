import {
    buildComfyTransportRequestUrl,
    createLocalComfyTransport,
} from '@/lib/comfyui/connection';
import {
    buildComfyProxyUrl,
    resolveComfyBaseUrlCandidates,
} from '@/lib/comfyui/proxy';

describe('comfy proxy helpers', () => {
    it('adds host.docker.internal fallback for loopback local URLs', () => {
        expect(resolveComfyBaseUrlCandidates('http://localhost:8188')).toEqual([
            'http://localhost:8188',
            'http://host.docker.internal:8188',
        ]);
    });

    it('builds same-origin proxy URLs for browser local requests', () => {
        const transport = createLocalComfyTransport('http://localhost:8188');
        const url = buildComfyTransportRequestUrl(transport, '/view', new URLSearchParams({
            filename: 'test.png',
        }));

        expect(url).toBe(
            buildComfyProxyUrl('http://localhost:8188', '/view', new URLSearchParams({ filename: 'test.png' }))
        );
    });
});
