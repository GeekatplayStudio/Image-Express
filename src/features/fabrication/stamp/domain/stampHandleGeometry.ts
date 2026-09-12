/**
 * 3D Stamp Tool - Handle Geometries
 * Authentic turned and parametric handles for rubber desk stamps and wax seals.
 */

import * as THREE from 'three';
import { HandleStyle } from './stampTypes';

/**
 * Generates a smooth turned lathe profile for a classic wooden desk stamp handle.
 * Authentic proportions: rounded palm rest top, slender concave waist, ergonomic grip swell,
 * and flared foot collar for secure attachment to the podium backing.
 */
function createClassicWoodPoints(height: number, baseRadius: number): THREE.Vector2[] {
    const points: THREE.Vector2[] = [];
    const segments = 40;

    // Radius scaling factors along the height (t from 0 to 1)
    for (let i = 0; i <= segments; i++) {
        const t = i / segments; // 0 at base, 1 at top crown
        const y = t * height;
        let r: number;

        if (t < 0.1) {
            // Flared base collar seating onto podium
            const sub = t / 0.1;
            r = baseRadius * (1.0 - 0.35 * sub);
        } else if (t < 0.25) {
            // Lower neck taper
            const sub = (t - 0.1) / 0.15;
            r = baseRadius * (0.65 - 0.25 * sub);
        } else if (t < 0.45) {
            // Slender waist
            const sub = (t - 0.25) / 0.2;
            r = baseRadius * (0.4 + 0.15 * Math.sin(sub * Math.PI));
        } else if (t < 0.85) {
            // Ergonomic palm grip bulb
            const sub = (t - 0.45) / 0.4;
            r = baseRadius * (0.45 + 0.5 * Math.sin(sub * Math.PI * 0.85));
        } else {
            // Rounded dome crown (closing to 0 at the top)
            const sub = (t - 0.85) / 0.15;
            const angle = sub * (Math.PI / 2);
            r = baseRadius * 0.75 * Math.cos(angle);
        }

        if (i === segments) {
            points.push(new THREE.Vector2(0, y));
        } else {
            points.push(new THREE.Vector2(Math.max(0.1, r), y));
        }
    }

    return points;
}

/**
 * Generates an ornate turned lathe profile for a vintage wax seal stamp handle.
 * Features decorative baluster swell, brass collar ferrule, neck grooves, and spherical finial pommel.
 */
function createWaxSealTurnedPoints(height: number, baseRadius: number): THREE.Vector2[] {
    const points: THREE.Vector2[] = [];
    const segments = 48;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = t * height;
        let r: number;

        if (t < 0.08) {
            // Brass ferrule base
            r = baseRadius * 0.9;
        } else if (t < 0.14) {
            // Ferrule stepped ring
            const sub = (t - 0.08) / 0.06;
            r = baseRadius * (0.9 + 0.15 * Math.sin(sub * Math.PI));
        } else if (t < 0.28) {
            // Narrow neck
            const sub = (t - 0.14) / 0.14;
            r = baseRadius * (0.8 - 0.45 * sub);
        } else if (t < 0.72) {
            // Elegant tapered baluster swell
            const sub = (t - 0.28) / 0.44;
            r = baseRadius * (0.35 + 0.65 * Math.sin(sub * Math.PI * 0.9));
        } else if (t < 0.84) {
            // Upper neck collar ring
            const sub = (t - 0.72) / 0.12;
            r = baseRadius * (0.45 + 0.12 * Math.sin(sub * Math.PI));
        } else {
            // Top finial pommel sphere
            const sub = (t - 0.84) / 0.16;
            const angle = sub * (Math.PI / 2);
            r = baseRadius * 0.55 * Math.cos(angle);
        }

        if (i === segments) {
            points.push(new THREE.Vector2(0, y));
        } else {
            points.push(new THREE.Vector2(Math.max(0.1, r), y));
        }
    }

    return points;
}

/**
 * Generates a modern ergonomic desk knob handle profile.
 */
function createDeskKnobPoints(height: number, baseRadius: number): THREE.Vector2[] {
    const points: THREE.Vector2[] = [];
    const segments = 32;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = t * height;
        let r: number;

        if (t < 0.2) {
            // Flared mount foot
            const sub = t / 0.2;
            r = baseRadius * (0.85 - 0.45 * sub);
        } else if (t < 0.4) {
            // Finger undercut groove
            r = baseRadius * 0.4;
        } else {
            // Full spherical knob crown
            const sub = (t - 0.4) / 0.6;
            const angle = (sub - 0.5) * Math.PI;
            r = baseRadius * (0.9 * Math.cos(angle));
        }

        if (i === segments) {
            points.push(new THREE.Vector2(0, y));
        } else {
            points.push(new THREE.Vector2(Math.max(0.1, r), y));
        }
    }

    return points;
}

/**
 * Generates a low-profile finger pinch grip profile.
 * Designed to conserve 3D printing filament (~85% savings) while providing
 * an ergonomic concave pinch indentation for thumb and index finger.
 */
