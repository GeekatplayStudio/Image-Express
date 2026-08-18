/**
 * Foldcraft S1 — ingest.
 *
 * Turns raw geometry into a mesh the rest of the pipeline can trust: welded
 * vertices, no degenerate faces, and a consistent outward winding.
 *
 * Both guarantees are load-bearing. Welding is what makes adjacency exist at
 * all — glTF splits vertices per normal and UV, so the same corner arrives
 * several times and an unwelded mesh looks like disconnected triangles.
 * Orientation is what makes fold signs meaningful, because every dihedral is
 * measured against the parent face's winding.
 *
 * Pure: no three.js, no DOM. Model file loading lives in loadModel.ts so this
 * stage stays testable on synthetic meshes.
 */

import type { FoldcraftMesh, IngestOptions, IngestReport, Vec3 } from './foldcraftTypes';
import {
    EPSILON,
    add,
    boundingBox,
    buildEdgeMap,
    faceArea,
    faceCentroid,
    faceNormal,
    dot,
    normalize,
    scale,
    signedVolume6,
    sub,
    usesAgree,
} from './meshTopology';

const DEFAULT_WELD_RELATIVE = 1e-5;

/**
 * Merge vertices that sit within `tolerance` of each other.
 *
 * A uniform grid keyed at the tolerance size, checking the 27 neighbouring
 * cells, so two points either side of a cell boundary still merge.
 */
function weldVertices(vertices: Vec3[], tolerance: number): { vertices: Vec3[]; remap: number[] } {
    if (tolerance <= 0) return { vertices: [...vertices], remap: vertices.map((_, index) => index) };
    const cell = tolerance;
    const buckets = new Map<string, number[]>();
    const output: Vec3[] = [];
    const remap: number[] = new Array(vertices.length);
    const toleranceSquared = tolerance * tolerance;

    vertices.forEach((point, index) => {
        const gx = Math.floor(point.x / cell);
        const gy = Math.floor(point.y / cell);
        const gz = Math.floor(point.z / cell);
        let found = -1;
        for (let dx = -1; dx <= 1 && found < 0; dx += 1) {
            for (let dy = -1; dy <= 1 && found < 0; dy += 1) {
                for (let dz = -1; dz <= 1 && found < 0; dz += 1) {
                    const candidates = buckets.get(`${gx + dx},${gy + dy},${gz + dz}`);
                    if (!candidates) continue;
                    for (const candidate of candidates) {
                        const existing = output[candidate];
                        const dxx = existing.x - point.x;
                        const dyy = existing.y - point.y;
                        const dzz = existing.z - point.z;
                        if (dxx * dxx + dyy * dyy + dzz * dzz <= toleranceSquared) { found = candidate; break; }
                    }
                }
            }
        }
        if (found < 0) {
            found = output.length;
            output.push(point);
            const key = `${gx},${gy},${gz}`;
            const bucket = buckets.get(key);
            if (bucket) bucket.push(found); else buckets.set(key, [found]);
        }
        remap[index] = found;
    });
    return { vertices: output, remap };
}

/** Drop repeated neighbours, then faces that no longer span an area. */
function cleanFaces(mesh: FoldcraftMesh): { faces: number[][]; removed: number } {
    const faces: number[][] = [];
    let removed = 0;
    mesh.faces.forEach((face, faceIndex) => {
        const collapsed: number[] = [];
        face.forEach((vertexIndex) => {
            if (collapsed[collapsed.length - 1] !== vertexIndex) collapsed.push(vertexIndex);
        });
        while (collapsed.length > 1 && collapsed[0] === collapsed[collapsed.length - 1]) collapsed.pop();
        if (collapsed.length < 3 || new Set(collapsed).size < 3) { removed += 1; return; }
        if (faceArea(mesh, faceIndex) < EPSILON) { removed += 1; return; }
        faces.push(collapsed);
    });
    return { faces, removed };
}

/**
 * Propagate one winding across each connected component, flipping faces that
 * disagree with the neighbour they were reached from.
 *
 * Adjacent faces are consistent when they traverse their shared edge in
 * opposite directions, so a face reached across an edge it traverses the *same*
 * way as its parent is reversed.
 */
