/**
 * 3D Stamp Tool - Relief Extrusion Behaviour Tests
 *
 * Covers the parts of the relief builder that are invisible to a pure topology check:
 * the draft angle actually shaping the sidewalls, the contact plateau staying planar, and
 * the extrusion grid resolving fine artwork instead of aliasing it away.
 */

import * as THREE from 'three';
import { createStampReliefGeometry, ReliefExtrusionParams } from '../domain/stampReliefExtrusion';
import { analyzeMeshTopology } from '../domain/stampMeshIntegrity';

const RELIEF_DEPTH = 2.5;
const BASE_PLATE = 1.5;
const CONTACT_Y = -(BASE_PLATE + RELIEF_DEPTH);

/** A centred solid disc of `radiusFraction` of the shorter side. */
function discHeightmap(size: number, radiusFraction = 0.3): Uint8ClampedArray {
    const data = new Uint8ClampedArray(size * size * 4);
    const centre = size / 2;
    const radius = size * radiusFraction;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const inside = Math.hypot(x - centre, y - centre) <= radius;
            const v = inside ? 255 : 0;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
    }
    return data;
}

function buildDie(overrides: Partial<ReliefExtrusionParams> = {}): THREE.BufferGeometry {
    const size = 128;
    return createStampReliefGeometry({
        heightmapData: discHeightmap(size),
        gridWidth: size,
        gridHeight: size,
        physicalWidthMm: 40,
        physicalDepthMm: 40,
        reliefDepthMm: RELIEF_DEPTH,
        basePlateThicknessMm: BASE_PLATE,
        shape: 'rectangular',
        draftAngleDeg: 8,
        ...overrides,
    });
}

/**
 * Measures the horizontal run of the tapered wall around a circular relief feature.
 *
 * The ideal wall is `r = R + (1 - h) * run` for every point part-way down the taper, so a
 * least-squares fit of radius against (1 - h) recovers the run directly. Fitting beats taking
 * the outermost plateau vertex minus the innermost floor vertex: those extremes land at
 * different angles around the circle, where the square sampling grid biases them in opposite
 * directions by up to a cell each.
 */
function measureWallRunMm(geometry: THREE.BufferGeometry, reliefDepthMm = RELIEF_DEPTH): number {
    const pos = geometry.getAttribute('position');
    const contactY = -(BASE_PLATE + reliefDepthMm);
    const samples: { x: number; y: number }[] = [];

    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        // Only the displaced die face, and only vertices part-way down the taper.
        if (y >= -BASE_PLATE - 1e-6 || y <= contactY + 1e-6) continue;

        const h = (-y - BASE_PLATE) / reliefDepthMm;
        if (h < 0.05 || h > 0.95) continue;
        samples.push({ x: 1 - h, y: Math.hypot(pos.getX(i), pos.getZ(i)) });
    }

    if (samples.length < 8) return 0;

    const n = samples.length;
    const meanX = samples.reduce((s, p) => s + p.x, 0) / n;
    const meanY = samples.reduce((s, p) => s + p.y, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of samples) {
        num += (p.x - meanX) * (p.y - meanY);
        den += (p.x - meanX) ** 2;
    }

    return den === 0 ? 0 : num / den;
}

