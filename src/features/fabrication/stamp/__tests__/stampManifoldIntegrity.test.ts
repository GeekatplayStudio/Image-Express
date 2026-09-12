/**
 * 3D Stamp Tool - Heavy STL & Mesh Manifold Integrity Tests
 * Verifies that exported STL meshes are:
 * 1. Watertight and 2-manifold (no holes, no inconsistent winding)
 * 2. Oriented outwards - a consistently inside-out shell passes every edge-count test but
 *    renders hollow in the viewport and is rejected by slicers, so orientation is asserted
 *    explicitly via signed volume
 * 3. Free of degenerate zero-area triangles
 * 4. Free of NaN / Infinite coordinates
 * 5. Structurally valid binary STL format (exact 84 + 50*N byte size)
 * 6. Optimized file size ("not too heavy" - under 15MB for a full stamp)
 */

import { buildStampModel } from '../domain/stampModelBuilder';
import { exportStampToSTL } from '../domain/stampExporters';
import { createStampReliefGeometry } from '../domain/stampReliefExtrusion';
import { createStampPodiumGeometry } from '../domain/stampPodiumGeometry';
import { createStampHandleGeometry } from '../domain/stampHandleGeometry';
import { analyzeMeshTopology } from '../domain/stampMeshIntegrity';
import { DEFAULT_STAMP_CONFIG, StampConfig, HandleStyle, PodiumShape } from '../domain/stampTypes';

/** A printable shell: closed, consistently wound, and facing outwards. */
function expectPrintableSolid(geometry: Parameters<typeof analyzeMeshTopology>[0], label: string) {
    const report = analyzeMeshTopology(geometry);
    const detail = `${label}: ${JSON.stringify(report)}`;
    expect(`${label} nan=${report.nanOrInfCount}`).toBe(`${label} nan=0`);
    expect(`${label} degenerate=${report.degenerateTriangles}`).toBe(`${label} degenerate=0`);
    expect(`${label} boundary=${report.boundaryEdges}`).toBe(`${label} boundary=0`);
    expect(`${label} nonManifold=${report.nonManifoldEdges}`).toBe(`${label} nonManifold=0`);
    expect(`${label} winding=${report.inconsistentWindingEdges}`).toBe(`${label} winding=0`);
    expect(report.isWatertightManifold).toBe(true);
    // Positive signed volume == outward-facing normals.
    expect(report.signedVolumeMm3).toBeGreaterThan(0);
    expect(report.isOutwardOriented ? 'outward' : detail).toBe('outward');
    return report;
}

/**
 * Reads a Blob in whichever environment the suite runs in. jsdom's Blob exposes neither
 * `arrayBuffer()` nor `text()` in every version, so fall back to its Node buffer.
 */
interface BlobLike {
    arrayBuffer?: () => Promise<ArrayBuffer>;
    text?: () => Promise<string>;
    _buffer?: Buffer;
}