function orientConsistently(mesh: FoldcraftMesh): { faces: number[][]; reoriented: number; components: number[][] } {
    const faces = mesh.faces.map((face) => [...face]);
    const edgeIndex = buildEdgeIndex(faces);
    let reoriented = 0;
    const visited = new Array<boolean>(faces.length).fill(false);
    const components: number[][] = [];

    for (let seed = 0; seed < faces.length; seed += 1) {
        if (visited[seed]) continue;
        visited[seed] = true;
        const component = [seed];
        const queue = [seed];
        while (queue.length > 0) {
            const parentIndex = queue.shift()!;
            // Rebuilt per step because flipping a face rewrites its directed uses.
            const parentFace = faces[parentIndex];
            for (let corner = 0; corner < parentFace.length; corner += 1) {
                const from = parentFace[corner];
                const to = parentFace[(corner + 1) % parentFace.length];
                const key = from < to ? `${from}:${to}` : `${to}:${from}`;
                const uses = edgeIndex.get(key);
                if (!uses || uses.length !== 2) continue;
                const childIndex = uses[0] === parentIndex ? uses[1] : uses[0];
                if (childIndex === parentIndex || visited[childIndex]) continue;
                const childFace = faces[childIndex];
                let childFrom = -1;
                for (let c = 0; c < childFace.length; c += 1) {
                    const a = childFace[c];
                    const b = childFace[(c + 1) % childFace.length];
                    if ((a === from && b === to) || (a === to && b === from)) { childFrom = a; break; }
                }
                if (childFrom < 0) continue;
                if (childFrom === from) { childFace.reverse(); reoriented += 1; }
                visited[childIndex] = true;
                component.push(childIndex);
                queue.push(childIndex);
            }
        }
        components.push(component);
    }
    return { faces, reoriented, components };
}

/** Face-index pairs per undirected edge, used by the orientation walk. */
function buildEdgeIndex(faces: number[][]): Map<string, number[]> {
    const index = new Map<string, number[]>();
    faces.forEach((face, faceIndex) => {
        for (let corner = 0; corner < face.length; corner += 1) {
            const from = face[corner];
            const to = face[(corner + 1) % face.length];
            if (from === to) continue;
            const key = from < to ? `${from}:${to}` : `${to}:${from}`;
            const bucket = index.get(key);
            if (bucket) { if (!bucket.includes(faceIndex)) bucket.push(faceIndex); } else index.set(key, [faceIndex]);
        }
    });
    return index;
}

/**
 * Decide whether a component points outward and flip it if not.
 *
 * A closed shell is settled by its signed volume. An open one — a hat brim, a
 * helmet with the bottom missing — has no volume to speak of, so each face
 * votes on whether its normal points away from the component's centroid. That
 * is exact for convex shells and a sound majority for the mildly concave ones
 * this library targets.
 */
function flipOutward(mesh: FoldcraftMesh, component: number[], closed: boolean): boolean {
    if (closed) {
        const shell: FoldcraftMesh = { ...mesh, faces: component.map((index) => mesh.faces[index]) };
        return signedVolume6(shell) < 0;
    }
    let centroid: Vec3 = { x: 0, y: 0, z: 0 };
    component.forEach((faceIndex) => { centroid = add(centroid, faceCentroid(mesh, faceIndex)); });
    centroid = scale(centroid, 1 / Math.max(1, component.length));
    let outward = 0;
    let inward = 0;
    component.forEach((faceIndex) => {
        const away = normalize(sub(faceCentroid(mesh, faceIndex), centroid));
        if (dot(away, faceNormal(mesh, faceIndex)) >= 0) outward += 1; else inward += 1;
    });
    return inward > outward;
}

/** Offset every vertex along its area-weighted normal. */
function offsetOutward(mesh: FoldcraftMesh, distance: number): Vec3[] {
    const accumulated = mesh.vertices.map((): Vec3 => ({ x: 0, y: 0, z: 0 }));
    mesh.faces.forEach((face, faceIndex) => {
        const normal = scale(faceNormal(mesh, faceIndex), faceArea(mesh, faceIndex));
        face.forEach((vertexIndex) => {
            accumulated[vertexIndex] = add(accumulated[vertexIndex], normal);
        });
    });
    return mesh.vertices.map((point, index) => add(point, scale(normalize(accumulated[index]), distance)));
}

