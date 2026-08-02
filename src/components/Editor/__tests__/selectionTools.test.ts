import {
    applyEditorCanvasToolConfig,
    getEditorCanvasToolConfig,
    restoreEditorCanvasToolConfig,
} from '../editorCanvasToolMode';
import { buildLassoPathData, resolveSelectionInteractionTool } from '../selectionGeometry';

describe('editorCanvasToolMode', () => {
    it('disables Fabric object hit-testing for marquee and lasso', () => {
        expect(getEditorCanvasToolConfig('marquee')).toEqual(expect.objectContaining({
            selection: false,
            skipTargetFind: true,
            defaultCursor: 'crosshair',
        }));
        expect(getEditorCanvasToolConfig('lasso')).toEqual(expect.objectContaining({
            selection: false,
            skipTargetFind: true,
        }));
        expect(getEditorCanvasToolConfig('quick-select')).toEqual(expect.objectContaining({
            skipTargetFind: true,
        }));
        expect(getEditorCanvasToolConfig('selection-brush')).toEqual(expect.objectContaining({
            skipTargetFind: true,
            selection: false,
        }));
        expect(getEditorCanvasToolConfig('select')).toEqual(expect.objectContaining({
            selection: true,
            skipTargetFind: false,
        }));
    });

    it('restores marquee flags after hand-mode clobber simulation', () => {
        const canvas = {
            defaultCursor: 'default',
            hoverCursor: 'move',
            selection: true,
            skipTargetFind: false,
            requestRenderAll: jest.fn(),
        } as unknown as import('fabric').Canvas;

        applyEditorCanvasToolConfig(canvas, 'marquee');
        expect(canvas.selection).toBe(false);
        expect((canvas as { skipTargetFind?: boolean }).skipTargetFind).toBe(true);

        // Simulate old hand:mode:set(false) clobber
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        (canvas as { skipTargetFind?: boolean }).skipTargetFind = false;

        restoreEditorCanvasToolConfig(canvas);
        expect(canvas.selection).toBe(false);
        expect(canvas.defaultCursor).toBe('crosshair');
        expect((canvas as { skipTargetFind?: boolean }).skipTargetFind).toBe(true);
    });
});

describe('selectionGeometry', () => {
    it('resolves quick-select and selection-brush as first-class paint engines', () => {
        expect(resolveSelectionInteractionTool('quick-select')).toBe('quick-select');
        expect(resolveSelectionInteractionTool('selection-brush')).toBe('selection-brush');
        expect(resolveSelectionInteractionTool('marquee')).toBe('marquee');
        expect(resolveSelectionInteractionTool('wand')).toBe('wand');
        expect(resolveSelectionInteractionTool('select')).toBeNull();
    });

    it('closes lasso path data with Z', () => {
        const points = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
        ] as import('fabric').Point[];
        expect(buildLassoPathData(points, false)).not.toMatch(/ Z$/);
        expect(buildLassoPathData(points, true)).toMatch(/ Z$/);
    });
});
