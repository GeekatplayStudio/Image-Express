import { buildComfyOutpaintPayload, type ComfyCapturedSource } from '../comfyCanvasSources';

describe('buildComfyOutpaintPayload', () => {
    const source: ComfyCapturedSource = {
        dataUrl: 'data:image/png;base64,source',
        width: 100,
        height: 80,
        bounds: { left: 0, top: 0, width: 100, height: 80 },
        layerIds: [],
    };

    it('resolves null when no side has padding', async () => {
        const payload = await buildComfyOutpaintPayload(source, { top: 0, right: 0, bottom: 0, left: 0 });
        expect(payload).toBeNull();
    });
});