describe('createStampReliefGeometry', () => {
    describe('draft angle', () => {
        it('produces a wall run matching reliefDepth * tan(draft)', () => {
            for (const draftAngleDeg of [10, 20, 30]) {
                const run = measureWallRunMm(buildDie({ draftAngleDeg }));
                const expected = RELIEF_DEPTH * Math.tan((draftAngleDeg * Math.PI) / 180);
                // Tolerance is about one 0.25mm grid cell.
                expect(Math.abs(run - expected)).toBeLessThan(0.25);
            }
        });

        it('widens the taper monotonically as the draft angle increases', () => {
            // Angles chosen so every wall run is wider than the ~0.25mm sampling grid;
            // below that the taper is sub-cell and the fit has nothing to measure.
            const runs = [10, 20, 30, 40].map((draftAngleDeg) =>
                measureWallRunMm(buildDie({ draftAngleDeg }))
            );

            for (let i = 1; i < runs.length; i++) {
                expect(runs[i]).toBeGreaterThan(runs[i - 1]);
            }
        });

        it('scales the taper with relief depth at a fixed angle', () => {
            const shallow = measureWallRunMm(buildDie({ draftAngleDeg: 25, reliefDepthMm: 1.5 }), 1.5);
            const deep = measureWallRunMm(buildDie({ draftAngleDeg: 25, reliefDepthMm: 3.5 }), 3.5);

            // Same angle, deeper relief - the wall has further to lean out.
            expect(deep).toBeGreaterThan(shallow * 1.5);
        });

        it('still anti-aliases the edge at zero draft rather than stepping it', () => {
            const geometry = buildDie({ draftAngleDeg: 0 });
            const pos = geometry.getAttribute('position');

            let partialHeightVertices = 0;
            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                if (y < -BASE_PLATE - 1e-4 && y > CONTACT_Y + 1e-4) {
                    partialHeightVertices++;
                }
            }

            expect(partialHeightVertices).toBeGreaterThan(0);
        });
    });

    describe('contact plateau', () => {
        it('keeps the contact face a single flat plane', () => {
            const pos = buildDie().getAttribute('position');
            const plateau: number[] = [];

            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                if (Math.abs(y - CONTACT_Y) < 1e-6) plateau.push(y);
            }

            // The inked face is a large region, and every vertex on it is exactly coplanar -
            // a stamp that rocks on a high spot prints unevenly.
            expect(plateau.length).toBeGreaterThan(100);
            for (const y of plateau) {
                expect(y).toBe(CONTACT_Y);
            }
        });

        it('resolves the wall over several height levels instead of one step', () => {
            // The complaint this guards: a wall only one vertex wide has nothing between
            // "floor" and "plateau", so the letter outline renders as a staircase however
            // accurate the underlying distance field is.
            const pos = buildDie().getAttribute('position');
            const levels = new Set<number>();

            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                if (y < -BASE_PLATE - 1e-4 && y > CONTACT_Y + 1e-4) {
                    // Quantise to 1 micron so float noise does not inflate the count.
                    levels.add(Math.round(y * 1000));
                }
            }

            expect(levels.size).toBeGreaterThan(40);
        });

        it('never cuts deeper than the requested relief depth', () => {
            const pos = buildDie().getAttribute('position');
            for (let i = 0; i < pos.count; i++) {
                expect(pos.getY(i)).toBeGreaterThanOrEqual(CONTACT_Y - 1e-6);
                expect(pos.getY(i)).toBeLessThanOrEqual(1e-6);
            }
        });
    });

    describe('sampling', () => {
        it('resolves fine artwork from a high resolution heightmap', () => {
            // Thin 2px stripes at 512px: point sampling onto a coarser grid drops most of
            // them, area averaging keeps them as relief.
            const size = 512;
            const data = new Uint8ClampedArray(size * size * 4);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = (y * size + x) * 4;
                    const v = x % 8 < 2 ? 255 : 0;
                    data[i] = v;
                    data[i + 1] = v;
                    data[i + 2] = v;
                    data[i + 3] = 255;
                }
            }

            const geometry = createStampReliefGeometry({
                heightmapData: data,
                gridWidth: size,
                gridHeight: size,
                physicalWidthMm: 40,
                physicalDepthMm: 40,
                reliefDepthMm: RELIEF_DEPTH,
                basePlateThicknessMm: BASE_PLATE,
                shape: 'rectangular',
                draftAngleDeg: 8,
            });

            const pos = geometry.getAttribute('position');
            let raised = 0;
            for (let i = 0; i < pos.count; i++) {
                if (pos.getY(i) < -BASE_PLATE - 0.01) raised++;
            }

            expect(raised).toBeGreaterThan(500);
        });

        it('scales grid density with physical size, not with heightmap pixels', () => {
            const small = createStampReliefGeometry({
                heightmapData: discHeightmap(64),
                gridWidth: 64,
                gridHeight: 64,
                physicalWidthMm: 20,
                physicalDepthMm: 20,
                reliefDepthMm: RELIEF_DEPTH,
                basePlateThicknessMm: BASE_PLATE,
                shape: 'rectangular',
                draftAngleDeg: 8,
            });
            const large = createStampReliefGeometry({
                heightmapData: discHeightmap(64),
                gridWidth: 64,
                gridHeight: 64,
                physicalWidthMm: 50,
                physicalDepthMm: 50,
                reliefDepthMm: RELIEF_DEPTH,
                basePlateThicknessMm: BASE_PLATE,
                shape: 'rectangular',
                draftAngleDeg: 8,
            });

            const count = (g: THREE.BufferGeometry) => g.getAttribute('position').count;
            expect(count(large)).toBeGreaterThan(count(small));
        });

        it('stays within a slicer-friendly triangle budget for every shape', () => {
            for (const shape of ['rectangular', 'circular', 'oval'] as const) {
                const geometry = createStampReliefGeometry({
                    heightmapData: discHeightmap(256),
                    gridWidth: 256,
                    gridHeight: 256,
                    physicalWidthMm: 80,
                    physicalDepthMm: 60,
                    reliefDepthMm: RELIEF_DEPTH,
                    basePlateThicknessMm: BASE_PLATE,
                    shape,
                    draftAngleDeg: 8,
                });
                const triangles = geometry.getIndex()!.count / 3;
                expect(triangles).toBeLessThan(200000);
                expect(triangles).toBeGreaterThan(5000);
            }
        });
    });

    describe('continuous grayscale relief', () => {
        it('produces a graded surface instead of a two-level plateau', () => {
            const size = 128;
            const data = new Uint8ClampedArray(size * size * 4);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = (y * size + x) * 4;
                    const v = Math.round((x / (size - 1)) * 255);
                    data[i] = v;
                    data[i + 1] = v;
                    data[i + 2] = v;
                    data[i + 3] = 255;
                }
            }

            const geometry = createStampReliefGeometry({
                heightmapData: data,
                gridWidth: size,
                gridHeight: size,
                physicalWidthMm: 40,
                physicalDepthMm: 40,
                reliefDepthMm: RELIEF_DEPTH,
                basePlateThicknessMm: BASE_PLATE,
                shape: 'rectangular',
                draftAngleDeg: 8,
                useContinuousGrayscale: true,
            });

            const pos = geometry.getAttribute('position');
            const levels = new Set<number>();
            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                if (y < -1e-6) levels.add(Math.round(y * 20));
            }

            expect(levels.size).toBeGreaterThan(20);
            expectOutward(geometry);
        });
    });
});

function expectOutward(geometry: THREE.BufferGeometry) {
    const report = analyzeMeshTopology(geometry);
    expect(report.isWatertightManifold).toBe(true);
    expect(report.signedVolumeMm3).toBeGreaterThan(0);
}
