import { gridExtent, gridPose, repulsionOffset } from '@/lib/multicanvas/gridPose';

describe('gridPose', () => {
    it('centres a single box on the origin', () => {
        expect(gridPose(0, 1)).toEqual({ cx: 0, cy: 0, cz: 0 });
    });

    it('keeps small sets flat on one floor', () => {
        for (let total = 1; total <= 6; total += 1) {
            for (let i = 0; i < total; i += 1) {
                expect(gridPose(i, total).cy).toBe(0);
            }
        }
    });

    it('starts growing upward past the sixth box', () => {
        const layers = new Set(Array.from({ length: 12 }, (_, i) => gridPose(i, 12).cy));
        expect(layers.size).toBeGreaterThan(1);
    });

    it('respects a custom growAfter threshold', () => {
        const flat = Array.from({ length: 9 }, (_, i) => gridPose(i, 9, { growAfter: 9 }).cy);
        expect(new Set(flat)).toEqual(new Set([0]));
    });

    it('never places two boxes at the same point', () => {
        for (const total of [1, 4, 6, 7, 12, 25, 60, 101]) {
            const seen = new Set(
                Array.from({ length: total }, (_, i) => {
                    const p = gridPose(i, total);
                    return `${p.cx}|${p.cy}|${p.cz}`;
                }),
            );
            expect(seen.size).toBe(total);
        }
    });

    it('stays centred on the origin in every axis', () => {
        for (const total of [3, 7, 12, 30]) {
            const poses = Array.from({ length: total }, (_, i) => gridPose(i, total));
            for (const axis of ['cx', 'cy', 'cz'] as const) {
                const values = poses.map((p) => p[axis]);
                expect(Math.min(...values) + Math.max(...values)).toBeCloseTo(0, 6);
            }
        }
    });

    it('produces no signed zeros', () => {
        for (let i = 0; i < 20; i += 1) {
            const pose = gridPose(i, 20);
            expect(Object.is(pose.cx, -0)).toBe(false);
            expect(Object.is(pose.cy, -0)).toBe(false);
            expect(Object.is(pose.cz, -0)).toBe(false);
        }
    });

    it('grows up rather than out — width stays bounded as the set grows', () => {
        const widthOf = (total: number) => {
            const xs = Array.from({ length: total }, (_, i) => gridPose(i, total).cx);
            return Math.max(...xs) - Math.min(...xs);
        };
        // A ring or single row would scale linearly with count; the lattice
        // spreads the growth across three axes instead.
        expect(widthOf(64)).toBeLessThan(widthOf(6) * 4);
    });

    it('reports lattice dimensions that cover the whole set', () => {
        for (const total of [1, 6, 7, 25, 100]) {
            const { cols, rows, layers } = gridExtent(total);
            expect(cols * rows * layers).toBeGreaterThanOrEqual(total);
        }
    });

    it('clamps a negative index instead of drifting off-lattice', () => {
        expect(gridPose(-3, 4)).toEqual(gridPose(0, 4));
    });
});

describe('spacing', () => {
    it('leaves a gap around every box at rest', () => {
        // A box is 2 x BOX_HALF (192) across and swells to 1.12x when selected.
        const SELECTED_WIDTH = 96 * 2 * 1.12;
        for (const total of [2, 6, 7, 30]) {
            const poses = Array.from({ length: total }, (_, i) => gridPose(i, total));
            for (let a = 0; a < poses.length; a += 1) {
                for (let b = a + 1; b < poses.length; b += 1) {
                    // Boxes are axis-aligned, so they only touch when they
                    // overlap on every axis at once.
                    const gap = Math.max(
                        Math.abs(poses[a].cx - poses[b].cx),
                        Math.abs(poses[a].cy - poses[b].cy),
                        Math.abs(poses[a].cz - poses[b].cz),
                    );
                    expect(gap).toBeGreaterThan(SELECTED_WIDTH);
                }
            }
        }
    });
});

describe('repulsionOffset', () => {
    it('does not move the box the cursor is on', () => {
        const p = gridPose(0, 9);
        expect(repulsionOffset(p, p)).toEqual({ cx: 0, cy: 0, cz: 0 });
    });

    it('pushes a neighbour directly away from the hovered box', () => {
        const centre = { cx: 0, cy: 0, cz: 0 };
        const right = { cx: 280, cy: 0, cz: 0 };
        const offset = repulsionOffset(right, centre);
        expect(offset.cx).toBeGreaterThan(0);
        expect(offset.cy).toBeCloseTo(0, 6);
        expect(offset.cz).toBeCloseTo(0, 6);
    });

    it('falls off with distance, so far boxes barely stir', () => {
        const centre = { cx: 0, cy: 0, cz: 0 };
        const near = repulsionOffset({ cx: 280, cy: 0, cz: 0 }, centre);
        const far = repulsionOffset({ cx: 1400, cy: 0, cz: 0 }, centre);
        expect(near.cx).toBeGreaterThan(far.cx * 4);
        expect(far.cx).toBeLessThan(3);
    });

    it('stays a slight nudge — never enough to reorder the lattice', () => {
        const centre = { cx: 0, cy: 0, cz: 0 };
        for (const d of [140, 280, 400, 560]) {
            const push = repulsionOffset({ cx: d, cy: 0, cz: 0 }, centre).cx;
            // Half a cell would let a pushed box reach its neighbour's slot.
            expect(push).toBeLessThan(280 / 2);
        }
    });

    it('pushes diagonally when the neighbour sits off-axis', () => {
        const offset = repulsionOffset({ cx: 280, cy: -252, cz: 280 }, { cx: 0, cy: 0, cz: 0 });
        expect(offset.cx).toBeGreaterThan(0);
        expect(offset.cy).toBeLessThan(0);
        expect(offset.cz).toBeGreaterThan(0);
    });
});