function createFingerGripPoints(height: number, baseRadius: number): THREE.Vector2[] {
    const points: THREE.Vector2[] = [];
    const segments = 24;
    // Cap height at 12mm max for material conservation
    const effHeight = Math.min(height, 12);

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = t * effHeight;
        let r: number;

        if (t < 0.25) {
            // Broad sturdy base mounting collar
            const sub = t / 0.25;
            r = baseRadius * (0.85 - 0.45 * sub);
        } else if (t < 0.7) {
            // Deep concave finger pinch groove
            const sub = (t - 0.25) / 0.45;
            r = baseRadius * (0.4 - 0.15 * Math.sin(sub * Math.PI));
        } else if (t < 0.9) {
            // Flared top rim for finger grip purchase
            const sub = (t - 0.7) / 0.2;
            r = baseRadius * (0.4 + 0.35 * sub);
        } else {
            // Smooth rounded top closure
            const sub = (t - 0.9) / 0.1;
            const angle = sub * (Math.PI / 2);
            r = baseRadius * 0.75 * Math.cos(angle);
        }

        if (i === segments) {
            points.push(new THREE.Vector2(0, y));
        } else {
            points.push(new THREE.Vector2(Math.max(0.1, r), y));
        }
    }

    return points;
}

/**
 * Generates a ribbed material-saver peg handle with non-slip tactile ridges.
 */
function createRibbedPegPoints(height: number, baseRadius: number): THREE.Vector2[] {
    const points: THREE.Vector2[] = [];
    const segments = 40;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = t * height;
        let r: number;

        if (t < 0.1) {
            // Tapered base foot
            r = baseRadius * (0.8 - 0.25 * (t / 0.1));
        } else if (t < 0.88) {
            // Fluted ergonomic body with tactile circular wave ridges
            const waves = Math.sin(t * Math.PI * 12);
            r = baseRadius * (0.5 + 0.08 * waves);
        } else {
            // Rounded dome top
            const sub = (t - 0.88) / 0.12;
            const angle = sub * (Math.PI / 2);
            r = baseRadius * 0.5 * Math.cos(angle);
        }

        if (i === segments) {
            points.push(new THREE.Vector2(0, y));
        } else {
            points.push(new THREE.Vector2(Math.max(0.1, r), y));
        }
    }

    return points;
}

/**
 * Merges two BufferGeometries into one.
 */
function mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    for (const g of geoms) {
        const p = g.getAttribute('position');
        const n = g.getAttribute('normal');
        const idx = g.getIndex();
        if (!p) continue;

        for (let i = 0; i < p.count; i++) {
            positions.push(p.getX(i), p.getY(i), p.getZ(i));
            if (n) {
                normals.push(n.getX(i), n.getY(i), n.getZ(i));
            } else {
                normals.push(0, 1, 0);
            }
        }

        if (idx) {
            for (let i = 0; i < idx.count; i++) {
                indices.push(idx.getX(i) + vertexOffset);
            }
        } else {
            for (let i = 0; i < p.count; i++) {
                indices.push(i + vertexOffset);
            }
        }
        vertexOffset += p.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setIndex(indices);
    return merged;
}

/**
 * Creates a T-Bar Rocker handle geometry.
 */
function createTBarGeometry(height: number, baseRadius: number): THREE.BufferGeometry {
    const stemRadius = baseRadius * 0.35;
    const stemHeight = Math.max(10, height - baseRadius * 0.7);
    const stem = new THREE.CylinderGeometry(stemRadius * 0.85, stemRadius * 1.1, stemHeight, 24);
    stem.translate(0, stemHeight / 2, 0);

    const crossbarRadius = baseRadius * 0.45;
    const crossbarLength = Math.max(30, baseRadius * 3.4);
    const crossbar = new THREE.CylinderGeometry(crossbarRadius, crossbarRadius, crossbarLength, 24);
    crossbar.rotateZ(Math.PI / 2);
    crossbar.translate(0, stemHeight + crossbarRadius * 0.8, 0);

    const merged = mergeGeometries([stem, crossbar]);
    merged.computeVertexNormals();
    return merged;
}

/**
 * Creates a watertight, 2-manifold closed solid surface of revolution from profile points.
 * - Flat circular bottom cap at y = 0 sealing against the podium
 * - Seamless circumferential revolution (no open slice seams)
 * - True watertight apex cone (when ending at r=0) or flat disc cap (when r>0)
 *
 * Every face is wound counter-clockwise as seen from outside, so the solid has outward
 * normals and a positive signed volume (slicers reject inside-out shells).
 */
