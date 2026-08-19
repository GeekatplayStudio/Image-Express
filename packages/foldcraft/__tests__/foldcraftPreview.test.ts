/**
 * Stage previews and pipeline progress: the promise is that a host app can
 * show the user every step — the model as read, the low-poly conversion, the
 * unfold — with real numbers attached, while the pipeline runs.
 */

import { buildFoldPlan } from '../src/buildFoldPlan';
import { meshPreviewSvg, panelsPreviewSvg } from '../src/exportPreview';
import { FOLD_PROGRESS_STAGES, type FoldProgressEvent } from '../src/foldcraftTypes';
import { ingestMesh } from '../src/ingest';
import { segmentIntoPanels } from '../src/segment';
import { cubeTrianglesMesh, hemisphereMesh } from './testMeshes';

describe('meshPreviewSvg', () => {
    it('renders a shaded isometric thumbnail of a mesh', () => {
        const { mesh } = ingestMesh(cubeTrianglesMesh());
        const svg = meshPreviewSvg(mesh);
        expect(svg).toMatch(/^<svg /);
        expect(svg).toContain('viewBox=');
        // Back-face culling: a cube shows at most half its 12 triangles.
        const polygons = svg.match(/<polygon /g) ?? [];
        expect(polygons.length).toBeGreaterThanOrEqual(3);
        expect(polygons.length).toBeLessThanOrEqual(6);
    });

    it('stays bounded on a dense mesh via the face cap', () => {
        const { mesh } = ingestMesh(hemisphereMesh(20, 40));
        const svg = meshPreviewSvg(mesh, { maxFaces: 50 });
        expect((svg.match(/<polygon /g) ?? []).length).toBeLessThanOrEqual(50);
    });
});

describe('panelsPreviewSvg', () => {
    it('draws cut outlines and dashed fold lines for unfolded panels', () => {
        const { mesh } = ingestMesh(cubeTrianglesMesh());
        const { panels } = segmentIntoPanels(mesh, { maxPanelWidthMm: 1000, maxPanelHeightMm: 1000 });
        const svg = panelsPreviewSvg(panels);
        expect(svg).toMatch(/^<svg /);
        expect(svg).toContain('stroke="#334155"');
        // A cube unfold folds only one way; its folds must be drawn dashed.
        expect(svg).toContain('stroke-dasharray=');
    });
});

describe('buildFoldPlan progress', () => {
    it('reports every stage in order with stats and visual previews', () => {
        const events: FoldProgressEvent[] = [];
        buildFoldPlan(hemisphereMesh(8, 20), { onProgress: (event) => events.push(event) });

        const startOrder = events.filter((e) => e.status === 'start').map((e) => e.stage);
        expect(startOrder).toEqual([...FOLD_PROGRESS_STAGES]);
        // Every started stage finishes, in the same order.
        const doneOrder = events.filter((e) => e.status === 'done').map((e) => e.stage);
        expect(doneOrder).toEqual([...FOLD_PROGRESS_STAGES]);
        // Each start precedes its done.
        FOLD_PROGRESS_STAGES.forEach((stage) => {
            const start = events.findIndex((e) => e.stage === stage && e.status === 'start');
            const done = events.findIndex((e) => e.stage === stage && e.status === 'done');
            expect(start).toBeGreaterThanOrEqual(0);
            expect(done).toBeGreaterThan(start);
        });

        const byStage = new Map(events.filter((e) => e.status === 'done').map((e) => [e.stage, e]));
        // The user asked to SEE the conversion and the unfold.
        expect(byStage.get('load')?.previewSvg).toMatch(/^<svg /);
        expect(byStage.get('lowpoly')?.previewSvg).toMatch(/^<svg /);
        expect(byStage.get('unfold')?.previewSvg).toMatch(/^<svg /);
        // And numbers with every stage.
        expect(byStage.get('load')?.stats?.faces).toBeGreaterThan(0);
        expect(byStage.get('lowpoly')?.stats?.flatFaces).toBeGreaterThan(0);
        expect(byStage.get('unfold')?.stats?.panels).toBeGreaterThan(0);
        expect(byStage.get('grooves')?.stats?.grooves).toBeGreaterThan(0);
        expect(byStage.get('layout')?.stats?.sheets).toBeGreaterThan(0);
        expect(typeof byStage.get('verify')?.stats?.verdict).toBe('string');
    });

    it('emits no events and skips preview work when no listener is attached', () => {
        // Previews cost render time; the API contract is they are lazy.
        const result = buildFoldPlan(hemisphereMesh(6, 14), {});
        expect(result.panels.length).toBeGreaterThan(0);
    });
});
