import { buildFrameZipEntryName } from '@/components/Editor/editorExportUtils';
import { MEDIA_OVERLAY_PRESETS } from '@/components/Editor/editorViewConfig';

/**
 * Overlay preset specs carry two strings: `exportToken` (stable English, used
 * for filenames and generated variant names) and `labelKey` (translated, shown
 * in the UI). Wiring a filename to the translated form would rename exported
 * files whenever the user switches language, so guard the split here.
 */
describe('media overlay export filenames', () => {
    it('builds the frame name from the English export token', () => {
        const name = buildFrameZipEntryName(
            { preset: 'instagram-story' } as never,
            0,
            '2026-07-20T00:00:00.000Z',
            { designName: 'My Page', namingTemplate: 'design-frame-preset' },
        );
        expect(name).toBe('my-page-frame-01-instagram-story-9-16.png');
    });

    it('gives every preset both an export token and a translation key', () => {
        for (const preset of MEDIA_OVERLAY_PRESETS) {
            expect(preset.exportToken).toBeTruthy();
            expect(preset.labelKey).toMatch(/^overlay\.preset\./);
        }
    });
});
