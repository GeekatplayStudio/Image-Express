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
