/**
 * The one-click promise: model bytes in, cutter-ready files out, and a plan
 * that failed its own safety checks never reaches the user as files.
 */

import { planFoamCut } from '../foamCut';

const CUBE_OBJ = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 4 8 7 3
f 1 5 8 4
f 2 3 7 6
`;

/** A curved shell, the shape of the actual use case (hat crown, helmet). */
function hemisphereObj(rings: number, segments: number): string {
    const lines: string[] = [];
    const index = new Map<string, number>();
    const at = (ring: number, segment: number): number => {
        const wrapped = ((segment % segments) + segments) % segments;
        const key = ring === 0 ? 'apex' : `${ring},${wrapped}`;
        const existing = index.get(key);
        if (existing !== undefined) return existing;
        const phi = (ring / rings) * (Math.PI / 2);
        const theta = (wrapped / segments) * Math.PI * 2;
        lines.push(`v ${Math.sin(phi) * Math.cos(theta)} ${Math.cos(phi)} ${Math.sin(phi) * Math.sin(theta)}`);
        index.set(key, index.size + 1); // OBJ is 1-based
        return index.size;
    };
    const faces: string[] = [];
    for (let ring = 0; ring < rings; ring += 1) {
        for (let segment = 0; segment < segments; segment += 1) {
            const a = at(ring, segment);
            const b = at(ring + 1, segment);
            const c = at(ring + 1, segment + 1);
            const d = at(ring, segment + 1);
            if (ring === 0) { faces.push(`f ${a} ${c} ${b}`); continue; }
            faces.push(`f ${a} ${d} ${c}`);
            faces.push(`f ${a} ${c} ${b}`);
        }
    }
    return [...lines, ...faces].join('\n');
}

const encode = (text: string): ArrayBuffer => {
    const bytes = new TextEncoder().encode(text);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

describe('planFoamCut', () => {
    it('turns a hat-like model into SVG + G-code files in one call', () => {
        const result = planFoamCut(encode(hemisphereObj(8, 20)), 'wizard-hat.obj');
        expect(result.sheetCount).toBeGreaterThan(0);
        const svgFiles = result.files.filter((file) => file.filename.endsWith('.svg'));
        const gcodeFiles = result.files.filter((file) => file.filename.endsWith('.nc'));
        expect(svgFiles.length).toBe(result.sheetCount);
        expect(gcodeFiles.length).toBe(result.sheetCount);
        expect(svgFiles[0].filename).toBe('wizard-hat-sheet1.svg');
        expect(svgFiles[0].content).toContain('id="groove"');
        expect(gcodeFiles[0].content).toContain('G21');
        expect(result.confidencePct).toBeGreaterThanOrEqual(90);
        expect(result.estimatedMinutes).toBeGreaterThan(0);
        expect(result.grooveCount).toBeGreaterThan(0);
    });

    it('handles a simple boxy model', () => {
        const result = planFoamCut(encode(CUBE_OBJ), 'crate');
        expect(result.panelCount).toBeGreaterThanOrEqual(1);
        expect(result.files.length).toBeGreaterThanOrEqual(2);
        expect(result.files.every((file) => file.content.length > 0)).toBe(true);
    });

    it('sanitises hostile file names', () => {
        const result = planFoamCut(encode(CUBE_OBJ), '../we ird/hat!.glb');
        result.files.forEach((file) => {
            expect(file.filename).toMatch(/^[\w-]+-sheet\d+\.(svg|nc)$/);
        });
    });

    it('refuses to emit files for garbage geometry', () => {
        expect(() => planFoamCut(encode('v 0 0 0\n'), 'broken')).toThrow();
    });
});
