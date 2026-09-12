/**
 * 3D Stamp Tool - Podium (Backing Mount) Geometries
 * Backing plates for holding stamp dies with bevels, fillets, and tactile orientation notches.
 *
 * Every podium occupies exactly y = 0 (die mounting face) to y = thicknessMm (handle mounting
 * face) and its widest cross-section matches the requested width/depth, so the dimensions shown
 * in the viewport are the dimensions that get printed.
 */

import * as THREE from 'three';
import { PodiumShape } from './stampTypes';

/**
 * Builds a 2D rounded rectangle shape for extrusion.
 */
function createRoundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -depth / 2;
    const w = width;
    const h = depth;
    const r = Math.max(0, Math.min(radius, Math.min(w, h) / 3));

    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);

    return shape;
}

/**
 * Extrudes a podium profile vertically with a chamfer at both ends.
 *
 * `ExtrudeGeometry` offsets the profile outwards by `bevelSize` at the full-depth section and
 * adds `bevelThickness` beyond each end, so the caller passes a profile already shrunk by the
 * bevel; this keeps the finished solid inside the requested footprint and height.
 */
function extrudePodium(
    shape: THREE.Shape,
    thickness: number,
    bevel: number,
    curveSegments: number
): THREE.BufferGeometry {
    const bevelThickness = Math.max(0.01, Math.min(bevel, thickness * 0.25));
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.05, thickness - bevelThickness * 2),
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: bevelThickness,
        bevelThickness,
        curveSegments,
    });

    // Extrusion runs along +Z; rotate so it runs along +Y, then lift the chamfered
    // bottom (which sits at -bevelThickness) up to exactly y = 0.
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, bevelThickness, 0);
    return geometry;
}

/** Bevel size shared by every podium shape. */
function podiumBevel(thickness: number, limit: number = 1.5): number {
    return Math.max(0.2, Math.min(limit, thickness * 0.25));
}

/**
 * Creates a rectangular stamp podium with rounded corners, top/bottom chamfer,
 * and an authentic tactile orientation notch on the front edge.
 */
function createRectangularPodium(
    width: number,
    depth: number,
    thickness: number,
    cornerRadius: number,
    hasOrientationNotch: boolean = true
): THREE.BufferGeometry {
    const bevel = podiumBevel(thickness, Math.min(1.5, Math.max(0.2, cornerRadius * 0.5)));
    const shape = createRoundedRectShape(
        Math.max(1, width - bevel * 2),
        Math.max(1, depth - bevel * 2),
        cornerRadius - bevel
    );

    const geometry = extrudePodium(shape, thickness, bevel, 12);

    // Indent the front-centre (+Z) face so the user can feel the stamp's orientation.
    if (hasOrientationNotch) {
        const positions = geometry.attributes.position;
        const notchWidth = Math.min(6, width * 0.2);
        const notchDepth = Math.min(1.0, depth * 0.05);
        const frontZ = depth / 2;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);

            if (Math.abs(x) < notchWidth / 2 && z > frontZ - bevel - notchDepth && y > thickness * 0.3) {
                const factor = Math.cos((x / (notchWidth / 2)) * (Math.PI / 2));
                positions.setZ(i, z - factor * notchDepth * 0.8);
            }
        }
        positions.needsUpdate = true;
    }

    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Creates a circular stamp podium (classic brass wax seal mount or round desk stamp).
 */
function createCircularPodium(diameter: number, thickness: number): THREE.BufferGeometry {
    const bevel = podiumBevel(thickness);
    const radius = Math.max(0.5, diameter / 2 - bevel);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);

    const geometry = extrudePodium(shape, thickness, bevel, 72);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Creates an oval stamp podium with rounded bevel.
 */
function createOvalPodium(width: number, depth: number, thickness: number): THREE.BufferGeometry {
    const bevel = podiumBevel(thickness);
    const shape = new THREE.Shape();
    const xRadius = Math.max(0.5, width / 2 - bevel);
    const yRadius = Math.max(0.5, depth / 2 - bevel);
    shape.absellipse(0, 0, xRadius, yRadius, 0, Math.PI * 2, false, 0);

    // Without an explicit segment count an ellipse extrudes as a visibly faceted 12-gon.
    const geometry = extrudePodium(shape, thickness, bevel, 72);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Generates a stamp backing podium based on shape and dimensions.
 * Sits between y = 0 (bottom die mounting surface) and y = thicknessMm (top handle surface).
 */
export function createStampPodiumGeometry(
    shape: PodiumShape,
    widthMm: number,
    depthMm: number,
    thicknessMm: number,
    cornerRadiusMm: number = 4
): THREE.BufferGeometry {
    if (shape === 'circular') {
        const diameter = Math.min(widthMm, depthMm);
        return createCircularPodium(diameter, thicknessMm);
    }

    if (shape === 'oval') {
        return createOvalPodium(widthMm, depthMm, thicknessMm);
    }

    // Default rectangular
    return createRectangularPodium(widthMm, depthMm, thicknessMm, cornerRadiusMm, true);
}