async function getBlobBuffer(blob: Blob): Promise<ArrayBuffer> {
    const like = blob as unknown as BlobLike;
    if (typeof like.arrayBuffer === 'function') {
        return await like.arrayBuffer();
    }
    if (like._buffer) {
        const ab = new ArrayBuffer(like._buffer.byteLength);
        new Uint8Array(ab).set(like._buffer);
        return ab;
    }
    return new Promise((resolve, reject) => {
        if (typeof FileReader === 'undefined') {
            reject(new Error('Cannot read blob in current environment'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}

async function getBlobText(blob: Blob): Promise<string> {
    const like = blob as unknown as BlobLike;
    if (typeof like.text === 'function') {
        return await like.text();
    }
    if (like._buffer) {
        return like._buffer.toString('utf-8');
    }
    return new Promise((resolve, reject) => {
        if (typeof FileReader === 'undefined') {
            reject(new Error('Cannot read blob in current environment'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

describe('Heavy STL & Mesh Integrity Tests', () => {
    // 1. Test individual solid components
    describe('Component Solid Watertightness', () => {
        it('verifies createStampReliefGeometry produces a closed watertight manifold solid', () => {
            const width = 32;
            const height = 32;
            const heightmap = new Uint8ClampedArray(width * height * 4);

            // Populate intricate relief pattern
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    // Circle + cross pattern
                    const dx = x - 16;
                    const dy = y - 16;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const val = (dist < 10 && dist > 4) || Math.abs(dx) < 2 ? 220 : 0;
                    heightmap[idx] = val;
                    heightmap[idx + 1] = val;
                    heightmap[idx + 2] = val;
                    heightmap[idx + 3] = 255;
                }
            }

            const dieGeom = createStampReliefGeometry({
                heightmapData: heightmap,
                gridWidth: width,
                gridHeight: height,
                physicalWidthMm: 45,
                physicalDepthMm: 35,
                reliefDepthMm: 2.5,
                basePlateThicknessMm: 1.5,
                shape: 'rectangular',
                draftAngleDeg: 8,
            });

            const report = expectPrintableSolid(dieGeom, 'rectangular die');
            expect(report.triangleCount).toBeGreaterThan(500);
        });

        it('verifies touching relief bottom is 100% solid flat plateau with zero spikiness', () => {
            const width = 64;
            const height = 64;
            const heightmap = new Uint8ClampedArray(width * height * 4);

            // Bold solid text / graphic block
            for (let y = 16; y < 48; y++) {
                for (let x = 12; x < 52; x++) {
                    const idx = (y * width + x) * 4;
                    heightmap[idx] = 255;
                    heightmap[idx + 1] = 255;
                    heightmap[idx + 2] = 255;
                    heightmap[idx + 3] = 255;
                }
            }

            const reliefDepthMm = 2.5;
            const basePlateThicknessMm = 1.5;
            const expectedContactY = -(basePlateThicknessMm + reliefDepthMm); // -4.0 mm

            const dieGeom = createStampReliefGeometry({
                heightmapData: heightmap,
                gridWidth: width,
                gridHeight: height,
                physicalWidthMm: 50,
                physicalDepthMm: 35,
                reliefDepthMm,
                basePlateThicknessMm,
                shape: 'rectangular',
                draftAngleDeg: 8,
            });

            const pos = dieGeom.getAttribute('position');
            let contactVertexCount = 0;
            const contactYValues: number[] = [];

            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                // Any vertex deeper than the baseplate (-1.5mm)
                if (y < -(basePlateThicknessMm + 0.2)) {
                    // Check if it's on the contact plateau
                    if (Math.abs(y - expectedContactY) < 0.1) {
                        contactVertexCount++;
                        contactYValues.push(y);
                    }
                }
            }

            // Must have substantial solid contact area (hundreds of vertices)
            expect(contactVertexCount).toBeGreaterThan(500);

            // EVERY SINGLE vertex on the contact plateau must be EXACTLY at -4.0 mm (zero spikiness)
            for (const y of contactYValues) {
                expect(y).toBeCloseTo(expectedContactY, 5);
            }

            // Variance must be 0.00000 mm (perfect planar match for physical press testing)
            const mean = contactYValues.reduce((a, b) => a + b, 0) / contactYValues.length;
            const variance = contactYValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / contactYValues.length;
            expect(variance).toBeLessThan(1e-10);
        });

        it('verifies circular wax seal die produces a watertight solid', () => {
            const width = 32;
            const height = 32;
            const heightmap = new Uint8ClampedArray(width * height * 4).fill(128);

            const waxDieGeom = createStampReliefGeometry({
                heightmapData: heightmap,
                gridWidth: width,
                gridHeight: height,
                physicalWidthMm: 30,
                physicalDepthMm: 30,
                reliefDepthMm: 2.0,
                basePlateThicknessMm: 1.5,
                shape: 'circular',
                draftAngleDeg: 10,
            });

            expectPrintableSolid(waxDieGeom, 'circular die');
        });

        it('verifies rectangular podium geometry is a closed watertight solid', () => {
            const geom = createStampPodiumGeometry('rectangular', 50, 35, 6, 4);
            expectPrintableSolid(geom, 'rectangular podium');

            // The podium must fill exactly the requested footprint and sit on y = 0, or the
            // printed stamp comes out larger than the dimensions shown in the viewport.
            geom.computeBoundingBox();
            const bbox = geom.boundingBox!;
            expect(bbox.max.x - bbox.min.x).toBeCloseTo(50, 1);
            expect(bbox.max.z - bbox.min.z).toBeCloseTo(35, 1);
            expect(bbox.min.y).toBeCloseTo(0, 3);
            expect(bbox.max.y).toBeCloseTo(6, 3);
        });

        it('verifies circular podium geometry is a closed watertight solid', () => {
            const geom = createStampPodiumGeometry('circular', 35, 35, 7);
            expectPrintableSolid(geom, 'circular podium');

            geom.computeBoundingBox();
            const bbox = geom.boundingBox!;
            expect(bbox.max.x - bbox.min.x).toBeCloseTo(35, 1);
            expect(bbox.min.y).toBeCloseTo(0, 3);
            expect(bbox.max.y).toBeCloseTo(7, 3);
        });

        it('verifies oval podium geometry is a closed watertight solid within its footprint', () => {
            const geom = createStampPodiumGeometry('oval', 54, 38, 6);
            expectPrintableSolid(geom, 'oval podium');

            geom.computeBoundingBox();
            const bbox = geom.boundingBox!;
            expect(bbox.max.x - bbox.min.x).toBeCloseTo(54, 1);
            expect(bbox.max.z - bbox.min.z).toBeCloseTo(38, 1);

            // An ellipse extruded without an explicit segment count comes out a faceted
            // 12-gon; a smooth rim needs far more triangles than that.
            const triangleCount = geom.getIndex()
                ? geom.getIndex()!.count / 3
                : geom.getAttribute('position').count / 3;
            expect(triangleCount).toBeGreaterThan(400);
        });

        it('verifies all handle styles are closed watertight solids without open holes', () => {
            const handles: HandleStyle[] = [
                'finger-grip',
                'ribbed-peg',
                't-bar',
                'classic-wood',
                'desk-knob',
                'wax-seal-turned',
            ];

            const failures: string[] = [];
            for (const style of handles) {
                const geom = createStampHandleGeometry(style, 40, 45);
                expect(geom).not.toBeNull();
                const report = analyzeMeshTopology(geom!);
                if (!report.isWatertightManifold || !report.isOutwardOriented) {
                    failures.push(
                        `${style} (watertight=${report.isWatertightManifold}, ` +
                        `outward=${report.isOutwardOriented}, volume=${report.signedVolumeMm3.toFixed(1)})`
                    );
                }
            }
            expect(failures).toEqual([]);
        });

        it('orients every handle style the same way as the primitive-built handles', () => {
            // The turned (lathe) handles and the box/cylinder handles are generated by
            // different code paths; mixing orientations produces an export where some parts
            // are solid and others are voids.
            const allStyles: HandleStyle[] = [
                'classic-wood',
                'wax-seal-turned',
                'desk-knob',
                'finger-grip',
                'ribbed-peg',
                't-bar',
                'minimal-block',
            ];

            const volumes = allStyles.map((style) => {
                const geom = createStampHandleGeometry(style, 40, 45)!;
                return { style, volume: analyzeMeshTopology(geom).signedVolumeMm3 };
            });

            expect(volumes.filter((v) => v.volume <= 0)).toEqual([]);
        });
    });

    // 2. Heavy STL Binary & ASCII export tests across shapes and handles
    describe('Heavy STL Exporter Validation', () => {
        const shapes: PodiumShape[] = ['rectangular', 'circular', 'oval'];
        const handles: HandleStyle[] = ['none', 'finger-grip', 'ribbed-peg', 't-bar', 'classic-wood'];

        for (const shape of shapes) {
            for (const handleStyle of handles) {
                it(`exports valid, non-broken STL for shape="${shape}" handle="${handleStyle}"`, async () => {
                    const width = 64;
                    const height = 64;
                    const heightmap = new Uint8ClampedArray(width * height * 4);

                    // High-frequency relief features
                    for (let y = 0; y < height; y++) {
                        for (let x = 0; x < width; x++) {
                            const idx = (y * width + x) * 4;
                            const stripe = (x % 8 < 4 ? 255 : 0) ^ (y % 8 < 4 ? 255 : 0);
                            heightmap[idx] = stripe;
                            heightmap[idx + 1] = stripe;
                            heightmap[idx + 2] = stripe;
                            heightmap[idx + 3] = 255;
                        }
                    }

                    const config: StampConfig = {
                        ...DEFAULT_STAMP_CONFIG,
                        podiumShape: shape,
                        handleStyle: handleStyle,
                        dimensions: {
                            ...DEFAULT_STAMP_CONFIG.dimensions,
                            widthMm: 45,
                            depthMm: 35,
                            podiumThicknessMm: 5,
                            handleHeightMm: handleStyle === 'none' ? 0 : 35,
                        },
                    };

                    const assembly = buildStampModel(config, heightmap, width, height);
                    expect(assembly.metrics.isManifold).toBe(true);
                    expect(assembly.metrics.solidVolumeMm3).toBeGreaterThan(0);

                    // Export Binary STL
                    const binaryBlob = exportStampToSTL(assembly, 'stl-binary', 'complete');
                    expect(binaryBlob.size).toBeGreaterThan(84);

                    const buffer = await getBlobBuffer(binaryBlob);
                    const view = new DataView(buffer);
                    const triCountHeader = view.getUint32(80, true);

                    // Strict STL Binary Specification Check:
                    // File size MUST exactly equal 84 + triCount * 50
                    const expectedByteLength = 84 + triCountHeader * 50;
                    expect(buffer.byteLength).toBe(expectedByteLength);

                    // Validate coordinates in the binary STL stream: no NaN or Inf.
                    // Counted in a plain loop and asserted once - a per-triangle expect() over
                    // 100k+ triangles dominates the runtime of the whole suite.
                    let badFloats = 0;
                    for (let i = 0; i < triCountHeader; i++) {
                        const offset = 84 + i * 50;
                        for (let f = 0; f < 12; f++) {
                            if (!Number.isFinite(view.getFloat32(offset + f * 4, true))) {
                                badFloats++;
                            }
                        }
                    }
                    expect(badFloats).toBe(0);

                    // Weight verification: "not too heavy"
                    // Complete stamp model binary STL must be under 15 MB
                    const sizeInMb = buffer.byteLength / (1024 * 1024);
                    expect(sizeInMb).toBeLessThan(15.0);

                    // Enough detail to resolve letterforms, few enough to slice and to
                    // rebuild interactively while a slider is being dragged.
                    expect(triCountHeader).toBeGreaterThan(1000);
                    expect(triCountHeader).toBeLessThan(200000);

                    // Also verify ASCII STL is not broken
                    const asciiBlob = exportStampToSTL(assembly, 'stl-ascii', 'complete');
                    const asciiText = await getBlobText(asciiBlob);
                    expect(asciiText.startsWith('solid')).toBe(true);
                    expect(asciiText.endsWith('endsolid \n') || asciiText.endsWith('endsolid\n') || asciiText.includes('endsolid')).toBe(true);
                    expect(asciiText.includes('NaN')).toBe(false);
                });
            }
        }
    });
});
