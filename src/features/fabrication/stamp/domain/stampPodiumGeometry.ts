/**
 * 3D Stamp Tool - Podium (Backing Mount) Geometries
 * Backing plates for holding stamp dies with bevels, fillets, and tactile orientation notches.
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
    const r = Math.min(radius, Math.min(w, h) / 3);

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
 * Creates a rectangular stamp podium with rounded corners, top chamfer/bevel,
 * and an authentic tactile orientation notch on the front edge.
 */
function createRectangularPodium(
    width: number,
    depth: number,
    thickness: number,
    cornerRadius: number,
    hasOrientationNotch: boolean = true
): THREE.BufferGeometry {
    const shape = createRoundedRectShape(width, depth, cornerRadius);

    const bevelSize = Math.min(1.5, thickness * 0.25, cornerRadius * 0.5);
    const bevelThickness = Math.min(1.5, thickness * 0.25);

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: thickness - bevelThickness,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize,
        bevelThickness,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Reorient so that Extrude Z axis becomes Y axis (vertical height)
    // and center at (0, 0, 0)
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, 0);

    // If orientation notch is enabled, slightly carve or indent the front-center face (+Z)
    if (hasOrientationNotch) {
        const positions = geometry.attributes.position;
        const notchWidth = Math.min(6, width * 0.2);
        const notchDepth = 1.0;
        const frontZ = depth / 2;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);

            // Check if vertex is near front edge (+Z) within notch X range and upper Y half
            if (Math.abs(x) < notchWidth / 2 && z > frontZ - notchDepth && y > thickness * 0.3) {
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
 * Includes stepped transition collar and chamfered top lip.
 */
function createCircularPodium(diameter: number, thickness: number): THREE.BufferGeometry {
    const radius = diameter / 2;
    const segments = 48;

    // Build stepped lathe profile: bottom die face -> stepped collar -> bevelled top face
    const points: THREE.Vector2[] = [];
    const bevel = Math.min(1.5, thickness * 0.2);

    // Profile from bottom center (0, 0) out to radius, up to thickness, back to top center (0, thickness)
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(radius, 0));
    points.push(new THREE.Vector2(radius, thickness - bevel));
    points.push(new THREE.Vector2(radius - bevel, thickness));
    points.push(new THREE.Vector2(0, thickness));

    const geometry = new THREE.LatheGeometry(points, segments);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Creates an oval stamp podium with rounded bevel.
 */
function createOvalPodium(width: number, depth: number, thickness: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const xRadius = width / 2;
    const yRadius = depth / 2;
    shape.absellipse(0, 0, xRadius, yRadius, 0, Math.PI * 2, false, 0);

    const bevelSize = Math.min(1.5, thickness * 0.25);
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: thickness - bevelSize,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize,
        bevelThickness: bevelSize,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Generates a stamp backing podium based on shape and dimensions.
 * Sits between y = 0 (bottom die mounting surface) and y = thicknessMm (top handle mounting surface).
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
