/**
 * 3D Stamp Tool - Relief Extrusion Builder
 * Creates watertight, outward-oriented 3D solid relief geometries from 2D pixel heightmaps.
 * Supports rectangular, circular, and oval dies with a true draft angle (tapered sidewalls).
 */

import * as THREE from 'three';
import { PodiumShape } from './stampTypes';

export interface ReliefExtrusionParams {
    heightmapData: Uint8ClampedArray;
    gridWidth: number;   // Canvas pixel width (e.g. 128 or 512)
    gridHeight: number;  // Canvas pixel height (e.g. 128 or 512)
    physicalWidthMm: number;
    physicalDepthMm: number;
    reliefDepthMm: number;
    basePlateThicknessMm: number;
    shape: PodiumShape;
    draftAngleDeg: number;
    useContinuousGrayscale?: boolean;
}

/** Coarsest the extrusion grid is ever allowed to be. */
const TARGET_CELL_MM = 0.25;
/** Finest, so a tiny die cannot explode the triangle count. */
const MIN_CELL_MM = 0.07;
/** Cells the tapered wall should span; below ~2 the wall renders as a staircase. */
const WALL_CELLS = 2.5;
/**
 * Triangle ceiling for the displaced die face.
 *
 * Bounds both the export (~8MB of binary STL) and the interactive rebuild, which reruns on
 * every slider tick. Large dies hit this before they hit the wall-span target, so they get
 * a slightly coarser cell rather than an unusable model.
 */
const MAX_DIE_FACE_TRIANGLES = 170000;
const MIN_GRID = 80;
const MAX_GRID = 900;
/** Polar dies: radial x angular cells, kept within the same budget as the cartesian grid. */
const MAX_POLAR_CELLS = MAX_DIE_FACE_TRIANGLES / 4;

/** Vertex colors used by the `rubber-wood` theme to distinguish contact face / wall / floor. */
const COLOR_CONTACT: readonly [number, number, number] = [0.08, 0.08, 0.10];
const COLOR_WALL: readonly [number, number, number] = [0.65, 0.22, 0.05];
const COLOR_FLOOR: readonly [number, number, number] = [0.78, 0.28, 0.06];

interface HeightField {
    /** Relief height in 0..1 (0 = baseplate floor, 1 = full contact plateau). */
    values: Float32Array;
    cols: number;
    rows: number;
}

/**
 * Resamples the source heightmap onto a cols x rows grid.
 * Uses area averaging when the source is finer than the target (prevents the aliasing that
 * made fine text edges look ragged) and bilinear interpolation when it is coarser.
 */
function resampleMask(
    heightmapData: Uint8ClampedArray,
    gridWidth: number,
    gridHeight: number,
    cols: number,
    rows: number
): Float32Array {
    const out = new Float32Array(cols * rows);
    const read = (x: number, y: number): number =>
        (heightmapData[(y * gridWidth + x) * 4] ?? 0) / 255;

    const scaleX = gridWidth / cols;
    const scaleY = gridHeight / rows;
    const needsAreaAverage = scaleX > 1.2 || scaleY > 1.2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let value: number;

            if (needsAreaAverage) {
                // Average the source footprint that maps onto this grid cell.
                const x0 = Math.max(0, Math.floor(c * scaleX));
                const x1 = Math.min(gridWidth - 1, Math.max(x0, Math.ceil((c + 1) * scaleX) - 1));
                const y0 = Math.max(0, Math.floor(r * scaleY));
                const y1 = Math.min(gridHeight - 1, Math.max(y0, Math.ceil((r + 1) * scaleY) - 1));

                let sum = 0;
                let count = 0;
                for (let y = y0; y <= y1; y++) {
                    for (let x = x0; x <= x1; x++) {
                        sum += read(x, y);
                        count++;
                    }
                }
                value = count > 0 ? sum / count : 0;
            } else {
                const fx = cols > 1 ? (c / (cols - 1)) * (gridWidth - 1) : 0;
                const fy = rows > 1 ? (r / (rows - 1)) * (gridHeight - 1) : 0;
                const x0 = Math.floor(fx);
                const y0 = Math.floor(fy);
                const x1 = Math.min(gridWidth - 1, x0 + 1);
                const y1 = Math.min(gridHeight - 1, y0 + 1);
                const dx = fx - x0;
                const dy = fy - y0;

                const top = read(x0, y0) * (1 - dx) + read(x1, y0) * dx;
                const bottom = read(x0, y1) * (1 - dx) + read(x1, y1) * dx;
                value = top * (1 - dy) + bottom * dy;
            }

            out[r * cols + c] = value;
        }
    }

    return out;
}

