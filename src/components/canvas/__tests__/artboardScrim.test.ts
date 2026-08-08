/**
 * @jest-environment node
 */

import {
    getArtboardScreenRect,
    paintOutsideArtboard,
    toWashColor,
} from '@/components/canvas/artboardScrim';

const page = { left: 0, top: 0, width: 1000, height: 800 };

describe('getArtboardScreenRect', () => {
    it('is the page itself at 1:1 with no pan', () => {
        expect(getArtboardScreenRect(page, [1, 0, 0, 1, 0, 0]))
            .toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    });

    it('scales with zoom', () => {
        expect(getArtboardScreenRect(page, [0.5, 0, 0, 0.5, 0, 0]))
            .toEqual({ x: 0, y: 0, width: 500, height: 400 });
    });

    it('follows the pan', () => {
        expect(getArtboardScreenRect(page, [1, 0, 0, 1, 120, -40]))
            .toMatchObject({ x: 120, y: -40 });
    });

    it('applies zoom to the origin, not just the size', () => {
        // The bug this guards: scaling width/height but forgetting that a page
        // offset from the origin also moves as you zoom, which slides the fade
        // out of alignment with the border.
        const offset = { left: 200, top: 100, width: 400, height: 300 };
        expect(getArtboardScreenRect(offset, [2, 0, 0, 2, 0, 0]))
            .toEqual({ x: 400, y: 200, width: 800, height: 600 });
    });

    it('combines zoom and pan', () => {
        expect(getArtboardScreenRect({ left: 10, top: 20, width: 100, height: 50 }, [2, 0, 0, 2, 5, 7]))
            .toEqual({ x: 25, y: 47, width: 200, height: 100 });
    });

    it('survives a malformed transform rather than producing NaN', () => {
        // NaN geometry paints nothing, so the page boundary would vanish.
        const rect = getArtboardScreenRect(page, []);
        expect(Object.values(rect).every(Number.isFinite)).toBe(true);
    });
});

describe('toWashColor', () => {
    it('converts a six-digit hex workspace colour', () => {
        expect(toWashColor('#1E1E1E', 0.72)).toBe('rgba(30, 30, 30, 0.72)');
    });

    it('converts shorthand hex', () => {
        expect(toWashColor('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    });

    it('accepts rgb and rgba input', () => {
        expect(toWashColor('rgb(10, 20, 30)', 0.4)).toBe('rgba(10, 20, 30, 0.4)');
        expect(toWashColor('rgba(10, 20, 30, 1)', 0.4)).toBe('rgba(10, 20, 30, 0.4)');
    });

    it('is case-insensitive', () => {
        expect(toWashColor('#ABCDEF', 0.5)).toBe(toWashColor('#abcdef', 0.5));
    });

    it('falls back to a neutral wash for a colour it cannot read', () => {
        // Never return "transparent": a scrim that vanishes leaves no page
        // boundary at all, which is the thing this feature exists to show.
        for (const input of ['rebeccapurple', 'var(--surface)', '', undefined]) {
            expect(toWashColor(input, 0.72)).toBe('rgba(24, 24, 24, 0.72)');
        }
    });

    it('clamps alpha into range', () => {
        expect(toWashColor('#000', 5)).toBe('rgba(0, 0, 0, 1)');
        expect(toWashColor('#000', -1)).toBe('rgba(0, 0, 0, 0)');
    });
});

describe('paintOutsideArtboard', () => {
    const makeCtx = () => {
        const calls: string[] = [];
        const ctx = {
            fillStyle: '',
            save: () => calls.push('save'),
            restore: () => calls.push('restore'),
            beginPath: () => calls.push('beginPath'),
            rect: (x: number, y: number, w: number, h: number) => calls.push(`rect(${x},${y},${w},${h})`),
            fill: (rule?: string) => calls.push(`fill(${rule ?? ''})`),
        };
        return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
    };

    it('punches the page out of the viewport with an even-odd fill', () => {
        const { ctx, calls } = makeCtx();
        paintOutsideArtboard(
            ctx,
            { width: 1280, height: 720 },
            { x: 100, y: 50, width: 400, height: 300 },
            'rgba(30, 30, 30, 0.72)',
        );

        expect(calls).toEqual([
            'save',
            'beginPath',
            'rect(0,0,1280,720)',
            'rect(100,50,400,300)',
            'fill(evenodd)',
            'restore',
        ]);
    });

    it('uses the wash colour it was given', () => {
        const { ctx } = makeCtx();
        paintOutsideArtboard(ctx, { width: 10, height: 10 }, { x: 0, y: 0, width: 5, height: 5 }, 'rgba(1, 2, 3, 0.5)');
        expect(ctx.fillStyle).toBe('rgba(1, 2, 3, 0.5)');
    });

    it('always restores the context, so later drawing is unaffected', () => {
        const { ctx, calls } = makeCtx();
        paintOutsideArtboard(ctx, { width: 10, height: 10 }, { x: 0, y: 0, width: 5, height: 5 }, '#000');
        expect(calls.filter((c) => c === 'save')).toHaveLength(1);
        expect(calls[calls.length - 1]).toBe('restore');
    });

    it('handles a page larger than the viewport without special-casing', () => {
        // Even-odd means an oversized page simply leaves nothing filled; four
        // edge rectangles would have needed clamping to avoid negative sizes.
        const { ctx, calls } = makeCtx();
        paintOutsideArtboard(ctx, { width: 100, height: 100 }, { x: -50, y: -50, width: 400, height: 400 }, '#000');
        expect(calls).toContain('rect(-50,-50,400,400)');
        expect(calls).toContain('fill(evenodd)');
    });
});
