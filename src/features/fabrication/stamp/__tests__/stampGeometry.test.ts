/**
 * 3D Stamp Tool - Geometry & Assembly Unit Tests
 */

import * as THREE from 'three';
import { createStampHandleGeometry } from '../domain/stampHandleGeometry';
import { createStampPodiumGeometry } from '../domain/stampPodiumGeometry';
import { createStampReliefGeometry } from '../domain/stampReliefExtrusion';
import { buildStampModel } from '../domain/stampModelBuilder';
import { DEFAULT_STAMP_CONFIG } from '../domain/stampTypes';

describe('3D Stamp Geometry Builders', () => {
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
    });
});
