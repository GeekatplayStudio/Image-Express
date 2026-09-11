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

        points.push(new THREE.Vector2(Math.max(0.001, r), y));
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

        points.push(new THREE.Vector2(Math.max(0.001, r), y));
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

        points.push(new THREE.Vector2(Math.max(0.001, r), y));
    }

    return points;
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

    if (style === 'classic-wood') {
        const points = createClassicWoodPoints(height, baseRadius);
        const geometry = new THREE.LatheGeometry(points, 32);
        geometry.computeVertexNormals();
        return geometry;
    }

    if (style === 'wax-seal-turned') {
        const points = createWaxSealTurnedPoints(height, baseRadius);
        const geometry = new THREE.LatheGeometry(points, 32);
        geometry.computeVertexNormals();
        return geometry;
    }

    if (style === 'desk-knob') {
        const points = createDeskKnobPoints(height, baseRadius);
        const geometry = new THREE.LatheGeometry(points, 32);
        geometry.computeVertexNormals();
        return geometry;
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