export function ingestMesh(source: FoldcraftMesh, options: IngestOptions = {}): IngestReport {
    const warnings: string[] = [];
    const sourceVertices = source.vertices.length;
    const box = boundingBox(source);
    const relative = options.weldToleranceRelative ?? DEFAULT_WELD_RELATIVE;
    const tolerance = box.diagonal * relative;

    const welded = weldVertices(source.vertices, tolerance);
    const remapped: FoldcraftMesh = {
        vertices: welded.vertices,
        faces: source.faces.map((face) => face.map((index) => welded.remap[index])),
        unitsPerMm: source.unitsPerMm,
    };

    const cleaned = cleanFaces(remapped);
    let mesh: FoldcraftMesh = { ...remapped, faces: cleaned.faces };
    if (mesh.faces.length === 0) {
        return {
            mesh,
            sourceVertices,
            weldedVertices: sourceVertices - welded.vertices.length,
            reorientedFaces: 0,
            degenerateFacesRemoved: cleaned.removed,
            boundaryEdges: 0,
            nonManifoldEdges: 0,
            isClosed: false,
            isConsistentlyOriented: false,
            warnings: ['Mesh has no usable faces after cleaning.'],
        };
    }

    let reorientedFaces = 0;
    if (options.forceOutward !== false) {
        const oriented = orientConsistently(mesh);
        mesh = { ...mesh, faces: oriented.faces };
        reorientedFaces = oriented.reoriented;

        const edgesAfter = buildEdgeMap(mesh);
        let componentBoundary = 0;
        edgesAfter.forEach((uses) => { if (uses.length === 1) componentBoundary += 1; });
        const closed = componentBoundary === 0;
        oriented.components.forEach((component) => {
            if (!flipOutward(mesh, component, closed)) return;
            component.forEach((faceIndex) => { mesh.faces[faceIndex] = [...mesh.faces[faceIndex]].reverse(); });
            reorientedFaces += component.length;
        });
        if (oriented.components.length > 1) {
            warnings.push(`Mesh has ${oriented.components.length} disconnected shells; each is oriented on its own.`);
        }

        // Debris filtering. Generated sculpts carry hundreds of tiny
        // disconnected shells; every one becomes at least one cut panel, so
        // they turn a hat into a thousand-piece jigsaw. Area, not face count,
        // decides: a finely-tessellated real part keeps its place, a chunky
        // fragment goes.
        const minimumFraction = options.dropShellsBelowAreaFraction ?? 0;
        if (minimumFraction > 0 && oriented.components.length > 1) {
            const areas = oriented.components.map((component) => (
                component.reduce((sum, faceIndex) => sum + faceArea(mesh, faceIndex), 0)
            ));
            const totalArea = areas.reduce((sum, area) => sum + area, 0);
            const keep = new Set<number>();
            oriented.components.forEach((component, index) => {
                if (areas[index] >= totalArea * minimumFraction) {
                    component.forEach((faceIndex) => keep.add(faceIndex));
                }
            });
            // Never drop everything: with no shell above the bar, keep the largest.
            if (keep.size === 0) {
                const biggest = areas.indexOf(Math.max(...areas));
                oriented.components[biggest].forEach((faceIndex) => keep.add(faceIndex));
            }
            if (keep.size < mesh.faces.length) {
                const droppedShells = oriented.components.filter((component) => !keep.has(component[0])).length;
                mesh = { ...mesh, faces: mesh.faces.filter((_, faceIndex) => keep.has(faceIndex)) };
                warnings.push(`Dropped ${droppedShells} debris shells below ${(minimumFraction * 100).toFixed(1)}% of the surface.`);
            }
        }
    }

    if (options.midSurfaceThicknessMm && options.midSurfaceThicknessMm > 0) {
        mesh = { ...mesh, vertices: offsetOutward(mesh, options.midSurfaceThicknessMm / 2 * mesh.unitsPerMm) };
    }

    const edges = buildEdgeMap(mesh);
    let boundaryEdges = 0;
    let nonManifoldEdges = 0;
    let disagreeing = 0;
    edges.forEach((uses) => {
        if (uses.length === 1) { boundaryEdges += 1; return; }
        if (uses.length > 2) { nonManifoldEdges += 1; return; }
        if (!usesAgree(uses[0], uses[1])) disagreeing += 1;
    });

    if (nonManifoldEdges > 0) {
        warnings.push(`${nonManifoldEdges} edges are shared by more than two faces; those folds cannot be resolved.`);
    }
    if (boundaryEdges > 0) {
        warnings.push(`${boundaryEdges} open boundary edges; the model is a shell rather than a closed solid.`);
    }

    return {
        mesh,
        sourceVertices,
        weldedVertices: sourceVertices - welded.vertices.length,
        reorientedFaces,
        degenerateFacesRemoved: cleaned.removed,
        boundaryEdges,
        nonManifoldEdges,
        isClosed: boundaryEdges === 0 && nonManifoldEdges === 0,
        isConsistentlyOriented: disagreeing === 0,
        warnings,
    };
}
