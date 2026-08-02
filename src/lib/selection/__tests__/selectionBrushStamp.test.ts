import { createDocumentSelectionMask } from '@/lib/selection/documentSelectionMask';
import {
    stampQuickSelectIntoMask,
    stampSelectionBrushIntoMask,
} from '@/lib/selection/selectionBrushStamp';

describe('selectionBrushStamp', () => {
    it('expands the mask with an add stamp and contracts with subtract', () => {
        const mask = createDocumentSelectionMask({ left: 0, top: 0, width: 64, height: 64 });
        stampSelectionBrushIntoMask(mask, 32, 32, 10, 'add', 100);
        const added = mask.data.filter((v) => v > 0).length;
        expect(added).toBeGreaterThan(50);

        stampSelectionBrushIntoMask(mask, 32, 32, 10, 'subtract', 100);
        const after = mask.data.filter((v) => v > 0).length;
        expect(after).toBeLessThan(added);
    });

    it('quick-select grows into similar colors under the brush', () => {
        const width = 32;
        const height = 32;
        const mask = createDocumentSelectionMask({ left: 0, top: 0, width, height });
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i += 1) {
            const p = i * 4;
            rgba[p] = 40; rgba[p + 1] = 80; rgba[p + 2] = 160; rgba[p + 3] = 255;
        }
        const source = { data: rgba, width, height, colorSpace: 'srgb' } as ImageData;
        stampQuickSelectIntoMask(mask, source, 8, 8, 4, 'add', 30);
        expect(mask.data.filter((v) => v > 0).length).toBeGreaterThan(20);
    });
});
