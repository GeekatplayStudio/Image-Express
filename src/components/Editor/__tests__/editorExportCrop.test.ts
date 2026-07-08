import { resolveEditorExportCropBounds } from '@/components/Editor/editorExportCrop';
import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';

describe('resolveEditorExportCropBounds', () => {
    it('prefers logical artboard bounds over stroked artboard rect size', () => {
        const canvas = {
            width: 900,
            height: 700,
            artboard: {
                left: 120,
                top: 90,
                width: 300,
                height: 200,
            },
            artboardRect: {
                left: 120,
                top: 90,
                width: 300,
                height: 200,
                scaleX: 1,
                scaleY: 1,
                strokeWidth: 2,
                getScaledWidth: () => 302,
                getScaledHeight: () => 202,
            },
        } as unknown as CanvasWithArtboard;

        expect(resolveEditorExportCropBounds(canvas)).toEqual({
            left: 120,
            top: 90,
            width: 300,
            height: 200,
        });
    });

    it('falls back to artboard rect when logical artboard metadata is unavailable', () => {
        const canvas = {
            width: 900,
            height: 700,
            artboardRect: {
                left: 100,
                top: 80,
                width: 300,
                height: 200,
                scaleX: 1,
                scaleY: 1,
                getScaledWidth: () => 300,
                getScaledHeight: () => 200,
            },
        } as unknown as CanvasWithArtboard;

        expect(resolveEditorExportCropBounds(canvas)).toEqual({
            left: 100,
            top: 80,
            width: 300,
            height: 200,
        });
    });
});