import { signedDistanceFieldPx, sampleField } from './stampDistanceTransform';

/**
 * Builds the 0..1 relief height field.
 *
 * For binary relief the sidewalls follow the requested draft angle exactly: a point whose
 * signed distance to the artwork edge is `s` mm (negative outside) stays solid down to
 * `h = 1 + s / (reliefDepth * tan(draft))`, which is precisely the surface swept by a wall
 * leaning back at `draft` degrees from the contact plateau.
 *
 * The distance is measured on the artwork raster and only then sampled onto the extrusion
 * grid. Sampling a smooth distance field is what keeps letterforms clean: the height at a
 * grid point carries the true sub-pixel edge position, so the rendered outline follows the
 * glyph rather than the grid.
 */
function buildHeightField(params: ReliefExtrusionParams, cols: number, rows: number): HeightField {
    const {
        heightmapData,
        gridWidth,
        gridHeight,
        physicalWidthMm,
        physicalDepthMm,
        reliefDepthMm,
        draftAngleDeg,
        useContinuousGrayscale = false,
    } = params;

    if (useContinuousGrayscale) {
        // A photographic relief has no edges to trace; every grey level is a height.
        return { values: resampleMask(heightmapData, gridWidth, gridHeight, cols, rows), cols, rows };
    }

    const sourceMask = new Float32Array(gridWidth * gridHeight);
    for (let i = 0; i < sourceMask.length; i++) {
        sourceMask[i] = (heightmapData[i * 4] ?? 0) / 255;
    }

    const sdfPx = signedDistanceFieldPx(sourceMask, gridWidth, gridHeight);
    const mmPerPixelX = physicalWidthMm / Math.max(1, gridWidth - 1);
    const mmPerPixelY = physicalDepthMm / Math.max(1, gridHeight - 1);
    const mmPerPixel = (mmPerPixelX + mmPerPixelY) / 2;

    const cellW = physicalWidthMm / Math.max(1, cols - 1);
    const cellD = physicalDepthMm / Math.max(1, rows - 1);
    const cellMm = (cellW + cellD) / 2;

    const draft = Math.max(0, Math.min(45, draftAngleDeg || 0));
    // Horizontal run of the tapered wall over the full relief depth.
    const draftRunMm = reliefDepthMm * Math.tan((draft * Math.PI) / 180);
    // Even at 0 degrees keep a ramp about a cell wide, so the wall is resolved by more than
    // a single row of vertices and its edge stays smooth rather than stepped.
    const runMm = Math.max(draftRunMm, cellMm * 1.1);

    const values = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
        const fy = rows > 1 ? (r / (rows - 1)) * (gridHeight - 1) : 0;
        for (let c = 0; c < cols; c++) {
            const fx = cols > 1 ? (c / (cols - 1)) * (gridWidth - 1) : 0;
            const distMm = sampleField(sdfPx, gridWidth, gridHeight, fx, fy) * mmPerPixel;
            values[r * cols + c] = Math.max(0, Math.min(1, 1 + distMm / runMm));
        }
    }

    return { values, cols, rows };
}

/**
 * Extrusion grid density, in millimetres per cell.
 *
 * Fine enough that the tapered wall spans several cells: a wall resolved by one row of
 * vertices renders as a staircase however accurate the underlying distance field is, because
 * there is nothing between "floor" and "plateau" for the surface to interpolate through.
 * Bounded by a triangle budget so a large stamp still slices comfortably.
 */
