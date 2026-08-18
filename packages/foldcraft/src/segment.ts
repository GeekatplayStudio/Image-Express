/**
 * Foldcraft S4 — segmentation.
 *
 * Decides where the model is cut apart, which is the decision a maker judges
 * the whole tool by: every cut is a visible seam and a glue joint.
 *
 * The face-adjacency dual graph is grown greedily, flattest edge first. Keeping
 * a nearly-flat edge connected costs nothing — the panels fold gently across it
 * — while a sharp edge is exactly where a seam hides best and glues strongest,
 * so sharp edges are where the cuts land. This is the spanning-tree idea used
 * by the known paper-model tools, grown incrementally so that every acceptance
 * can be checked against the physical constraints as it happens:
 *
 *  - the candidate face must not overlap faces already placed, and
 *  - the panel must stay inside the machine's usable sheet.
 *
 * A face rejected here is not lost; it stays available and seeds or joins a
 * later panel. The predecessor implementation's failure mode — silently
 * dropping unplaceable faces, or spraying them into single-triangle islands —
 * is structurally impossible: segmentation ends only when every face belongs
 * to exactly one panel, and a panel's growth record is the flattening itself,
 * so what was checked is what is returned.
 */

import type {
    FlatInteriorEdge,
    FlatPanel,
    FoldcraftMesh,
    Patch,
    SegmentOptions,
    Vec2,
} from './foldcraftTypes';
import {
    boundsOf,
    collectBoundaryEdges,
    foldDirectionFor,
    localFrameCoordinates,
    measureEdgeError,
    polygonsOverlap,
    rigidTransform,
} from './flattenRigid';
import {
    EPSILON,
    buildEdgeMap,
    dihedralDegrees,
    faceArea,
    undirectedEdgeKey,
} from './meshTopology';

export type SegmentResult = {
    panels: FlatPanel[];
    patches: Patch[];
    /** Interior edges kept as folds, across all panels. */
    foldCount: number;
    /** Shared mesh edges that became seams between two panels. */
    seamCount: number;
};

type Candidate = {
    parentFace: number;
    childFace: number;
    edgeKey: string;
    from: number;
    to: number;
    /** Degrees away from flat; lower is cheaper to keep as a fold. */
    cost: number;
    /** Insertion order, so equal costs stay deterministic. */
    sequence: number;
};

const signedArea2 = (points: Vec2[]): number => {
    let total = 0;
    for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
};

