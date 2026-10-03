/**
 * @jest-environment jsdom
 */

import * as fabric from 'fabric';
import {
    buildTextCurveGeometry,
    curveStartOffset,
    hasOwnedCurve,
    patchTextCurveLayout,
    refitTextCurve,
    spanForStrength,
} from '@/lib/textCurve';

/**
 * jsdom has no 2D canvas, so fabric cannot measure glyphs. Width is stubbed as
 * a function of the things that really drive it — character count and font
 * size — which is all these tests need: that the arc tracks the text.
 */
const measurable = (text: fabric.FabricText) => {
    text.calcTextWidth = () => (text.text?.length ?? 0) * (text.fontSize ?? 16) * 0.5;
    const hooks = text as unknown as { _splitText: () => void; _clearCache: () => void };
    hooks._splitText = () => undefined;
    hooks._clearCache = () => undefined;
    return text;
};

const arcLengthOf = (text: fabric.FabricText) => {
    const info = (text.path as fabric.Path & { segmentsInfo?: Array<{ length: number }> }).segmentsInfo;
    return info?.[info.length - 1]?.length ?? 0;
};

const makeCurved = (props: Record<string, unknown> = {}) => {
    const text = measurable(Object.create(fabric.FabricText.prototype) as fabric.FabricText);
    Object.assign(text, { text: 'Tap to edit', fontSize: 40, textAlign: 'left', curveStrength: 50, curveSpan: 180, ...props });
    return text;
};

describe('spanForStrength', () => {
    it('maps the bend slider onto an arc sweep', () => {
        expect(spanForStrength(25)).toBe(90);
        expect(spanForStrength(50)).toBe(180);
        expect(spanForStrength(-50)).toBe(180);
    });

    it('stops short of a closed circle and never collapses to nothing', () => {
        expect(spanForStrength(100)).toBe(359);
        expect(spanForStrength(1000)).toBe(359);
        expect(spanForStrength(0.1)).toBe(2);
    });
});

describe('buildTextCurveGeometry', () => {
    it('returns nothing for flat text', () => {
        expect(buildTextCurveGeometry(200, 40, { strength: 0 })).toBeNull();
    });

    it('makes the arc longer than the text so end glyphs are not clipped', () => {
        const geometry = buildTextCurveGeometry(200, 40, { strength: 50 })!;
        expect(geometry.arcLength).toBeGreaterThan(200);
        expect(geometry.radius).toBeCloseTo(geometry.arcLength / Math.PI);
    });

    it('grows the arc with the text', () => {
        const short = buildTextCurveGeometry(200, 40, { strength: 50 })!;
        const long = buildTextCurveGeometry(1200, 120, { strength: 50 })!;
        expect(long.arcLength).toBeGreaterThan(1200);
        expect(long.radius).toBeGreaterThan(short.radius);
    });

    it('bends upward for positive strength and downward for negative', () => {
        const up = buildTextCurveGeometry(200, 40, { strength: 50 })!;
        const down = buildTextCurveGeometry(200, 40, { strength: -50 })!;
        // Same circle, opposite sweep.
        expect(up.radius).toBeCloseTo(down.radius);
        expect(up.pathData).toMatch(/ 0 0 1 /);
        expect(down.pathData).toMatch(/ 0 0 0 /);
    });

    it('uses the large-arc flag only past a half circle', () => {
        expect(buildTextCurveGeometry(200, 40, { strength: 50, span: 180 })!.pathData).toMatch(/ 0 0 1 /);
        expect(buildTextCurveGeometry(200, 40, { strength: 50, span: 181 })!.pathData).toMatch(/ 0 1 1 /);
    });

    it('honours an explicit span over the one the strength implies', () => {
        expect(buildTextCurveGeometry(200, 40, { strength: 100, span: 90 })!.spanDegrees).toBe(90);
        expect(buildTextCurveGeometry(200, 40, { strength: 100 })!.spanDegrees).toBe(359);
    });

    it('produces a path fabric can parse into a single arc', () => {
        const path = new fabric.Path(buildTextCurveGeometry(200, 40, { strength: 50 })!.pathData);
        expect(path.path.length).toBeGreaterThan(1);
        expect(Number.isFinite(path.width)).toBe(true);
        expect(path.width).toBeGreaterThan(0);
    });
});

describe('curveStartOffset', () => {
    it('centres left-aligned text in the slack and mirrors it for right-aligned', () => {
        expect(curveStartOffset(300, 200, 'left')).toBe(50);
        expect(curveStartOffset(300, 200, 'right')).toBe(-50);
        expect(curveStartOffset(300, 200, 'center')).toBe(0);
    });

    it('slides the text along the arc with the centre control', () => {
        expect(curveStartOffset(300, 200, 'center', 50)).toBe(75);
        expect(curveStartOffset(300, 200, 'center', -100)).toBe(-150);
    });
});

describe('refitTextCurve', () => {
    it('leaves flat text and text bound to a pen path alone', () => {
        const flat = makeCurved({ curveStrength: 0 });
        expect(hasOwnedCurve(flat)).toBe(false);
        expect(refitTextCurve(flat)).toBe(false);
        expect(flat.path).toBeUndefined();

        const bound = makeCurved({ textPathSourceId: 'pen-1' });
        expect(refitTextCurve(bound)).toBe(false);
        expect(bound.path).toBeUndefined();
    });

    it('re-fits the arc when the font size changes', () => {
        // The reported bug: bend, then enlarge — the glyphs piled up because
        // the arc still had the length it was given for the smaller text.
        const text = makeCurved();
        refitTextCurve(text);
        const before = arcLengthOf(text);

        text.fontSize = 120;
        refitTextCurve(text);

        expect(arcLengthOf(text)).toBeGreaterThan(before * 2.5);
        expect(arcLengthOf(text)).toBeGreaterThan(text.calcTextWidth());
    });

    it('re-fits the arc when the wording changes', () => {
        const text = makeCurved();
        refitTextCurve(text);
        const before = arcLengthOf(text);

        text.text = 'A much longer bent headline than before';
        refitTextCurve(text);

        expect(arcLengthOf(text)).toBeGreaterThan(before * 2);
        expect(arcLengthOf(text)).toBeGreaterThan(text.calcTextWidth());
    });

    it('keeps the path invisible so it never renders as a stroke', () => {
        const text = makeCurved();
        refitTextCurve(text);
        expect(text.path?.visible).toBe(false);
    });
});

describe('patchTextCurveLayout', () => {
    it('re-fits inside the layout pass, before the original measures', () => {
        const order: string[] = [];
        class FakeText {
            curveStrength = 50;
            curveSpan = 180;
            text = 'Tap to edit';
            fontSize = 40;
            textAlign = 'left';
            path: fabric.Path | undefined;
            pathStartOffset = 0;
            calcTextWidth() { return 200; }
            _splitText() { /* measured by the stub above */ }
            _clearCache() { /* nothing cached */ }
            setPathInfo() { order.push('pathInfo'); }
            initDimensions() { order.push(`original:${this.path ? 'has-path' : 'no-path'}`); }
        }

        patchTextCurveLayout(FakeText);
        new FakeText().initDimensions();

        expect(order).toEqual(['pathInfo', 'original:has-path']);
    });

    it('patches a class only once', () => {
        let calls = 0;
        class FakeText {
            initDimensions() { calls += 1; }
        }
        patchTextCurveLayout(FakeText);
        patchTextCurveLayout(FakeText);
        new FakeText().initDimensions();
        expect(calls).toBe(1);
    });
});