function resolveCellSizeMm(
    physicalWidthMm: number,
    physicalDepthMm: number,
    reliefDepthMm: number,
    draftAngleDeg: number,
): number {
    const draft = Math.max(0, Math.min(45, draftAngleDeg || 0));
    const draftRunMm = reliefDepthMm * Math.tan((draft * Math.PI) / 180);

    const wanted = draftRunMm > 0
        ? Math.min(TARGET_CELL_MM, draftRunMm / WALL_CELLS)
        : TARGET_CELL_MM;

    // Two triangles per cell across the die face; keep that under the budget.
    const area = Math.max(1, physicalWidthMm * physicalDepthMm);
    const budgetCell = Math.sqrt((2 * area) / MAX_DIE_FACE_TRIANGLES);

    return Math.max(MIN_CELL_MM, Math.max(wanted, budgetCell));
}

/**
 * Vertex color for a given relief height.
 *
 * Interpolated rather than bucketed into three flat tones. Hard colour classes quantised the
 * letter edges to the grid in the preview - the geometry could be perfectly smooth and the
 * artwork would still read as blocky, because the colour boundary jumped a whole cell.
 */
function pushColor(colors: number[], h: number) {
    const t = Math.max(0, Math.min(1, h));
    // Floor -> wall over the lower part of the ramp, wall -> inked contact face over the top.
    const [from, to, mix] = t < 0.5
        ? [COLOR_FLOOR, COLOR_WALL, t / 0.5]
        : [COLOR_WALL, COLOR_CONTACT, (t - 0.5) / 0.5];
    const eased = mix * mix * (3 - 2 * mix);
    colors.push(
        from[0] + (to[0] - from[0]) * eased,
        from[1] + (to[1] - from[1]) * eased,
        from[2] + (to[2] - from[2]) * eased,
    );
}

/**
 * Emits the two triangles of a quad whose corners are listed counter-clockwise
 * as seen from outside the solid.
 */
function addQuad(indices: number[], a: number, b: number, c: number, d: number) {
    indices.push(a, b, c);
    indices.push(a, c, d);
}

/**
 * Connects a die-face boundary loop to the matching backplate loop with outward-facing walls.
 * Both loops must list the same perimeter positions in the same order, ordered so that a step
 * (dx, dz) has outward normal (dz, 0, -dx).
 */
function addPerimeterWalls(indices: number[], dieLoop: number[], backLoop: number[]) {
    for (let k = 0; k < dieLoop.length; k++) {
        const next = (k + 1) % dieLoop.length;
        addQuad(indices, dieLoop[k], backLoop[k], backLoop[next], dieLoop[next]);
    }
}

/**
 * Adds the flat backplate at y = 0 as a centre fan over the given perimeter positions.
 *
 * The backplate is a plane, so a fan describes it exactly; tessellating it at the same density
 * as the displaced die face would double the die's triangle count for no added detail.
 * Returns the perimeter vertex indices, in the same order as the supplied positions.
 */
function addBackplateFan(
    positions: number[],
    uvs: number[],
    colors: number[],
    indices: number[],
    perimeter: { x: number; z: number }[],
    halfW: number,
    halfD: number
): number[] {
    const pushBackVertex = (x: number, z: number) => {
        const idx = positions.length / 3;
        positions.push(x, 0, z);
        uvs.push((x + halfW) / (halfW * 2), (z + halfD) / (halfD * 2));
        colors.push(COLOR_FLOOR[0], COLOR_FLOOR[1], COLOR_FLOOR[2]);
        return idx;
    };

    const centre = pushBackVertex(0, 0);
    const ring = perimeter.map((p) => pushBackVertex(p.x, p.z));

    // The perimeter runs counter-clockwise in the XZ plane, so (centre, next, current)
    // is the winding that faces +Y.
    for (let k = 0; k < ring.length; k++) {
        const next = (k + 1) % ring.length;
        indices.push(centre, ring[next], ring[k]);
    }

    return ring;
}

/**
 * Cartesian (rectangular) die plate: displaced bottom face, flat backplate at y = 0,
 * and four perimeter walls.
 */
