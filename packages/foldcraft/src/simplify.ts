/**
 * Foldcraft S2 — the low-poly stage.
 *
 * The maker's model is usually a smooth, dense surface. What they cut is a
 * handful of flat panels. This stage does that conversion, and the tolerance is
 * the dial between "looks like the model" and "few enough pieces to build".
 *
 * `panelize` is the default because it is the mode that matches the workflow:
 * group nearly-coplanar faces, flatten each group onto one plane, and merge it
 * into a single polygon. It reduces face count and guarantees flatness in one
 * step, so no separate decimation pass is needed for typical input.
 */

import type { FoldcraftMesh, SimplifyOptions, SimplifyReport } from './foldcraftTypes';
import {
    growPlanarRegions,
    measurePlanarity,
    modelExtent,
    planarizeIteratively,
} from './planarize';
import { compactMesh, enforcePlanarity, mergeRegionsIntoPolygons } from './regionPolygons';

const DEFAULT_PLANAR_TOLERANCE_DEG = 8;
/** Corners straighter than this are dropped when a region becomes a polygon. */
const COLLINEAR_TOLERANCE_DEG = 1;
/** Enough for the alternating fit/snap to settle; it converges quickly. */
const PLANARIZE_ITERATIONS = 12;
/**
 * A panel flatter than this is flat enough to cut. Anything worse is split into
 * triangles rather than shipped, so "every face is flat" holds unconditionally.
 */
const PLANARITY_LIMIT_DEG = 0.05;

export type PanelizeReport = SimplifyReport & {
    regions: number;
    mergedRegions: number;
    holedRegions: number;
    /** Panels that had to be split into triangles to stay flat. */
    splitFaces: number;
    /** Deviation as a percentage of the model's longest axis. */
    maxDeviationPercent: number;
};

/**
 * Facet a model into flat panels.
 *
 * Ordering matters: regions are grown on the original surface, vertices are
 * snapped only once every plane is known, and merging happens last so it works
 * on geometry that is already exactly planar.
 */
export function panelizeMesh(mesh: FoldcraftMesh, toleranceDeg: number): PanelizeReport {
    const sourceFaces = mesh.faces.length;
    const extent = modelExtent(mesh);
    const grown = growPlanarRegions(mesh, toleranceDeg);
    const settled = planarizeIteratively(mesh, grown, PLANARIZE_ITERATIONS);
    const merged = mergeRegionsIntoPolygons(settled.mesh, settled.regions, COLLINEAR_TOLERANCE_DEG);
    const flattened = enforcePlanarity({ ...settled.mesh, faces: merged.faces }, PLANARITY_LIMIT_DEG);
    const result = compactMesh({ ...settled.mesh, faces: flattened.faces });

    return {
        mesh: result,
        sourceFaces,
        resultFaces: result.faces.length,
        maxDeviationMm: Number((settled.maxDeviation / mesh.unitsPerMm).toFixed(6)),
        maxDeviationPercent: Number((settled.maxDeviation / extent * 100).toFixed(4)),
        planarityErrorDeg: Number(measurePlanarity(result).toFixed(6)),
        regions: grown.length,
        mergedRegions: merged.mergedRegions,
        holedRegions: merged.holedRegions,
        splitFaces: flattened.splitFaces,
    };
}

/**
 * Coarse grid decimation: snap vertices to the centroids of a uniform grid,
 * drop faces that collapse, and deduplicate the rest.
 *
 * This is a safety net, not the quality path — panelize owns the look of the
 * output. Its job is to take a generated 500k-triangle sculpt down to a size
 * the rest of the pipeline can traverse without freezing the app, in linear
 * time, before any of the quadratic-leaning geometry runs. The tolerance
 * dial the user sees still applies afterwards, on the decimated mesh.
 */
export function decimateMesh(mesh: FoldcraftMesh, targetFaces: number): FoldcraftMesh {
    if (mesh.faces.length <= targetFaces) return mesh;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    mesh.vertices.forEach((point) => {
        if (point.x < min.x) min.x = point.x;
        if (point.x > max.x) max.x = point.x;
        if (point.y < min.y) min.y = point.y;
        if (point.y > max.y) max.y = point.y;
        if (point.z < min.z) min.z = point.z;
        if (point.z > max.z) max.z = point.z;
    });
    const span = {
        x: Math.max(1e-9, max.x - min.x),
        y: Math.max(1e-9, max.y - min.y),
        z: Math.max(1e-9, max.z - min.z),
    };

    const attempt = (divisions: number): FoldcraftMesh => {
        const clusterOf = new Map<string, number>();
        const sums: Array<{ x: number; y: number; z: number; n: number }> = [];
        const clusterIndex = (point: { x: number; y: number; z: number }): number => {
            const gx = Math.min(divisions - 1, Math.floor(((point.x - min.x) / span.x) * divisions));
            const gy = Math.min(divisions - 1, Math.floor(((point.y - min.y) / span.y) * divisions));
            const gz = Math.min(divisions - 1, Math.floor(((point.z - min.z) / span.z) * divisions));
            const key = `${gx}:${gy}:${gz}`;
            let index = clusterOf.get(key);
            if (index === undefined) {
                index = sums.length;
                clusterOf.set(key, index);
                sums.push({ x: 0, y: 0, z: 0, n: 0 });
            }
            return index;
        };
        const vertexCluster = mesh.vertices.map((point) => {
            const index = clusterIndex(point);
            const sum = sums[index];
            sum.x += point.x; sum.y += point.y; sum.z += point.z; sum.n += 1;
            return index;
        });
        const seenFaces = new Set<string>();
        const faces: number[][] = [];
        for (const face of mesh.faces) {
            const mapped = face.map((vertexIndex) => vertexCluster[vertexIndex]);
            const unique: number[] = [];
            mapped.forEach((cluster) => { if (!unique.includes(cluster)) unique.push(cluster); });
            if (unique.length < 3) continue;
            const key = [...unique].sort((a, b) => a - b).join(',');
            if (seenFaces.has(key)) continue;
            seenFaces.add(key);
            faces.push(unique);
        }
        return {
            vertices: sums.map((sum) => ({ x: sum.x / sum.n, y: sum.y / sum.n, z: sum.z / sum.n })),
            faces,
            unitsPerMm: mesh.unitsPerMm,
        };
    };

    // Finer grids keep more shape; walk down until the budget is met.
    for (const divisions of [192, 128, 96, 64, 48, 32, 24, 16, 12, 8, 6]) {
        const candidate = attempt(divisions);
        if (candidate.faces.length <= targetFaces) return candidate;
    }
    return attempt(4);
}

export function simplifyMesh(mesh: FoldcraftMesh, options: SimplifyOptions): SimplifyReport {
    if (options.mode === 'panelize') {
        return panelizeMesh(mesh, options.planarToleranceDeg ?? DEFAULT_PLANAR_TOLERANCE_DEG);
    }
    // 'decimate' and 'voxelize' arrive with their own phases; see docs/FOLDCRAFT.md.
    return {
        mesh,
        sourceFaces: mesh.faces.length,
        resultFaces: mesh.faces.length,
        maxDeviationMm: 0,
        planarityErrorDeg: Number(measurePlanarity(mesh).toFixed(6)),
    };
}