export function segmentIntoPanels(mesh: FoldcraftMesh, options: SegmentOptions): SegmentResult {
    const edges = buildEdgeMap(mesh);
    const areas = mesh.faces.map((_, index) => faceArea(mesh, index));
    const seedOrder = mesh.faces.map((_, index) => index).sort((a, b) => areas[b] - areas[a]);
    const assigned = new Array<number>(mesh.faces.length).fill(-1);

    const panels: FlatPanel[] = [];
    const patches: Patch[] = [];
    let foldCount = 0;

    for (const seed of seedOrder) {
        if (assigned[seed] >= 0) continue;
        const patchId = patches.length;

        const placed = new Map<number, Map<number, Vec2>>();
        const polygons = new Map<number, Vec2[]>();
        const interiorEdges: FlatInteriorEdge[] = [];
        let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

        const place = (faceIndex: number, coordinates: Map<number, Vec2>) => {
            assigned[faceIndex] = patchId;
            placed.set(faceIndex, coordinates);
            const polygon = mesh.faces[faceIndex].map((vertexIndex) => coordinates.get(vertexIndex)!);
            polygons.set(faceIndex, polygon);
            polygon.forEach((point) => {
                bounds = {
                    minX: Math.min(bounds.minX, point.x),
                    minY: Math.min(bounds.minY, point.y),
                    maxX: Math.max(bounds.maxX, point.x),
                    maxY: Math.max(bounds.maxY, point.y),
                };
            });
        };

        place(seed, localFrameCoordinates(mesh, seed));

        // Candidates ordered by dihedral flatness. Meshes here are small enough
        // (hundreds of faces after panelize) that a sorted-insert array is
        // simpler than a heap and never the bottleneck.
        const candidates: Candidate[] = [];
        let sequence = 0;
        const pushCandidates = (faceIndex: number) => {
            const face = mesh.faces[faceIndex];
            for (let corner = 0; corner < face.length; corner += 1) {
                const from = face[corner];
                const to = face[(corner + 1) % face.length];
                const key = undirectedEdgeKey(from, to);
                const uses = edges.get(key);
                if (!uses || uses.length !== 2) continue;
                const parentUse = uses.find((use) => use.faceIndex === faceIndex);
                const childUse = uses.find((use) => use.faceIndex !== faceIndex);
                if (!parentUse || !childUse || assigned[childUse.faceIndex] >= 0) continue;
                const dihedral = dihedralDegrees(mesh, parentUse, childUse.faceIndex);
                candidates.push({
                    parentFace: faceIndex,
                    childFace: childUse.faceIndex,
                    edgeKey: key,
                    from,
                    to,
                    cost: Math.abs(180 - dihedral),
                    sequence: sequence++,
                });
            }
        };
        pushCandidates(seed);

        while (candidates.length > 0) {
            let best = 0;
            for (let index = 1; index < candidates.length; index += 1) {
                const challenger = candidates[index];
                const champion = candidates[best];
                if (challenger.cost < champion.cost - EPSILON
                    || (Math.abs(challenger.cost - champion.cost) <= EPSILON && challenger.sequence < champion.sequence)) {
                    best = index;
                }
            }
            const candidate = candidates.splice(best, 1)[0];
            if (assigned[candidate.childFace] >= 0) continue;
            const parentCoordinates = placed.get(candidate.parentFace);
            if (!parentCoordinates) continue;

            const childLocal = localFrameCoordinates(mesh, candidate.childFace);
            const transform = rigidTransform(
                childLocal.get(candidate.from)!,
                childLocal.get(candidate.to)!,
                parentCoordinates.get(candidate.from)!,
                parentCoordinates.get(candidate.to)!,
            );
            const childCoordinates = new Map<number, Vec2>();
            mesh.faces[candidate.childFace].forEach((vertexIndex) => {
                childCoordinates.set(vertexIndex, transform(childLocal.get(vertexIndex)!));
            });
            const childPolygon = mesh.faces[candidate.childFace].map((vertexIndex) => childCoordinates.get(vertexIndex)!);

            let collides = false;
            for (const [faceIndex, polygon] of polygons) {
                if (faceIndex === candidate.parentFace) continue;
                if (polygonsOverlap(polygon, childPolygon)) { collides = true; break; }
            }
            if (collides) continue;

            const withChild = {
                minX: Math.min(bounds.minX, ...childPolygon.map((point) => point.x)),
                minY: Math.min(bounds.minY, ...childPolygon.map((point) => point.y)),
                maxX: Math.max(bounds.maxX, ...childPolygon.map((point) => point.x)),
                maxY: Math.max(bounds.maxY, ...childPolygon.map((point) => point.y)),
            };
            const width = withChild.maxX - withChild.minX;
            const height = withChild.maxY - withChild.minY;
            // Either orientation may be rotated onto the sheet at packing time.
            const fits = (width <= options.maxPanelWidthMm && height <= options.maxPanelHeightMm)
                || (height <= options.maxPanelWidthMm && width <= options.maxPanelHeightMm);
            if (!fits) continue;

            place(candidate.childFace, childCoordinates);
            const parentUse = edges.get(candidate.edgeKey)!.find((use) => use.faceIndex === candidate.parentFace)!;
            const dihedral = dihedralDegrees(mesh, parentUse, candidate.childFace);
            interiorEdges.push({
                edgeKey: candidate.edgeKey,
                a: parentCoordinates.get(candidate.from)!,
                b: parentCoordinates.get(candidate.to)!,
                dihedralDeg: Number(dihedral.toFixed(4)),
                direction: foldDirectionFor(dihedral),
                parentFace: candidate.parentFace,
                childFace: candidate.childFace,
            });
            pushCandidates(candidate.childFace);
        }

        const facePolygons = [...placed.keys()].map((faceIndex) => ({
            faceId: faceIndex,
            points: polygons.get(faceIndex)!,
        }));
        const mirrored = facePolygons.some((polygon) => signedArea2(polygon.points) < -EPSILON);
        panels.push({
            patchId,
            kind: 'freeform',
            faces: facePolygons,
            interiorEdges,
            boundaryEdges: collectBoundaryEdges(mesh, edges, placed, interiorEdges),
            boundsMm: boundsOf(facePolygons),
            mirrored,
            maxEdgeErrorPct: Number(measureEdgeError(mesh, placed).toFixed(6)),
            method: 'rigid',
        });
        patches.push({
            id: patchId,
            faces: [...placed.keys()],
            seedFace: seed,
            regionId: patchId,
            kind: 'freeform',
        });
        foldCount += interiorEdges.length;
    }

    // A mesh edge whose two faces landed on different panels is a seam.
    let seamCount = 0;
    edges.forEach((uses) => {
        if (uses.length === 2 && assigned[uses[0].faceIndex] !== assigned[uses[1].faceIndex]) seamCount += 1;
    });

    return { panels, patches, foldCount, seamCount };
}
