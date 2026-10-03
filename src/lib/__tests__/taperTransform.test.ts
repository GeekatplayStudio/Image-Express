import {
    addTaper,
    removeTaper,
    retaper,
    taperContribution,
    type TaperableTransform,
} from '@/lib/taperTransform';

const PLAIN: TaperableTransform = { scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };

const expectClose = (actual: TaperableTransform, expected: TaperableTransform) => {
    (Object.keys(expected) as Array<keyof TaperableTransform>).forEach((key) => {
        expect(actual[key]).toBeCloseTo(expected[key], 8);
    });
};

describe('taperContribution', () => {
    it('adds nothing at zero intensity, whatever the direction says', () => {
        expect(taperContribution({ skewZ: 0, taperDirection: 80 })).toEqual({ skewX: 0, skewY: 0, scaleXFactor: 1 });
    });

    it('follows the sign of the intensity when no direction is set', () => {
        expect(taperContribution({ skewZ: 100, taperDirection: 0 })).toEqual({ skewX: 35, skewY: 6, scaleXFactor: 0.8 });
        const negative = taperContribution({ skewZ: -100, taperDirection: 0 });
        expect(negative.skewX).toBe(-35);
        expect(negative.skewY).toBe(-6);
        // The squeeze depends on how much, not which way.
        expect(negative.scaleXFactor).toBe(0.8);
    });

    it('lets the direction slider override the lean and scale it', () => {
        const half = taperContribution({ skewZ: 100, taperDirection: -50 });
        expect(half.skewX).toBeCloseTo(-17.5);
        expect(half.skewY).toBe(-6);
    });

    it('clamps out-of-range settings rather than extrapolating', () => {
        expect(taperContribution({ skewZ: 400, taperDirection: 900 }))
            .toEqual(taperContribution({ skewZ: 100, taperDirection: 100 }));
    });

    it('treats missing or non-numeric settings as no taper', () => {
        expect(taperContribution({ skewZ: undefined as unknown as number, taperDirection: NaN }))
            .toEqual({ skewX: 0, skewY: 0, scaleXFactor: 1 });
    });
});

describe('retaper', () => {
    it('round-trips: removing a taper undoes adding it', () => {
        const base: TaperableTransform = { scaleX: 1.4, scaleY: 0.7, skewX: 12, skewY: -3 };
        const settings = { skewZ: 60, taperDirection: -30 };
        expectClose(removeTaper(addTaper(base, settings), settings), base);
    });

    it('returns to the original transform when the taper goes back to zero', () => {
        const base: TaperableTransform = { scaleX: 2, scaleY: 2, skewX: 20, skewY: 0 };
        const on = { skewZ: 60, taperDirection: 0 };
        const off = { skewZ: 0, taperDirection: 0 };
        expectClose(retaper(retaper(base, off, on), on, off), base);
    });

    it('keeps a resize made while the taper was on', () => {
        // The regression: taper on, user doubles the layer by its handles, then
        // moves the slider. The old stored-base model snapped scaleX back to
        // the pre-resize size.
        const on = { skewZ: 60, taperDirection: 0 };
        const tapered = retaper(PLAIN, { skewZ: 0, taperDirection: 0 }, on);
        const resized = { ...tapered, scaleX: tapered.scaleX * 2, scaleY: tapered.scaleY * 2 };

        const lighter = retaper(resized, on, { skewZ: 30, taperDirection: 0 });
        expect(lighter.scaleX).toBeCloseTo(2 * 0.94);
        expect(lighter.scaleY).toBe(2);

        const off = retaper(lighter, { skewZ: 30, taperDirection: 0 }, { skewZ: 0, taperDirection: 0 });
        expectClose(off, { scaleX: 2, scaleY: 2, skewX: 0, skewY: 0 });
    });

    it('never touches scaleY', () => {
        const next = retaper({ ...PLAIN, scaleY: 3 }, { skewZ: 0, taperDirection: 0 }, { skewZ: 100, taperDirection: 100 });
        expect(next.scaleY).toBe(3);
    });

    it('preserves the layer’s own skew underneath the taper', () => {
        const own = { ...PLAIN, skewX: -10 };
        const on = { skewZ: 30, taperDirection: 0 };
        const tapered = retaper(own, { skewZ: 0, taperDirection: 0 }, on);
        expect(tapered.skewX).toBeCloseTo(-10 + 10.5);
        expect(removeTaper(tapered, on).skewX).toBeCloseTo(-10);
    });
});