function buildRectangularDie(
    field: HeightField,
    physicalWidthMm: number,
    physicalDepthMm: number,
    reliefDepthMm: number,
    basePlateThicknessMm: number
): THREE.BufferGeometry {
    const { values, cols, rows } = field;
    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const halfW = physicalWidthMm / 2;
    const halfD = physicalDepthMm / 2;

    // 1. Die face (points down, outward normal -Y)
    for (let r = 0; r < rows; r++) {
        const v = r / (rows - 1);
        const z = -halfD + v * physicalDepthMm;
        for (let c = 0; c < cols; c++) {
            const u = c / (cols - 1);
            const x = -halfW + u * physicalWidthMm;
            const h = values[r * cols + c];
            positions.push(x, -(basePlateThicknessMm + h * reliefDepthMm), z);
            uvs.push(u, 1 - v);
            pushColor(colors, h);
        }
    }

    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const i0 = r * cols + c;
            const i1 = i0 + 1;
            const i2 = i0 + cols;
            const i3 = i2 + 1;
            // CCW seen from below (-Y)
            indices.push(i0, i1, i2);
            indices.push(i1, i3, i2);
        }
    }

    // 2. Perimeter loop, ordered so each step's outward normal is (dz, 0, -dx):
    //    +X edge going +Z, +Z edge going -X, -X edge going -Z, -Z edge going +X.
    const dieLoop: number[] = [];
    for (let r = 0; r < rows - 1; r++) dieLoop.push(r * cols + (cols - 1));
    for (let c = cols - 1; c > 0; c--) dieLoop.push((rows - 1) * cols + c);
    for (let r = rows - 1; r > 0; r--) dieLoop.push(r * cols);
    for (let c = 0; c < cols - 1; c++) dieLoop.push(c);

    // 3. Flat backplate at y = 0, then the walls joining the two loops
    const perimeter = dieLoop.map((i) => ({
        x: positions[i * 3],
        z: positions[i * 3 + 2],
    }));
    const backLoop = addBackplateFan(positions, uvs, colors, indices, perimeter, halfW, halfD);
    addPerimeterWalls(indices, dieLoop, backLoop);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Polar (circular / oval) die plate. Building the plate on a radial grid gives the die a true
 * elliptical outline instead of a rectangular slab poking out from under a round podium.
 */
