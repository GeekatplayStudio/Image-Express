import { createCricutParts, nestCricutParts } from '../cricutNesting';
import { buildCricutSheetSvg } from '../cricutSvg';
import { labelComponents, signedArea, simplifyClosedPath, traceCricutMask } from '../cricutTrace';
import type { CricutExportOptions, CricutPart, CricutTraceResult } from '../cricutTypes';

const options: CricutExportOptions = {
    threshold: 150,
    invert: false,
    simplifyToleranceMm: 0.25,
    minimumFeatureAreaMm2: 1,
    designWidthMm: 100,
    scalePercent: 100,
    widthMm: 100,
    heightMm: 100,
    marginMm: 5,
    gapMm: 2,
    allowRotation: true,
    enabled: false,
    targetDepthMm: 10,
    materialThicknessMm: 3,
    registrationMarks: true,
    registrationDiameterMm: 2,
};

const rectanglePart = (id: string, widthMm: number, heightMm: number): CricutPart => ({
    id,
    componentIndex: 0,
    layerIndex: 0,
    layerDepthMm: 3,
    widthMm,
    heightMm,
    contours: [{
        points: [{ x: 0, y: 0 }, { x: widthMm, y: 0 }, { x: widthMm, y: heightMm }, { x: 0, y: heightMm }],
        areaMm2: widthMm * heightMm,
    }],
    registrationAnchors: [{ x: widthMm * 0.25, y: heightMm * 0.5 }, { x: widthMm * 0.75, y: heightMm * 0.5 }],
});

describe('Cricut tracing geometry', () => {
    it('labels disconnected foreground islands independently', () => {
        const mask = Uint8Array.from([
            1, 1, 0, 0,
            1, 0, 0, 1,
            0, 0, 1, 1,
        ]);
        const result = labelComponents(mask, 4, 3);
        expect(result.components).toHaveLength(2);
        expect(result.components.map((component) => component.pixels.length)).toEqual([3, 3]);
    });

    it('simplifies a closed orthogonal boundary while preserving its area and closure-ready nodes', () => {
        const detailed = [
            { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
            { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 },
            { x: 0, y: 2 }, { x: 0, y: 1 }, { x: 0, y: 0 },
        ];
        const simplified = simplifyClosedPath(detailed, 0.01);
        expect(simplified).toHaveLength(4);
        expect(Math.abs(signedArea(simplified))).toBeCloseTo(4);
    });

    it('traces an island with an interior hole as two clean closed contours', () => {
        const mask = Uint8Array.from([
            1, 1, 1, 1, 1,
            1, 0, 0, 0, 1,
            1, 0, 0, 0, 1,
            1, 0, 0, 0, 1,
            1, 1, 1, 1, 1,
        ]);
        const components = traceCricutMask(mask, 5, 5, 50, 0.01, 0);
        expect(components).toHaveLength(1);
        expect(components[0].contours).toHaveLength(2);
        expect(components[0].contours.map((contour) => contour.points.length)).toEqual([4, 4]);
        const areas = components[0].contours.map((contour) => signedArea(contour.points));
        expect(Math.sign(areas[0])).not.toBe(Math.sign(areas[1]));
        expect(Math.abs(areas[0] + areas[1])).toBeCloseTo(1600);
    });
});

describe('Cricut slicing and nesting', () => {
    it('creates exact stock layers and records the final partial-depth layer', () => {
        const trace: CricutTraceResult = {
            sourceWidthPx: 100,
            sourceHeightPx: 50,
            traceWidthPx: 100,
            traceHeightPx: 50,
            outputWidthMm: 100,
            outputHeightMm: 50,
            monochromeDataUrl: 'data:image/png;base64,test',
            components: [{
                widthMm: 40,
                heightMm: 20,
                contours: rectanglePart('source', 40, 20).contours,
                registrationAnchors: [{ x: 10, y: 10 }, { x: 30, y: 10 }],
                originalNodeCount: 20,
            }],
        };
        const parts = createCricutParts(trace, { ...options, enabled: true, targetDepthMm: 10, materialThicknessMm: 3 });
        expect(parts).toHaveLength(4);
        expect(parts.map((part) => part.layerDepthMm)).toEqual([3, 3, 3, 1]);
        expect(parts.every((part) => part.registrationAnchors.length === 2)).toBe(true);
    });

    it('rotates an element when that is the only way it fits', () => {
        const sheets = nestCricutParts([rectanglePart('wide', 70, 30)], {
            ...options,
            widthMm: 50,
            heightMm: 90,
            marginMm: 5,
            gapMm: 0,
        });
        expect(sheets).toHaveLength(1);
        expect(sheets[0].placements[0].rotated).toBe(true);
        expect(sheets[0].placements[0].packedWidthMm).toBe(30);
        expect(sheets[0].placements[0].packedHeightMm).toBe(70);
    });

    it('never overlaps placements in the selected MaxRects result', () => {
        const sheets = nestCricutParts([
            rectanglePart('a', 40, 30),
            rectanglePart('b', 35, 30),
            rectanglePart('c', 20, 20),
            rectanglePart('d', 20, 45),
        ], options);
        for (const sheet of sheets) {
            for (let first = 0; first < sheet.placements.length; first += 1) {
                for (let second = first + 1; second < sheet.placements.length; second += 1) {
                    const a = sheet.placements[first];
                    const b = sheet.placements[second];
                    const overlaps = a.xMm < b.xMm + b.packedWidthMm
                        && a.xMm + a.packedWidthMm > b.xMm
                        && a.yMm < b.yMm + b.packedHeightMm
                        && a.yMm + a.packedHeightMm > b.yMm;
                    expect(overlaps).toBe(false);
                }
            }
        }
    });
});

describe('Cricut SVG output', () => {
    it('encodes millimetre dimensions, closed cut paths, and score registration marks', () => {
        const part = rectanglePart('layer-1-part-1', 30, 20);
        const sheet = {
            index: 0,
            widthMm: 100,
            heightMm: 80,
            usedAreaMm2: 600,
            placements: [{ part, xMm: 5, yMm: 6, rotated: false, packedWidthMm: 30, packedHeightMm: 20 }],
        };
        const svg = buildCricutSheetSvg(sheet, { ...options, widthMm: 100, heightMm: 80 }, 'Test & Cut');
        expect(svg).toContain('width="100mm" height="80mm"');
        expect(svg).toContain('M 5 6 L 35 6 L 35 26 L 5 26 Z');
        expect(svg).toContain('data-operation="cut"');
        expect(svg.match(/data-operation="score"/g)).toHaveLength(2);
        expect(svg).toContain('Test &amp; Cut');
    });
});
