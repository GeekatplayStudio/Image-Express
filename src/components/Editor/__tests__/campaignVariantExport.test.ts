import JSZip from 'jszip';

import { exportVariantsZip, variantFileName, zipFileName } from '@/components/Editor/campaignVariantExport';
import type { CampaignVariant } from '@/components/Editor/mediaOverlayTypes';

const variant = (id: string, name: string, format: 'png' | 'jpg' = 'png'): CampaignVariant => ({
    id,
    name,
    sourceFrameId: `frame-${id}`,
    framePreset: 'instagram-square',
    safeAreaPreset: 'none',
    bounds: { left: 0, top: 0, width: 10, height: 10 },
    adaptationMode: 'safe-area',
    exportProfile: { format, includeBackground: true },
    snapshot: { objects: [] } as unknown as CampaignVariant['snapshot'],
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
});

// A 1×1 PNG; the renderer is injected so the test never touches a canvas.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('campaign variant export', () => {
    it('names files from the page and variant only, so a re-export overwrites', () => {
        const taken = new Set<string>();
        expect(variantFileName('Summer Sale — Hero!', variant('a', 'Instagram 1:1'), taken)).toBe('summer-sale-hero-instagram-1-1.png');
        expect(variantFileName('Summer Sale — Hero!', variant('b', 'Instagram 1:1', 'jpg'), taken)).toBe('summer-sale-hero-instagram-1-1.jpg');
        // Same name, same format: numbered rather than overwritten inside one ZIP.
        expect(variantFileName('Summer Sale — Hero!', variant('c', 'Instagram 1:1'), taken)).toBe('summer-sale-hero-instagram-1-1-2.png');
        expect(variantFileName('', variant('d', ''))).toBe('untitled-untitled.png');
        expect(zipFileName('Summer Sale')).toBe('summer-sale-variants.zip');
    });

    it('renders every variant through the given renderer and zips them under deterministic names', async () => {
        const render = jest.fn(async () => PIXEL);
        const result = await exportVariantsZip('Launch', [variant('a', 'Story'), variant('b', 'Feed')], render);
        expect(result.fileName).toBe('launch-variants.zip');
        expect(result.entries).toEqual(['launch-story.png', 'launch-feed.png']);
        expect(render).toHaveBeenCalledTimes(2);
        const zip = await JSZip.loadAsync(result.blob);
        expect(Object.keys(zip.files).sort()).toEqual(['launch-feed.png', 'launch-story.png']);
        expect((await zip.file('launch-story.png')!.async('uint8array')).length).toBeGreaterThan(20);
    });
});
