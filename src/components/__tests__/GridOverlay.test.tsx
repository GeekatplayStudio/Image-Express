import React from 'react';
import { render } from '@testing-library/react';
import { GridOverlay, GridType } from '../GridOverlay';

type MockCtx = {
    save: jest.Mock;
    transform: jest.Mock;
    beginPath: jest.Mock;
    moveTo: jest.Mock;
    lineTo: jest.Mock;
    rect: jest.Mock;
    stroke: jest.Mock;
    restore: jest.Mock;
    lineWidth: number;
    strokeStyle: string;
};

type CanvasStub = {
    contextContainer: MockCtx | null;
    viewportTransform: [number, number, number, number, number, number];
    artboard?: { width: number; height: number; left: number; top: number };
    on: jest.Mock;
    off: jest.Mock;
    requestRenderAll: jest.Mock;
};

const createMockCtx = (): MockCtx => ({
    save: jest.fn(),
    transform: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    rect: jest.fn(),
    stroke: jest.fn(),
    restore: jest.fn(),
    lineWidth: 0,
    strokeStyle: '',
});

const createCanvasStub = (ctx: MockCtx, overrides?: Partial<CanvasStub>): CanvasStub => {
    const handlers = new Map<string, (opt: { ctx?: MockCtx }) => void>();

    return {
        contextContainer: ctx,
        viewportTransform: [2, 0, 0, 2, 10, 20],
        artboard: { width: 900, height: 600, left: 50, top: 30 },
        on: jest.fn((eventName: string, cb: (opt: { ctx?: MockCtx }) => void) => {
            handlers.set(eventName, cb);
        }),
        off: jest.fn((eventName: string) => {
            handlers.delete(eventName);
        }),
        requestRenderAll: jest.fn(),
        ...overrides,
    };
};

const getAfterRenderHandler = (canvas: CanvasStub) => {
    const call = canvas.on.mock.calls.find((entry) => entry[0] === 'after:render');
    return call?.[1] as ((opt: { ctx?: MockCtx }) => void) | undefined;
};

describe('GridOverlay', () => {
    it('registers and cleans up after:render listeners', () => {
        const ctx = createMockCtx();
        const canvas = createCanvasStub(ctx);
        const { unmount } = render(
            <GridOverlay canvas={canvas as unknown as never} gridType="rule-of-thirds" />
        );

        const drawGrid = getAfterRenderHandler(canvas);
        expect(drawGrid).toBeDefined();
        expect(canvas.requestRenderAll).toHaveBeenCalledTimes(1);

        unmount();
        expect(canvas.off).toHaveBeenCalledWith('after:render', drawGrid);
        expect(canvas.requestRenderAll).toHaveBeenCalledTimes(2);
    });

    it('does not draw for gridType none or when context is missing', () => {
        const ctx = createMockCtx();
        const canvasNone = createCanvasStub(ctx);
        render(<GridOverlay canvas={canvasNone as unknown as never} gridType="none" />);
        const noneHandler = getAfterRenderHandler(canvasNone);
        noneHandler?.({ ctx });
        expect(ctx.save).not.toHaveBeenCalled();

        const ctxMissing = createMockCtx();
        const canvasMissing = createCanvasStub(ctxMissing);
        render(<GridOverlay canvas={canvasMissing as unknown as never} gridType="cross" />);
        const missingHandler = getAfterRenderHandler(canvasMissing);
        missingHandler?.({});
        expect(ctxMissing.save).not.toHaveBeenCalled();
    });

    it('skips drawing when context does not match interactive canvas context', () => {
        const interactiveCtx = createMockCtx();
        const exportCtx = createMockCtx();
        const canvas = createCanvasStub(interactiveCtx);
        render(<GridOverlay canvas={canvas as unknown as never} gridType="cross" />);

        const drawGrid = getAfterRenderHandler(canvas);
        drawGrid?.({ ctx: exportCtx });

        expect(exportCtx.save).not.toHaveBeenCalled();
        expect(interactiveCtx.save).not.toHaveBeenCalled();
    });

    it('skips drawing when artboard metadata is missing', () => {
        const ctx = createMockCtx();
        const canvas = createCanvasStub(ctx, { artboard: undefined });
        render(<GridOverlay canvas={canvas as unknown as never} gridType="rule-of-thirds" />);

        const drawGrid = getAfterRenderHandler(canvas);
        drawGrid?.({ ctx });

        expect(ctx.save).not.toHaveBeenCalled();
        expect(ctx.moveTo).not.toHaveBeenCalled();
    });

    const drawAndAssert = (gridType: GridType) => {
        const ctx = createMockCtx();
        const canvas = createCanvasStub(ctx);
        render(<GridOverlay canvas={canvas as unknown as never} gridType={gridType} color="rgba(1,2,3,0.5)" />);
        const drawGrid = getAfterRenderHandler(canvas);
        drawGrid?.({ ctx });
        return { ctx };
    };

    it('draws rule-of-thirds guidelines', () => {
        const { ctx } = drawAndAssert('rule-of-thirds');
        expect(ctx.save).toHaveBeenCalledTimes(1);
        expect(ctx.transform).toHaveBeenCalledWith(2, 0, 0, 2, 10, 20);
        expect(ctx.beginPath).toHaveBeenCalledTimes(1);
        expect(ctx.moveTo).toHaveBeenCalledTimes(4);
        expect(ctx.lineTo).toHaveBeenCalledTimes(4);
        expect(ctx.stroke).toHaveBeenCalledTimes(1);
        expect(ctx.restore).toHaveBeenCalledTimes(1);
        expect(ctx.strokeStyle).toBe('rgba(1,2,3,0.5)');
        expect(ctx.lineWidth).toBeCloseTo(0.5);
    });

    it('draws golden-ratio guidelines', () => {
        const { ctx } = drawAndAssert('golden-ratio');
        expect(ctx.moveTo).toHaveBeenCalledTimes(4);
        expect(ctx.lineTo).toHaveBeenCalledTimes(4);
    });

    it('draws center cross guidelines', () => {
        const { ctx } = drawAndAssert('cross');
        expect(ctx.moveTo).toHaveBeenCalledTimes(2);
        expect(ctx.lineTo).toHaveBeenCalledTimes(2);
    });

    it('draws a 4x4 grid', () => {
        const { ctx } = drawAndAssert('grid-4x4');
        expect(ctx.moveTo).toHaveBeenCalledTimes(6);
        expect(ctx.lineTo).toHaveBeenCalledTimes(6);
    });

    it('draws canvas border rectangle', () => {
        const { ctx } = drawAndAssert('canvas-border');
        expect(ctx.rect).toHaveBeenCalledTimes(1);
        expect(ctx.stroke).toHaveBeenCalledTimes(1);
    });
});
