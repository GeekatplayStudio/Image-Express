/**
 * Foldcraft S9 — validation.
 *
 * The predecessor's confidence score reported 94% on output whose fold
 * directions were half wrong, because it measured only coverage and length
 * preservation — properties that stay perfect when a fold's *sign* flips.
 * This validator checks the properties that actually fail:
 *
 *  - every recorded fold angle is re-measured against the source mesh,
 *    sign included, so one flipped mountain/valley marks the plan;
 *  - every face is placed exactly once across all panels;
 *  - no panel is a mirror image;
 *  - no two faces of a panel overlap on the sheet;
 *  - flattened edge lengths match the mesh.
 */

import type { FlatPanel, FoldBackReport, FoldcraftMesh } from './foldcraftTypes';
import { polygonsOverlap } from './flattenRigid';
import { buildEdgeMap, dihedralDegrees, distance3 } from './meshTopology';

const SIGN_AGREEMENT_TOLERANCE_DEG = 0.75;

/**
 * @param flatMmPerUnit Millimetres of flattened panel per mesh unit. 1 when
 * panels are unscaled; the pipeline passes the finished-size scale it applied.
 */
export function validateFoldPlan(mesh: FoldcraftMesh, panels: FlatPanel[], flatMmPerUnit = 1): FoldBackReport {
    const issues: string[] = [];
    const edges = buildEdgeMap(mesh);

    // Coverage: every face on exactly one panel.
    const seen = new Map<number, number>();
    panels.forEach((panel) => panel.faces.forEach((face) => {
        seen.set(face.faceId, (seen.get(face.faceId) ?? 0) + 1);
    }));
    const unplacedFaces = mesh.faces.filter((_, index) => !seen.has(index)).length;
    const duplicates = [...seen.values()].filter((count) => count > 1).length;
    if (unplacedFaces > 0) issues.push(`${unplacedFaces} faces are on no panel.`);
    if (duplicates > 0) issues.push(`${duplicates} faces appear on more than one panel.`);

    // Fold signs: recorded dihedral vs the mesh's, sign-sensitively.
    let folds = 0;
    let agreeing = 0;
    let worstError = 0;
    panels.forEach((panel) => panel.interiorEdges.forEach((edge) => {
        const uses = edges.get(edge.edgeKey);
        if (!uses || uses.length !== 2) return;
        const parentUse = uses.find((use) => use.faceIndex === edge.parentFace);
        if (!parentUse) return;
        const measured = dihedralDegrees(mesh, parentUse, edge.childFace);
        folds += 1;
        const error = Math.abs(measured - edge.dihedralDeg);
        worstError = Math.max(worstError, error);
        if (error <= SIGN_AGREEMENT_TOLERANCE_DEG) agreeing += 1;
    }));
    const foldSignConsistency = folds === 0 ? 1 : agreeing / folds;
    if (agreeing < folds) {
        issues.push(`${folds - agreeing} of ${folds} folds disagree with the mesh dihedral (worst ${worstError.toFixed(2)}°) — the assembled object will be the wrong shape.`);
    }

    const mirroredPanels = panels.filter((panel) => panel.mirrored).length;
    if (mirroredPanels > 0) issues.push(`${mirroredPanels} panels are mirror images and will assemble inside-out.`);

    // Overlaps within each panel.
    let overlappingPanels = 0;
    panels.forEach((panel) => {
        const adjacent = new Set(panel.interiorEdges.flatMap((edge) => [
            `${edge.parentFace}:${edge.childFace}`, `${edge.childFace}:${edge.parentFace}`,
        ]));
        for (let i = 0; i < panel.faces.length; i += 1) {
            for (let j = i + 1; j < panel.faces.length; j += 1) {
                if (adjacent.has(`${panel.faces[i].faceId}:${panel.faces[j].faceId}`)) continue;
                if (polygonsOverlap(panel.faces[i].points, panel.faces[j].points)) {
                    overlappingPanels += 1;
                    issues.push(`Panel P${panel.patchId + 1}: faces ${panel.faces[i].faceId} and ${panel.faces[j].faceId} overlap.`);
                    return;
                }
            }
        }
    });

    // Edge-length preservation, the refold-distance proxy that is exact for
    // rigid flattening: if lengths hold and signs hold, the net refolds.
    let refoldMax = 0;
    let refoldSum = 0;
    let refoldSamples = 0;
    panels.forEach((panel) => {
        const points = new Map(panel.faces.map((face) => [face.faceId, face.points]));
        panel.faces.forEach((face) => {
            const meshFace = mesh.faces[face.faceId];
            if (!meshFace) return;
            const flat = points.get(face.faceId)!;
            for (let corner = 0; corner < meshFace.length; corner += 1) {
                const next = (corner + 1) % meshFace.length;
                const spatial = distance3(mesh.vertices[meshFace[corner]], mesh.vertices[meshFace[next]]) * flatMmPerUnit;
                const planar = Math.hypot(flat[next].x - flat[corner].x, flat[next].y - flat[corner].y);
                const error = Math.abs(spatial - planar);
                refoldMax = Math.max(refoldMax, error);
                refoldSum += error;
                refoldSamples += 1;
            }
        });
    });

    const verdict: FoldBackReport['verdict'] = (
        unplacedFaces > 0 || duplicates > 0 || foldSignConsistency < 1 || mirroredPanels > 0 || overlappingPanels > 0
    ) ? 'fail' : refoldMax > 0.5 ? 'warn' : 'ok';

    return {
        verdict,
        refoldMaxErrorMm: Number(refoldMax.toFixed(4)),
        refoldMeanErrorMm: refoldSamples > 0 ? Number((refoldSum / refoldSamples).toFixed(4)) : 0,
        foldSignConsistency: Number(foldSignConsistency.toFixed(4)),
        mirroredPanels,
        overlappingPanels,
        unplacedFaces,
        issues,
    };
}
