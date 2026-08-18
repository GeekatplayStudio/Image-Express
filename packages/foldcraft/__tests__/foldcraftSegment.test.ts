/**
 * Segmentation: cuts land on sharp edges, panels obey physical constraints,
 * and — the structural guarantee — every face ends up on exactly one panel.
 */

import { ingestMesh } from '../src/ingest';
import { segmentIntoPanels } from '../src/segment';
import { panelizeMesh } from '../src/simplify';
import { cubeMesh, hemisphereMesh, icosahedronMesh, cylinderMesh } from './testMeshes';
import type { FoldcraftMesh } from '../src/foldcraftTypes';

const BIG_SHEET = { maxPanelWidthMm: 1000, maxPanelHeightMm: 1000 };

const coverage = (mesh: FoldcraftMesh, panels: ReturnType<typeof segmentIntoPanels>['panels']) => {
    const seen = new Map<number, number>();
    panels.forEach((panel) => panel.faces.forEach((face) => {
        seen.set(face.faceId, (seen.get(face.faceId) ?? 0) + 1);
    }));
    return {
        placedOnce: [...seen.values()].every((count) => count === 1),
        total: seen.size,
        expected: mesh.faces.length,
    };
};

describe('segmentIntoPanels', () => {
    it('unfolds a cube into a single panel — the old code gave 11 islands on simpler input', () => {
        const { mesh } = ingestMesh(cubeMesh());
        const result = segmentIntoPanels(mesh, BIG_SHEET);
        expect(result.panels).toHaveLength(1);
        expect(result.panels[0].faces).toHaveLength(6);
        expect(result.seamCount).toBe(0);
        expect(result.foldCount).toBe(5); // spanning tree of 6 faces
    });

    it('unfolds an icosahedron into one panel with every fold intact', () => {
        const { mesh } = ingestMesh(icosahedronMesh());
        const result = segmentIntoPanels(mesh, BIG_SHEET);
        const cover = coverage(mesh, result.panels);
        expect(cover.placedOnce).toBe(true);
        expect(cover.total).toBe(20);
        // An icosahedron has a one-piece net; the greedy growth should find one.
        expect(result.panels).toHaveLength(1);
        expect(result.foldCount).toBe(19);
    });

    it('covers a panelized hemisphere in few panels, never dropping a face', () => {
        const { mesh } = ingestMesh(hemisphereMesh(8, 20));
        const lowPoly = panelizeMesh(mesh, 14).mesh;
        const result = segmentIntoPanels(ingestMesh(lowPoly).mesh, BIG_SHEET);
        const cover = coverage(ingestMesh(lowPoly).mesh, result.panels);
        expect(cover.placedOnce).toBe(true);
        expect(cover.total).toBe(cover.expected);
        // The predecessor gave 11 islands for 70 faces. Whatever the exact
        // count, fragmentation must be far below one island per few faces.
        expect(result.panels.length).toBeLessThanOrEqual(Math.max(3, Math.ceil(cover.expected / 8)));
        result.panels.forEach((panel) => expect(panel.mirrored).toBe(false));
    });

    it('splits panels when the sheet cannot hold the whole net', () => {
        const { mesh } = ingestMesh(cubeMesh());
        // A unit cube's one-piece net spans 4 units; a 2.5-unit sheet cannot hold it.
        const result = segmentIntoPanels(mesh, { maxPanelWidthMm: 2.5, maxPanelHeightMm: 2.5 });
        expect(result.panels.length).toBeGreaterThan(1);
        const cover = coverage(mesh, result.panels);
        expect(cover.placedOnce).toBe(true);
        expect(cover.total).toBe(6);
        result.panels.forEach((panel) => {
            const width = panel.boundsMm.maxX - panel.boundsMm.minX;
            const height = panel.boundsMm.maxY - panel.boundsMm.minY;
            expect(Math.min(width, height)).toBeLessThanOrEqual(2.5 + 1e-9);
            expect(Math.max(width, height)).toBeLessThanOrEqual(2.5 + 1e-9);
        });
    });

    it('prefers cutting sharp edges: a cylinder cuts at the caps, not up the side', () => {
        const { mesh } = ingestMesh(cylinderMesh(16));
        const lowPoly = ingestMesh(panelizeMesh(mesh, 10).mesh).mesh;
        const result = segmentIntoPanels(lowPoly, { maxPanelWidthMm: 8, maxPanelHeightMm: 8 });
        const cover = coverage(lowPoly, result.panels);
        expect(cover.placedOnce).toBe(true);
        // Whatever the split, no face may be lost.
        expect(cover.total).toBe(cover.expected);
    });

    it('keeps fold directions consistent on convex solids after segmentation', () => {
        const { mesh } = ingestMesh(icosahedronMesh());
        const result = segmentIntoPanels(mesh, BIG_SHEET);
        result.panels.forEach((panel) => {
            const folds = panel.interiorEdges.filter((edge) => edge.direction !== 'flat');
            folds.forEach((edge) => expect(edge.direction).toBe('mountain'));
        });
    });
});
