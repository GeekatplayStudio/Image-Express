/**
 * 3D Stamp Tool - Geometry & Assembly Unit Tests
 */

import { createStampHandleGeometry } from '../domain/stampHandleGeometry';
import { createStampPodiumGeometry } from '../domain/stampPodiumGeometry';
import { createStampReliefGeometry } from '../domain/stampReliefExtrusion';
import { buildStampModel } from '../domain/stampModelBuilder';
import { DEFAULT_STAMP_CONFIG } from '../domain/stampTypes';
import {
    applyLevelsAndQuantization,
    applyVectorContourSmoothing,
    renderStampArtwork,
} from '../ui/StampCanvasRenderer';

describe('3D Stamp Geometry Builders', () => {
    describe('applyLevelsAndQuantization', () => {
        it('clips luminance outside black and white level bounds', () => {
            // Below black level (50) should map to 0
            expect(applyLevelsAndQuantization(30, 50, 200, 1.0, 0, 128, true)).toBe(0);
            // Above white level (200) should map to 255
            expect(applyLevelsAndQuantization(220, 50, 200, 1.0, 0, 128, true)).toBe(255);
            // Midpoint should map to approx 128
            expect(applyLevelsAndQuantization(125, 50, 200, 1.0, 0, 128, true)).toBe(128);
        });

        it('adjusts midtone curves via gamma parameter', () => {
            const linearMid = applyLevelsAndQuantization(128, 0, 255, 1.0, 0, 128, true);
            const brightMid = applyLevelsAndQuantization(128, 0, 255, 1.8, 0, 128, true);
            const darkMid = applyLevelsAndQuantization(128, 0, 255, 0.6, 0, 128, true);

            expect(brightMid).toBeGreaterThan(linearMid);
            expect(darkMid).toBeLessThan(linearMid);
        });

        it('quantizes gradient into discrete bit-depth steps', () => {
            // 2-step quantization (1-bit B&W: 0 or 255)
            expect(applyLevelsAndQuantization(50, 0, 255, 1.0, 2)).toBe(0);
            expect(applyLevelsAndQuantization(200, 0, 255, 1.0, 2)).toBe(255);

            // 4-step quantization (2-bit: 0, 85, 170, 255)
            const val1 = applyLevelsAndQuantization(30, 0, 255, 1.0, 4);
            const val2 = applyLevelsAndQuantization(90, 0, 255, 1.0, 4);
            const val3 = applyLevelsAndQuantization(160, 0, 255, 1.0, 4);
            const val4 = applyLevelsAndQuantization(240, 0, 255, 1.0, 4);

            expect([0, 85, 170, 255]).toContain(val1);
            expect([0, 85, 170, 255]).toContain(val2);
            expect([0, 85, 170, 255]).toContain(val3);
            expect([0, 85, 170, 255]).toContain(val4);
        });

        it('produces smooth anti-aliased transitions in binary mode', () => {
            // Values well away from threshold (128) are cleanly 0 or 255
            expect(applyLevelsAndQuantization(10, 0, 255, 1.0, 0, 128, false)).toBe(0);
            expect(applyLevelsAndQuantization(245, 0, 255, 1.0, 0, 128, false)).toBe(255);

            // Values near threshold smoothly transition instead of hard staircases
            const nearEdge = applyLevelsAndQuantization(127, 0, 255, 1.0, 0, 128, false);
            expect(nearEdge).toBeGreaterThan(0);
            expect(nearEdge).toBeLessThan(255);
        });

        it('fine tunes cutoff threshold and black point correctly', () => {
            // When threshold is lowered to 50, faint strokes (e.g. 70) become solid
            expect(applyLevelsAndQuantization(70, 0, 255, 1.0, 0, 50, false)).toBe(255);
            // When threshold is raised to 200, intermediate strokes (e.g. 150) are excluded
            expect(applyLevelsAndQuantization(150, 0, 255, 1.0, 0, 200, false)).toBe(0);

            // Black point raising to 80 forces anything below 80 to 0
            expect(applyLevelsAndQuantization(75, 80, 255, 1.0, 0, 128, false)).toBe(0);
            // White point lowering to 180 boosts 180+ to full solid 255
            expect(applyLevelsAndQuantization(185, 0, 180, 1.0, 0, 128, false)).toBe(255);
        });
    });

    describe('applyVectorContourSmoothing', () => {
        it('smooths stepped diagonal pixels into continuous anti-aliased ramps', () => {
            const w = 16;
            const h = 16;
            const data = new Uint8ClampedArray(w * h);

            // Create a stepped diagonal staircase (90-degree steps)
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    data[y * w + x] = x >= y ? 255 : 0;
                }
            }

            // Before smoothing, pixels are hard 0 or 255
            expect(data[2 * w + 2]).toBe(255);
            expect(data[2 * w + 1]).toBe(0);

            // Apply SDF vector contour smoothing
            applyVectorContourSmoothing(data, w, h, 1.5, 0);

            // The edge pixels along the diagonal should now have smooth subpixel anti-aliasing (between 0 and 255)
            const edgeVal = data[2 * w + 1];
            expect(edgeVal).toBeGreaterThan(0);
            expect(edgeVal).toBeLessThan(255);
        });
    });

    describe('createStampHandleGeometry', () => {
        it('creates classic turned wood handle geometry with vertex normals', () => {
            const geom = createStampHandleGeometry('classic-wood', 55, 50);
            expect(geom).not.toBeNull();
            expect(geom!.getAttribute('position').count).toBeGreaterThan(100);
            expect(geom!.getAttribute('normal')).toBeDefined();
        });

        it('creates vintage wax seal turned handle geometry', () => {
            const geom = createStampHandleGeometry('wax-seal-turned', 65, 35);
            expect(geom).not.toBeNull();
            expect(geom!.getAttribute('position').count).toBeGreaterThan(100);
        });

        it('creates desk knob handle geometry', () => {
            const geom = createStampHandleGeometry('desk-knob', 35, 45);
            expect(geom).not.toBeNull();
            expect(geom!.getAttribute('position').count).toBeGreaterThan(50);
        });

        it('creates material-saving finger-grip handle geometry', () => {
            const geom = createStampHandleGeometry('finger-grip', 12, 45);
            expect(geom).not.toBeNull();
            expect(geom!.getAttribute('position').count).toBeGreaterThan(50);
            expect(geom!.getAttribute('normal')).toBeDefined();
        });

        it('creates ribbed-peg handle geometry', () => {
            const geom = createStampHandleGeometry('ribbed-peg', 40, 45);
            expect(geom).not.toBeNull();
            expect(geom!.getAttribute('position').count).toBeGreaterThan(50);
        });

        it('creates t-bar rocker handle geometry', () => {
            const geom = createStampHandleGeometry('t-bar', 50, 45);
            expect(geom).not.toBeNull();
            expect(geom!.getAttribute('position').count).toBeGreaterThan(50);
            expect(geom!.getAttribute('normal')).toBeDefined();
        });

        it('returns null when handle style is none or height is 0', () => {
            expect(createStampHandleGeometry('none', 50, 50)).toBeNull();
            expect(createStampHandleGeometry('classic-wood', 0, 50)).toBeNull();
        });
    });

    describe('createStampPodiumGeometry', () => {
        it('creates rectangular podium geometry with rounded corners and orientation notch', () => {
            const geom = createStampPodiumGeometry('rectangular', 50, 35, 6, 4);
            expect(geom).toBeDefined();
            expect(geom.getAttribute('position').count).toBeGreaterThan(50);
            expect(geom.getAttribute('normal')).toBeDefined();
        });

        it('creates circular podium geometry for wax seals', () => {
            const geom = createStampPodiumGeometry('circular', 35, 35, 8);
            expect(geom).toBeDefined();
            expect(geom.getAttribute('position').count).toBeGreaterThan(50);
        });

        it('creates oval podium geometry', () => {
            const geom = createStampPodiumGeometry('oval', 45, 30, 7);
            expect(geom).toBeDefined();
            expect(geom.getAttribute('position').count).toBeGreaterThan(50);
        });
    });

    describe('createStampReliefGeometry', () => {
        it('builds a watertight solid relief mesh from heightmap data', () => {
            const width = 16;
            const height = 16;
            const heightmap = new Uint8ClampedArray(width * height * 4);

            // Fill center with raised relief
            for (let y = 4; y < 12; y++) {
                for (let x = 4; x < 12; x++) {
                    const idx = (y * width + x) * 4;
                    heightmap[idx] = 255;
                    heightmap[idx + 1] = 255;
                    heightmap[idx + 2] = 255;
                    heightmap[idx + 3] = 255;
                }
            }

            const geom = createStampReliefGeometry({
                heightmapData: heightmap,
                gridWidth: width,
                gridHeight: height,
                physicalWidthMm: 40,
                physicalDepthMm: 30,
                reliefDepthMm: 2.0,
                basePlateThicknessMm: 1.5,
                shape: 'rectangular',
                draftAngleDeg: 8,
            });

            expect(geom).toBeDefined();
            const pos = geom.getAttribute('position');
            expect(pos).toBeDefined();
            expect(pos.count).toBeGreaterThan(0);

            // Verify bounding box bounds
            geom.computeBoundingBox();
            const bbox = geom.boundingBox!;
            expect(bbox.min.x).toBeCloseTo(-20, 0);
            expect(bbox.max.x).toBeCloseTo(20, 0);
            expect(bbox.max.y).toBeCloseTo(0, 1); // flat backplate is at y = 0
            expect(bbox.min.y).toBeLessThan(-1.5); // relief extends below baseplate
        });
    });

    describe('buildStampModel', () => {
        it('assembles die, podium, and handle into a complete stamp model', () => {
            const width = 16;
            const height = 16;
            const dummyHeightmap = new Uint8ClampedArray(width * height * 4);

            const assembly = buildStampModel(
                DEFAULT_STAMP_CONFIG,
                dummyHeightmap,
                width,
                height
            );

            expect(assembly).toBeDefined();
            expect(assembly.dieMesh).toBeDefined();
            expect(assembly.podiumMesh).toBeDefined();
            expect(assembly.handleMesh).toBeDefined();
            expect(assembly.rootGroup.children.length).toBe(3);

            // Check metrics
            expect(assembly.metrics.widthMm).toBe(DEFAULT_STAMP_CONFIG.dimensions.widthMm);
            expect(assembly.metrics.depthMm).toBe(DEFAULT_STAMP_CONFIG.dimensions.depthMm);
            expect(assembly.metrics.totalHeightMm).toBeGreaterThan(50);
            expect(assembly.metrics.triangleCount).toBeGreaterThan(100);
            expect(assembly.metrics.isManifold).toBe(true);

            // Check merged geometry for 3D printing
            expect(assembly.mergedGeometry.getAttribute('position').count).toBeGreaterThan(100);
            expect(assembly.mergedGeometry.getIndex()).toBeDefined();
        });

        it('assembles a handle-less stamp to conserve filament', () => {
            const width = 16;
            const height = 16;
            // Solid artwork, so the relief actually reaches full depth.
            const solidHeightmap = new Uint8ClampedArray(width * height * 4).fill(255);

            const noHandleConfig = {
                ...DEFAULT_STAMP_CONFIG,
                handleStyle: 'none' as const,
            };

            const assembly = buildStampModel(
                noHandleConfig,
                solidHeightmap,
                width,
                height
            );

            expect(assembly.handleMesh).toBeNull();
            expect(assembly.rootGroup.children.length).toBe(2);
            // Height without handle is just baseplate + relief + podium
            const expectedHeight =
                noHandleConfig.dimensions.basePlateThicknessMm +
                noHandleConfig.dimensions.reliefDepthMm +
                noHandleConfig.dimensions.podiumThicknessMm;
            expect(assembly.metrics.totalHeightMm).toBeCloseTo(expectedHeight, 1);
        });

        it('reports the height actually modelled when a handle clamps its own size', () => {
            const width = 16;
            const height = 16;
            const solidHeightmap = new Uint8ClampedArray(width * height * 4).fill(255);

            // finger-grip caps itself at 12mm to save filament, however tall the slider is set.
            const config = {
                ...DEFAULT_STAMP_CONFIG,
                handleStyle: 'finger-grip' as const,
                dimensions: { ...DEFAULT_STAMP_CONFIG.dimensions, handleHeightMm: 60 },
            };

            const assembly = buildStampModel(config, solidHeightmap, width, height);
            const naiveHeight =
                config.dimensions.basePlateThicknessMm +
                config.dimensions.reliefDepthMm +
                config.dimensions.podiumThicknessMm +
                config.dimensions.handleHeightMm;

            expect(assembly.metrics.totalHeightMm).toBeLessThan(naiveHeight);
            expect(assembly.metrics.totalHeightMm).toBeCloseTo(1.5 + 2.0 + 6 + 12, 1);
        });

        it('reports a solid volume usable as a material estimate', () => {
            const width = 16;
            const height = 16;
            const solidHeightmap = new Uint8ClampedArray(width * height * 4).fill(255);

            const small = buildStampModel(DEFAULT_STAMP_CONFIG, solidHeightmap, width, height);
            const large = buildStampModel(
                {
                    ...DEFAULT_STAMP_CONFIG,
                    dimensions: { ...DEFAULT_STAMP_CONFIG.dimensions, widthMm: 80, depthMm: 60 },
                },
                solidHeightmap,
                width,
                height
            );

            expect(small.metrics.solidVolumeMm3).toBeGreaterThan(0);
            expect(large.metrics.solidVolumeMm3).toBeGreaterThan(small.metrics.solidVolumeMm3);
        });
    });

    describe('Shape Integrity and Dimension Synchronization', () => {
        it('enforces circular symmetry on relief dies regardless of inputs', () => {
            const width = 16;
            const height = 16;
            const dummyHeightmap = new Uint8ClampedArray(width * height * 4).fill(255);

            const circularRelief = createStampReliefGeometry({
                heightmapData: dummyHeightmap,
                gridWidth: width,
                gridHeight: height,
                physicalWidthMm: 60,
                physicalDepthMm: 40,
                reliefDepthMm: 2.0,
                basePlateThicknessMm: 1.5,
                shape: 'circular',
                draftAngleDeg: 8,
            });

            expect(circularRelief).toBeDefined();
            circularRelief.computeBoundingBox();
            const bbox = circularRelief.boundingBox!;

            // A circular die is a disc of the smaller dimension, not a 60x40 slab with the
            // corners merely flattened - otherwise the plate juts out from under a round podium.
            expect(bbox.min.x).toBeCloseTo(-20, 0);
            expect(bbox.max.x).toBeCloseTo(20, 0);
            expect(bbox.min.z).toBeCloseTo(-20, 0);
            expect(bbox.max.z).toBeCloseTo(20, 0);

            // Every vertex must lie on or inside that disc.
            const pos = circularRelief.getAttribute('position');
            let maxRadius = 0;
            for (let i = 0; i < pos.count; i++) {
                const r = Math.hypot(pos.getX(i), pos.getZ(i));
                if (r > maxRadius) maxRadius = r;
            }
            expect(maxRadius).toBeLessThanOrEqual(20.001);
        });

        it('matches the oval die footprint to the oval podium footprint', () => {
            const width = 32;
            const height = 24;
            const heightmap = new Uint8ClampedArray(width * height * 4).fill(255);

            const ovalDie = createStampReliefGeometry({
                heightmapData: heightmap,
                gridWidth: width,
                gridHeight: height,
                physicalWidthMm: 54,
                physicalDepthMm: 38,
                reliefDepthMm: 2.0,
                basePlateThicknessMm: 1.5,
                shape: 'oval',
                draftAngleDeg: 8,
            });

            const pos = ovalDie.getAttribute('position');
            let maxNormalisedRadius = 0;
            for (let i = 0; i < pos.count; i++) {
                const nx = pos.getX(i) / 27;
                const nz = pos.getZ(i) / 19;
                const r = Math.hypot(nx, nz);
                if (r > maxNormalisedRadius) maxNormalisedRadius = r;
            }

            // Elliptical outline: no vertex outside the 54 x 38 ellipse, and it reaches the rim.
            expect(maxNormalisedRadius).toBeLessThanOrEqual(1.001);
            expect(maxNormalisedRadius).toBeGreaterThan(0.999);
        });

        it('builds oval stamp assembly without converting to rectangle or square', () => {
            const width = 32;
            const height = 24;
            const dummyHeightmap = new Uint8ClampedArray(width * height * 4).fill(255);

            const ovalConfig = {
                ...DEFAULT_STAMP_CONFIG,
                podiumShape: 'oval' as const,
                dimensions: {
                    ...DEFAULT_STAMP_CONFIG.dimensions,
                    widthMm: 54,
                    depthMm: 38,
                },
            };

            const assembly = buildStampModel(ovalConfig, dummyHeightmap, width, height);
            expect(assembly).toBeDefined();
            expect(assembly.podiumMesh.name).toBe('StampPodium');
            expect(assembly.dieMesh.name).toBe('StampDie');
            expect(assembly.metrics.widthMm).toBe(54);
            expect(assembly.metrics.depthMm).toBe(38);
        });

        it('renders artwork with correct aspect ratio grid dimensions', async () => {
            const ovalConfig = {
                ...DEFAULT_STAMP_CONFIG,
                podiumShape: 'oval' as const,
                dimensions: {
                    ...DEFAULT_STAMP_CONFIG.dimensions,
                    widthMm: 60,
                    depthMm: 30, // 2:1 aspect ratio
                },
            };

            const result = await renderStampArtwork(
                ovalConfig.artwork,
                ovalConfig.podiumShape,
                ovalConfig.dimensions,
                512
            );

            expect(result.gridWidth).toBe(512);
            expect(result.gridHeight).toBe(256); // 512 * (30/60) = 256
        });
    });
});
