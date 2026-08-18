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

/**
 * Binary min-heap over (cost, sequence).
 *
 * The candidate frontier was a plain array with a linear scan per pop —
 * O(E²) over a panel's edges. Fine at the tens of faces the first meshes
 * had; a dense generated model panelizes to tens of thousands of faces and
 * the scan alone froze the app for minutes.
 */
class CandidateHeap {
    private items: Candidate[] = [];

    get size(): number { return this.items.length; }

    private less(a: Candidate, b: Candidate): boolean {
        if (a.cost < b.cost - EPSILON) return true;
        if (b.cost < a.cost - EPSILON) return false;
        return a.sequence < b.sequence;
    }

    push(item: Candidate): void {
        const items = this.items;
        items.push(item);
        let index = items.length - 1;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!this.less(items[index], items[parent])) break;
            [items[index], items[parent]] = [items[parent], items[index]];
            index = parent;
        }
    }

    pop(): Candidate | undefined {
        const items = this.items;
        if (items.length === 0) return undefined;
        const top = items[0];
        const tail = items.pop()!;
        if (items.length > 0) {
            items[0] = tail;
            let index = 0;
            for (;;) {
                const left = index * 2 + 1;
                const right = left + 1;
                let smallest = index;
                if (left < items.length && this.less(items[left], items[smallest])) smallest = left;
                if (right < items.length && this.less(items[right], items[smallest])) smallest = right;
                if (smallest === index) break;
                [items[index], items[smallest]] = [items[smallest], items[index]];
                index = smallest;
            }
        }
        return top;
    }
}

type PlacedEntry = {
    faceIndex: number;
    polygon: Vec2[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

/**
 * Uniform grid over placed faces, so a new face is overlap-tested only
 * against neighbours instead of against everything placed so far — the
 * other half of the same freeze. Cell size tracks the typical face so a
 * face usually touches a handful of cells.
 */
class PlacementGrid {
    private cells = new Map<string, PlacedEntry[]>();

    constructor(private cellSize: number) {}

    private *cellKeys(entry: { minX: number; minY: number; maxX: number; maxY: number }): Iterable<string> {
        const x0 = Math.floor(entry.minX / this.cellSize);
        const x1 = Math.floor(entry.maxX / this.cellSize);
        const y0 = Math.floor(entry.minY / this.cellSize);
        const y1 = Math.floor(entry.maxY / this.cellSize);
        for (let x = x0; x <= x1; x += 1) {
            for (let y = y0; y <= y1; y += 1) yield `${x}:${y}`;
        }
    }

    insert(entry: PlacedEntry): void {
        for (const key of this.cellKeys(entry)) {
            const bucket = this.cells.get(key);
            if (bucket) bucket.push(entry); else this.cells.set(key, [entry]);
        }
    }

    /** Placed faces whose bounding boxes intersect the given box. */
    *near(box: { minX: number; minY: number; maxX: number; maxY: number }): Iterable<PlacedEntry> {
        const seen = new Set<number>();
        for (const key of this.cellKeys(box)) {
            for (const entry of this.cells.get(key) ?? []) {
                if (seen.has(entry.faceIndex)) continue;
                seen.add(entry.faceIndex);
                if (entry.minX > box.maxX || entry.maxX < box.minX
                    || entry.minY > box.maxY || entry.maxY < box.minY) continue;
                yield entry;
            }
        }
    }
}

const polygonBox = (polygon: Vec2[]) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const point of polygon) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
    }
    return { minX, minY, maxX, maxY };
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

        const seedCoordinates = localFrameCoordinates(mesh, seed);
        place(seed, seedCoordinates);
        // Cell size from the seed face's own extent: faces in one mesh are
        // broadly similar in scale, so most faces span a handful of cells.
        const seedBox = polygonBox(mesh.faces[seed].map((vertexIndex) => seedCoordinates.get(vertexIndex)!));
        const cellSize = Math.max(1e-6, Math.max(seedBox.maxX - seedBox.minX, seedBox.maxY - seedBox.minY)) * 2;
        const grid = new PlacementGrid(cellSize);
        grid.insert({ faceIndex: seed, polygon: mesh.faces[seed].map((v) => seedCoordinates.get(v)!), ...seedBox });

        const candidates = new CandidateHeap();
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

        while (candidates.size > 0) {
            const candidate = candidates.pop()!;
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

            const childBox = polygonBox(childPolygon);
            let collides = false;
            for (const entry of grid.near(childBox)) {
                if (entry.faceIndex === candidate.parentFace) continue;
                if (polygonsOverlap(entry.polygon, childPolygon)) { collides = true; break; }
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
            grid.insert({ faceIndex: candidate.childFace, polygon: childPolygon, ...childBox });
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
