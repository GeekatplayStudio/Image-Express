/**
 * Foldcraft S2 — merging a planar region into a polygon.
 *
 * After planarisation a region's faces are exactly coplanar, so the triangles
 * inside it are noise: what the maker cuts is the region's outline. Tracing the
 * boundary turns a fan of triangles into one panel with clean edges, which is
 * both fewer fold lines and a far better-looking cut sheet.
 *
 * A region that traces to more than one loop is left as its original faces.
 * That happens when the region is an annulus — a hat brim is the obvious case —
 * and a single vertex list cannot express a hole. Splitting such a region with
 * an arbitrary cut would put a seam somewhere the maker did not choose, so it
 * is left alone and reported instead. The analytic path handles annuli properly.
 */

import type { FoldcraftMesh } from './foldcraftTypes';
import { facePlanarityDeg, type PlanarRegion } from './planarize';
import {
    EPSILON,
    buildEdgeMap,
    cross,
    length3,
    normalize,
    sub,
    undirectedEdgeKey,
} from './meshTopology';

type DirectedBoundary = { from: number; to: number };

/**
 * Ordered vertex loops around a region.
 *
 * A boundary edge is one whose twin face lies outside the region. Because the
 * mesh is consistently wound, those directed edges already circulate the region
 * the right way round, so following them preserves the outward winding.
 */
export function traceRegionLoops(
    mesh: FoldcraftMesh,
    region: PlanarRegion,
    edges: ReturnType<typeof buildEdgeMap>,
): number[][] {
    const inRegion = new Set(region.faces);
    const boundary: DirectedBoundary[] = [];
    region.faces.forEach((faceIndex) => {
        const face = mesh.faces[faceIndex];
        for (let corner = 0; corner < face.length; corner += 1) {
            const from = face[corner];
            const to = face[(corner + 1) % face.length];
            const uses = edges.get(undirectedEdgeKey(from, to)) ?? [];
            const twin = uses.find((use) => use.faceIndex !== faceIndex);
            if (twin && inRegion.has(twin.faceIndex)) continue;
            boundary.push({ from, to });
        }
    });

    const outgoing = new Map<number, number[]>();
    boundary.forEach((edge, index) => {
        const list = outgoing.get(edge.from);
        if (list) list.push(index); else outgoing.set(edge.from, [index]);
    });

    const used = new Array<boolean>(boundary.length).fill(false);
    const loops: number[][] = [];
    for (let start = 0; start < boundary.length; start += 1) {
        if (used[start]) continue;
        const loop: number[] = [];
        let current = start;
        while (current >= 0 && !used[current]) {
            used[current] = true;
            loop.push(boundary[current].from);
            const candidates = outgoing.get(boundary[current].to) ?? [];
            current = candidates.find((index) => !used[index]) ?? -1;
        }
        if (loop.length >= 3) loops.push(loop);
    }
    return loops;
}

/**
 * Drop vertices that sit on a straight run between their neighbours.
 *
 * Merging coplanar triangles leaves the seams' midpoints behind as collinear
 * corners. They cost cut resolution and clutter the sheet without describing
 * the shape.
 */
export function removeCollinear(mesh: FoldcraftMesh, loop: number[], toleranceDeg: number): number[] {
    if (loop.length <= 3) return loop;
    const limit = Math.sin(Math.max(0, toleranceDeg) * Math.PI / 180);
    const kept: number[] = [];
    for (let index = 0; index < loop.length; index += 1) {
        const previous = mesh.vertices[kept.length > 0 ? kept[kept.length - 1] : loop[(index - 1 + loop.length) % loop.length]];
        const current = mesh.vertices[loop[index]];
        const next = mesh.vertices[loop[(index + 1) % loop.length]];
        const incoming = sub(current, previous);
        const outgoing = sub(next, current);
        const lengths = length3(incoming) * length3(outgoing);
        if (lengths < EPSILON) continue;
        const bend = length3(cross(incoming, outgoing)) / lengths;
        if (bend <= limit) continue;
        kept.push(loop[index]);
    }
    return kept.length >= 3 ? kept : loop;
}