function createTurnedSolidGeometry(profilePoints: THREE.Vector2[], radialSegments: number = 32): THREE.BufferGeometry {
    const M = profilePoints.length;
    const S = radialSegments;
    const positions: number[] = [];
    const indices: number[] = [];

    const isApexTop = profilePoints[M - 1].x < 0.05;

    // 1. Bottom center vertex at index 0 (y = 0)
    const bottomY = profilePoints[0].y;
    positions.push(0, bottomY, 0);

    if (isApexTop) {
        // Rings from i = 0 to M - 2 (all with r > 0)
        const ringCount = M - 1;
        for (let i = 0; i < ringCount; i++) {
            const r = profilePoints[i].x;
            const y = profilePoints[i].y;
            for (let j = 0; j < S; j++) {
                const angle = (j / S) * Math.PI * 2;
                positions.push(r * Math.cos(angle), y, r * Math.sin(angle));
            }
        }

        // Apex vertex at the very top (index: 1 + ringCount * S)
        const apexIdx = positions.length / 3;
        const topY = profilePoints[M - 1].y;
        positions.push(0, topY, 0);

        // Bottom cap triangles (facing -Y)
        for (let j = 0; j < S; j++) {
            const nextJ = (j + 1) % S;
            indices.push(0, 1 + j, 1 + nextJ);
        }

        // Sidewall quads between ring i and ring i + 1 (facing radially outwards)
        for (let i = 0; i < ringCount - 1; i++) {
            const row0 = 1 + i * S;
            const row1 = 1 + (i + 1) * S;
            for (let j = 0; j < S; j++) {
                const nextJ = (j + 1) % S;
                const a = row0 + j;
                const b = row0 + nextJ;
                const c = row1 + nextJ;
                const d = row1 + j;
                indices.push(a, c, b);
                indices.push(a, d, c);
            }
        }

        // Top apex cone triangles connecting last ring (ringCount - 1) to apexIdx
        const lastRingRow = 1 + (ringCount - 1) * S;
        for (let j = 0; j < S; j++) {
            const nextJ = (j + 1) % S;
            indices.push(lastRingRow + j, apexIdx, lastRingRow + nextJ);
        }
    } else {
        // Flat top solid
        for (let i = 0; i < M; i++) {
            const r = profilePoints[i].x;
            const y = profilePoints[i].y;
            for (let j = 0; j < S; j++) {
                const angle = (j / S) * Math.PI * 2;
                positions.push(r * Math.cos(angle), y, r * Math.sin(angle));
            }
        }

        const topCenterIdx = positions.length / 3;
        const topY = profilePoints[M - 1].y;
        positions.push(0, topY, 0);

        // Bottom cap (facing -Y)
        for (let j = 0; j < S; j++) {
            const nextJ = (j + 1) % S;
            indices.push(0, 1 + j, 1 + nextJ);
        }

        // Sidewall quads (facing radially outwards)
        for (let i = 0; i < M - 1; i++) {
            const row0 = 1 + i * S;
            const row1 = 1 + (i + 1) * S;
            for (let j = 0; j < S; j++) {
                const nextJ = (j + 1) % S;
                indices.push(row0 + j, row1 + nextJ, row0 + nextJ);
                indices.push(row0 + j, row1 + j, row1 + nextJ);
            }
        }

        // Top cap (facing +Y)
        const topRingStart = 1 + (M - 1) * S;
        for (let j = 0; j < S; j++) {
            const nextJ = (j + 1) % S;
            indices.push(topCenterIdx, topRingStart + nextJ, topRingStart + j);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Creates handle geometry based on style and dimensions.
 * The handle is centered at (0, 0) and extends from y = 0 upwards to y = height.
 */
export function createStampHandleGeometry(
    style: HandleStyle,
    height: number,
    baseWidthMm: number
): THREE.BufferGeometry | null {
    if (style === 'none' || height <= 0) {
        return null;
    }

    // Base radius is proportional to the stamp footprint
    const baseRadius = Math.max(6, Math.min(baseWidthMm * 0.35, 18));

    if (style === 'finger-grip') {
        const points = createFingerGripPoints(height, baseRadius);
        return createTurnedSolidGeometry(points, 32);
    }

    if (style === 'ribbed-peg') {
        const points = createRibbedPegPoints(height, baseRadius);
        return createTurnedSolidGeometry(points, 32);
    }

    if (style === 't-bar') {
        return createTBarGeometry(height, baseRadius);
    }

    if (style === 'classic-wood') {
        const points = createClassicWoodPoints(height, baseRadius);
        return createTurnedSolidGeometry(points, 32);
    }

    if (style === 'wax-seal-turned') {
        const points = createWaxSealTurnedPoints(height, baseRadius);
        return createTurnedSolidGeometry(points, 32);
    }

    if (style === 'desk-knob') {
        const points = createDeskKnobPoints(height, baseRadius);
        return createTurnedSolidGeometry(points, 32);
    }

    if (style === 'minimal-block') {
        const width = baseRadius * 1.8;
        const depth = baseRadius * 1.2;
        const geometry = new THREE.BoxGeometry(width, height, depth, 4, 12, 4);
        geometry.translate(0, height / 2, 0);
        geometry.computeVertexNormals();
        return geometry;
    }

    return null;
}