function buildPolarDie(
    field: HeightField,
    physicalWidthMm: number,
    physicalDepthMm: number,
    reliefDepthMm: number,
    basePlateThicknessMm: number,
    shape: PodiumShape,
    cellMm: number
): THREE.BufferGeometry {
    const { values, cols, rows } = field;
    const halfW = physicalWidthMm / 2;
    const halfD = physicalDepthMm / 2;
    const circleRad = Math.min(halfW, halfD);
    const radX = shape === 'circular' ? circleRad : halfW;
    const radZ = shape === 'circular' ? circleRad : halfD;

    const maxRad = Math.max(radX, radZ);
    // Same target cell size as the cartesian grid, so a round die is no coarser than a
    // rectangular one of the same size and draft.
    let ringCount = Math.max(24, Math.round(maxRad / cellMm));
    let sectorCount = Math.max(96, Math.round((2 * Math.PI * maxRad) / cellMm));
    // Keep the triangle budget in the same range as the cartesian path.
    const budgetScale = Math.sqrt(MAX_POLAR_CELLS / (ringCount * sectorCount));
    if (budgetScale < 1) {
        ringCount = Math.max(24, Math.floor(ringCount * budgetScale));
        sectorCount = Math.max(96, Math.floor(sectorCount * budgetScale));
    }

    // Bilinear lookup of the relief height at an arbitrary (x, z) in millimetres.
    const heightAt = (x: number, z: number): number => {
        const u = (x + halfW) / physicalWidthMm;
        const v = (z + halfD) / physicalDepthMm;
        const fx = Math.max(0, Math.min(cols - 1, u * (cols - 1)));
        const fy = Math.max(0, Math.min(rows - 1, v * (rows - 1)));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(cols - 1, x0 + 1);
        const y1 = Math.min(rows - 1, y0 + 1);
        const dx = fx - x0;
        const dy = fy - y0;
        const top = values[y0 * cols + x0] * (1 - dx) + values[y0 * cols + x1] * dx;
        const bottom = values[y1 * cols + x0] * (1 - dx) + values[y1 * cols + x1] * dx;
        return top * (1 - dy) + bottom * dy;
    };

    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const rimPoint = (j: number) => {
        const angle = (j / sectorCount) * Math.PI * 2;
        return { x: radX * Math.cos(angle), z: radZ * Math.sin(angle) };
    };

    // 1. Displaced die face: centre vertex, then `ringCount` rings of `sectorCount` vertices.
    const centreH = heightAt(0, 0);
    positions.push(0, -(basePlateThicknessMm + centreH * reliefDepthMm), 0);
    uvs.push(0.5, 0.5);
    pushColor(colors, centreH);

    for (let i = 1; i <= ringCount; i++) {
        const t = i / ringCount;
        for (let j = 0; j < sectorCount; j++) {
            const angle = (j / sectorCount) * Math.PI * 2;
            const x = radX * t * Math.cos(angle);
            const z = radZ * t * Math.sin(angle);
            const h = heightAt(x, z);
            positions.push(x, -(basePlateThicknessMm + h * reliefDepthMm), z);
            uvs.push((x + halfW) / physicalWidthMm, 1 - (z + halfD) / physicalDepthMm);
            pushColor(colors, h);
        }
    }

    const ringStart = (ring: number) => 1 + (ring - 1) * sectorCount;

    // Centre fan, wound CCW seen from below (-Y)
    for (let j = 0; j < sectorCount; j++) {
        indices.push(0, ringStart(1) + j, ringStart(1) + ((j + 1) % sectorCount));
    }
    // Ring bands
    for (let i = 1; i < ringCount; i++) {
        const inner = ringStart(i);
        const outer = ringStart(i + 1);
        for (let j = 0; j < sectorCount; j++) {
            const nj = (j + 1) % sectorCount;
            indices.push(inner + j, outer + j, outer + nj);
            indices.push(inner + j, outer + nj, inner + nj);
        }
    }

    // 2. Flat backplate fan, then the rim wall joining the two outer loops.
    // Angle increases around the rim, so a step (dx, dz) has outward normal (dz, 0, -dx).
    const dieLoop: number[] = [];
    for (let j = 0; j < sectorCount; j++) {
        dieLoop.push(ringStart(ringCount) + j);
    }
    const perimeter = Array.from({ length: sectorCount }, (_, j) => rimPoint(j));
    const backLoop = addBackplateFan(positions, uvs, colors, indices, perimeter, halfW, halfD);
    addPerimeterWalls(indices, dieLoop, backLoop);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Builds a watertight solid die from heightmap data.
 * The backplate sits at y = 0 (mounting face against the podium) and the solid extends
 * downwards: the baseplate to y = -basePlateThicknessMm, relief features further down to
 * y = -(basePlateThicknessMm + reliefDepthMm * height).
 */
export function createStampReliefGeometry(params: ReliefExtrusionParams): THREE.BufferGeometry {
    const {
        physicalWidthMm,
        physicalDepthMm,
        reliefDepthMm,
        basePlateThicknessMm,
        shape,
    } = params;

    const cellMm = resolveCellSizeMm(physicalWidthMm, physicalDepthMm, reliefDepthMm, params.draftAngleDeg);
    const cols = Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(physicalWidthMm / cellMm)));
    const rows = Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(physicalDepthMm / cellMm)));

    const field = buildHeightField(params, cols, rows);

    if (shape === 'circular' || shape === 'oval') {
        return buildPolarDie(
            field,
            physicalWidthMm,
            physicalDepthMm,
            reliefDepthMm,
            basePlateThicknessMm,
            shape,
            cellMm,
        );
    }

    return buildRectangularDie(field, physicalWidthMm, physicalDepthMm, reliefDepthMm, basePlateThicknessMm);
}