/** Signed area of a loop projected onto the region plane. */
function loopArea(mesh: FoldcraftMesh, loop: number[], region: PlanarRegion): number {
    const normal = region.normal;
    const reference = Math.abs(normal.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const u = normalize(cross(normal, reference));
    const v = cross(normal, u);
    let total = 0;
    for (let index = 0; index < loop.length; index += 1) {
        const a = sub(mesh.vertices[loop[index]], region.origin);
        const b = sub(mesh.vertices[loop[(index + 1) % loop.length]], region.origin);
        const ax = a.x * u.x + a.y * u.y + a.z * u.z;
        const ay = a.x * v.x + a.y * v.y + a.z * v.z;
        const bx = b.x * u.x + b.y * u.y + b.z * u.z;
        const by = b.x * v.x + b.y * v.y + b.z * v.z;
        total += ax * by - bx * ay;
    }
    return total / 2;
}

export type MergeResult = {
    faces: number[][];
    mergedRegions: number;
    /** Regions left as triangles because they enclose a hole. */
    holedRegions: number;
};

/** Replace each region's faces with its traced outline where that is possible. */
export function mergeRegionsIntoPolygons(
    mesh: FoldcraftMesh,
    regions: PlanarRegion[],
    collinearToleranceDeg: number,
): MergeResult {
    const edges = buildEdgeMap(mesh);
    const faces: number[][] = [];
    let mergedRegions = 0;
    let holedRegions = 0;

    regions.forEach((region) => {
        const loops = traceRegionLoops(mesh, region, edges).filter((loop) => (
            Math.abs(loopArea(mesh, loop, region)) > EPSILON
        ));
        if (loops.length !== 1) {
            if (loops.length > 1) holedRegions += 1;
            region.faces.forEach((faceIndex) => faces.push([...mesh.faces[faceIndex]]));
            return;
        }
        const simplified = removeCollinear(mesh, loops[0], collinearToleranceDeg);
        if (simplified.length < 3) {
            region.faces.forEach((faceIndex) => faces.push([...mesh.faces[faceIndex]]));
            return;
        }
        faces.push(simplified);
        mergedRegions += 1;
    });

    return { faces, mergedRegions, holedRegions };
}

/**
 * Split any panel that is still not flat into triangles.
 *
 * Region growing is greedy, and at coarse tolerances it occasionally produces a
 * region that simply cannot be flattened without wrecking the shape — on a test
 * hemisphere one setting left panels 1.2 degrees out of true no matter how the
 * vertex clamp was tuned. A panel that is not flat cannot be cut from flat
 * stock, so rather than report the problem and ship it, those panels are
 * fanned into triangles, which are planar by definition.
 *
 * The result is fewer merged panels in exactly the cases where merging was not
 * viable, and a hard guarantee that every face handed downstream is flat.
 */
export function enforcePlanarity(
    mesh: FoldcraftMesh,
    toleranceDeg: number,
): { faces: number[][]; splitFaces: number } {
    const faces: number[][] = [];
    let splitFaces = 0;
    mesh.faces.forEach((face, faceIndex) => {
        if (face.length < 4 || facePlanarityDeg(mesh, faceIndex) <= toleranceDeg) {
            faces.push([...face]);
            return;
        }
        splitFaces += 1;
        for (let corner = 1; corner + 1 < face.length; corner += 1) {
            faces.push([face[0], face[corner], face[corner + 1]]);
        }
    });
    return { faces, splitFaces };
}

/** Drop vertices no face references and renumber what is left. */
export function compactMesh(mesh: FoldcraftMesh): FoldcraftMesh {
    const remap = new Map<number, number>();
    const vertices = [];
    for (const face of mesh.faces) {
        for (const vertexIndex of face) {
            if (remap.has(vertexIndex)) continue;
            remap.set(vertexIndex, vertices.length);
            vertices.push(mesh.vertices[vertexIndex]);
        }
    }
    return {
        vertices,
        faces: mesh.faces.map((face) => face.map((vertexIndex) => remap.get(vertexIndex)!)),
        unitsPerMm: mesh.unitsPerMm,
    };
}
