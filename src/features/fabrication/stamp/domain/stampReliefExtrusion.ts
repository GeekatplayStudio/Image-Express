/**
 * 3D Stamp Tool - Relief Extrusion Builder
 * Creates 100% watertight, manifold 3D solid relief geometries from 2D pixel heightmaps.
 * Supports rectangular, circular, and oval dies with draft angle (tapered sidewalls).
 */

import * as THREE from 'three';
import { PodiumShape } from './stampTypes';

export interface ReliefExtrusionParams {
    heightmapData: Uint8ClampedArray;
    gridWidth: number;   // Canvas pixel width (e.g. 128 or 256)
    gridHeight: number;  // Canvas pixel height (e.g. 128 or 256)
    physicalWidthMm: number;
    physicalDepthMm: number;
    reliefDepthMm: number;
    basePlateThicknessMm: number;
    shape: PodiumShape;
    draftAngleDeg: number;
}

/**
 * Builds a watertight solid mesh from heightmap data.
 * The top plate starts at y = 0 (mounting to the bottom of the podium)
 * and extrudes downwards into negative Y:
 * - Baseplate extends to y = -basePlateThicknessMm
 * - Relief features extend further down to y = -(basePlateThicknessMm + reliefDepthMm * height)
 */
export function createStampReliefGeometry(params: ReliefExtrusionParams): THREE.BufferGeometry {
    const {
        heightmapData,
        gridWidth,
        gridHeight,
        physicalWidthMm,
        physicalDepthMm,
        reliefDepthMm,
        basePlateThicknessMm,
        shape,
        draftAngleDeg,
    } = params;

    // Subsampling grid for smooth 3D geometry
    // A 120x120 grid provides 14,400 vertices (~28,000 tris) - crisp resolution and fast slicing!
    const cols = Math.min(128, gridWidth);
    const rows = Math.min(128, gridHeight);

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const halfW = physicalWidthMm / 2;
    const halfD = physicalDepthMm / 2;
    const radX = halfW;
    const radZ = halfD;

    // Helper to sample height value normalized [0, 1]
    const sampleHeight = (colIdx: number, rowIdx: number): number => {
        const u = colIdx / (cols - 1);
        const v = rowIdx / (rows - 1);

        const px = Math.min(gridWidth - 1, Math.max(0, Math.floor(u * (gridWidth - 1))));
        const py = Math.min(gridHeight - 1, Math.max(0, Math.floor(v * (gridHeight - 1))));
        const idx = (py * gridWidth + px) * 4;

        // Grayscale value (R channel)
        return heightmapData[idx] / 255.0;
    };

    // Calculate draft angle taper factor
    const draftRad = (draftAngleDeg * Math.PI) / 180;
    const maxTaper = Math.tan(draftRad) * reliefDepthMm;

    // 1. Generate Die Face (displaced surface)
    // Vertices stored in row-major order: index = r * cols + c
    const faceVertexCount = rows * cols;

    for (let r = 0; r < rows; r++) {
        const v = r / (rows - 1);
        const z0 = -halfD + v * physicalDepthMm;

        for (let c = 0; c < cols; c++) {
            const u = c / (cols - 1);
            const x0 = -halfW + u * physicalWidthMm;

            let h = sampleHeight(c, r);

            // Circular / Oval mask: fade outside radius
            if (shape === 'circular' || shape === 'oval') {
                const normX = x0 / radX;
                const normZ = z0 / radZ;
                const distSq = normX * normX + normZ * normZ;
                if (distSq > 1.0) {
                    h = 0;
                } else if (distSq > 0.9) {
                    const fade = (1.0 - Math.sqrt(distSq)) / (1.0 - Math.sqrt(0.9));
                    h *= Math.max(0, Math.min(1, fade));
                }
            }

            // Draft angle: slight inward taper on top relief edges
            const taper = maxTaper * (1.0 - h);
            const x = x0 * (1 - taper / (physicalWidthMm + 0.001));
            const z = z0 * (1 - taper / (physicalDepthMm + 0.001));
            const y = -(basePlateThicknessMm + h * reliefDepthMm);

            positions.push(x, y, z);
            uvs.push(u, 1.0 - v);
        }
    }

    // Indices for die face grid (two triangles per cell)
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const i0 = r * cols + c;
            const i1 = r * cols + (c + 1);
            const i2 = (r + 1) * cols + c;
            const i3 = (r + 1) * cols + (c + 1);

            // Facing downward (-Y)
            indices.push(i0, i2, i1);
            indices.push(i1, i2, i3);
        }
    }

    // 2. Generate Flat Top Backplate at y = 0
    // Exactly matches perimeter so it seals seamlessly against the podium
    const backStartIndex = positions.length / 3;

    for (let r = 0; r < rows; r++) {
        const v = r / (rows - 1);
        const z = -halfD + v * physicalDepthMm;

        for (let c = 0; c < cols; c++) {
            const u = c / (cols - 1);
            const x = -halfW + u * physicalWidthMm;

            positions.push(x, 0, z);
            uvs.push(u, v);
        }
    }

    // Indices for flat backplate facing upward (+Y towards podium)
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const i0 = backStartIndex + r * cols + c;
            const i1 = backStartIndex + r * cols + (c + 1);
            const i2 = backStartIndex + (r + 1) * cols + c;
            const i3 = backStartIndex + (r + 1) * cols + (c + 1);

            // Facing upward (+Y)
            indices.push(i0, i1, i2);
            indices.push(i1, i3, i2);
        }
    }

    // 3. Generate 4 Perimeter Sidewalls connecting Die Face to Backplate
    // Top wall (r = 0, z = -halfD)
    for (let c = 0; c < cols - 1; c++) {
        const f0 = c;
        const f1 = c + 1;
        const b0 = backStartIndex + c;
        const b1 = backStartIndex + c + 1;

        indices.push(f0, f1, b0);
        indices.push(f1, b1, b0);
    }

    // Bottom wall (r = rows - 1, z = +halfD)
    const rowOffset = (rows - 1) * cols;
    for (let c = 0; c < cols - 1; c++) {
        const f0 = rowOffset + c;
        const f1 = rowOffset + c + 1;
        const b0 = backStartIndex + rowOffset + c;
        const b1 = backStartIndex + rowOffset + c + 1;

        indices.push(f0, b0, f1);
        indices.push(f1, b0, b1);
    }

    // Left wall (c = 0, x = -halfW)
    for (let r = 0; r < rows - 1; r++) {
        const f0 = r * cols;
        const f1 = (r + 1) * cols;
        const b0 = backStartIndex + r * cols;
        const b1 = backStartIndex + (r + 1) * cols;

        indices.push(f0, b0, f1);
        indices.push(f1, b0, b1);
    }

    // Right wall (c = cols - 1, x = +halfW)
    for (let r = 0; r < rows - 1; r++) {
        const f0 = r * cols + (cols - 1);
        const f1 = (r + 1) * cols + (cols - 1);
        const b0 = backStartIndex + r * cols + (cols - 1);
        const b1 = backStartIndex + (r + 1) * cols + (cols - 1);

        indices.push(f0, f1, b0);
        indices.push(f1, b1, b0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}
