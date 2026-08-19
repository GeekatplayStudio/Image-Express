/**
 * Foldcraft — stage previews.
 *
 * The pipeline's consumers want to *watch* the conversion: the model as it
 * arrived, the low-poly version that will actually be built, and the panels
 * once they lie flat. These renderers produce small self-contained SVGs for
 * exactly that. They are presentation only — nothing downstream reads them —
 * but they live in the library because every host app monitoring the pipeline
 * needs the same pictures.
 */

import type { FlatPanel, FoldcraftMesh } from './foldcraftTypes';
import { faceNormal } from './meshTopology';

export type MeshPreviewOptions = {
    /** Rendered width and height in CSS pixels. */
    sizePx?: number;
    /**
     * Faces beyond this are dropped (largest first is not attempted — the
     * caller should decimate instead). A preview is a thumbnail, not a render.
     */
    maxFaces?: number;
};

const DEFAULT_PREVIEW_SIZE_PX = 220;
const DEFAULT_PREVIEW_MAX_FACES = 4_000;

/** Classic isometric view: turn 45° around Y, then tilt down ~35°. */
const YAW = Math.PI / 4;
const PITCH = Math.atan(1 / Math.SQRT2);

type Vec3 = { x: number; y: number; z: number };

function rotateIso(point: Vec3): Vec3 {
    const x1 = point.x * Math.cos(YAW) + point.z * Math.sin(YAW);
    const z1 = -point.x * Math.sin(YAW) + point.z * Math.cos(YAW);
    const y2 = point.y * Math.cos(PITCH) - z1 * Math.sin(PITCH);
    const z2 = point.y * Math.sin(PITCH) + z1 * Math.cos(PITCH);
    return { x: x1, y: y2, z: z2 };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Lambert-shaded amber, so the thumbnail reads as foam at a glance. */
function faceFill(brightness: number): string {
    const t = Math.max(0, Math.min(1, brightness));
    const mix = (dark: number, light: number) => Math.round(dark + (light - dark) * t);
    return `rgb(${mix(146, 252)},${mix(84, 211)},${mix(22, 77)})`;
}

/**
 * Render a mesh as a shaded isometric thumbnail.
 *
 * Orthographic projection, back-face culling from the face normals the mesh
 * already guarantees point outward, and painter's-order fill. Good enough to
 * see whether "convert to low poly" kept the shape — which is its entire job.
 */
export function meshPreviewSvg(mesh: FoldcraftMesh, options: MeshPreviewOptions = {}): string {
    const sizePx = options.sizePx ?? DEFAULT_PREVIEW_SIZE_PX;
    const maxFaces = options.maxFaces ?? DEFAULT_PREVIEW_MAX_FACES;
    const rotated = mesh.vertices.map(rotateIso);

    // Camera sits at +z after rotation; light comes over the left shoulder.
    const light = { x: -0.35, y: 0.85, z: 0.4 };
    const lightLength = Math.hypot(light.x, light.y, light.z);

    const visible: Array<{ face: number[]; depth: number; brightness: number }> = [];
    for (let index = 0; index < mesh.faces.length && visible.length < maxFaces; index += 1) {
        const normal = rotateIso(faceNormal(mesh, index));
        if (normal.z <= 0) continue;
        const face = mesh.faces[index];
        let depth = 0;
        for (const vertex of face) depth += rotated[vertex].z;
        const brightness = (normal.x * light.x + normal.y * light.y + normal.z * light.z) / lightLength;
        visible.push({ face, depth: depth / face.length, brightness: 0.25 + 0.75 * Math.max(0, brightness) });
    }
    visible.sort((a, b) => a.depth - b.depth);

    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    rotated.forEach((point) => {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (-point.y < minY) minY = -point.y;
        if (-point.y > maxY) maxY = -point.y;
    });
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
    const pad = Math.max(maxX - minX, maxY - minY) * 0.05 || 1;

    const polygons = visible.map(({ face, brightness }) => {
        const points = face
            .map((vertex) => `${round2(rotated[vertex].x)},${round2(-rotated[vertex].y)}`)
            .join(' ');
        return `<polygon points="${points}" fill="${faceFill(brightness)}" stroke="rgba(30,20,5,0.35)" stroke-width="${round2(pad * 0.12)}" stroke-linejoin="round"/>`;
    });

    const viewBox = `${round2(minX - pad)} ${round2(minY - pad)} ${round2(maxX - minX + pad * 2)} ${round2(maxY - minY + pad * 2)}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${polygons.join('')}</svg>`;
}

/**
 * Render flattened panels as a compact 2D sheet: cut outlines solid, mountain
 * folds dashed warm, valley folds dashed cool. This is "watch it unfold" —
 * the same geometry the cutter files carry, before sheet packing.
 */
export function panelsPreviewSvg(panels: FlatPanel[], options: MeshPreviewOptions = {}): string {
    const sizePx = options.sizePx ?? DEFAULT_PREVIEW_SIZE_PX;
    const gap = panels.reduce((sum, panel) => (
        sum + (panel.boundsMm.maxX - panel.boundsMm.minX)
    ), 0) / Math.max(1, panels.length) * 0.12 || 1;

    // Shelf-place the panels into a roughly square field, tallest first.
    const order = panels
        .map((panel, index) => ({ panel, index }))
        .sort((a, b) => (
            (b.panel.boundsMm.maxY - b.panel.boundsMm.minY) - (a.panel.boundsMm.maxY - a.panel.boundsMm.minY)
        ));
    const totalArea = panels.reduce((sum, panel) => (
        sum + (panel.boundsMm.maxX - panel.boundsMm.minX) * (panel.boundsMm.maxY - panel.boundsMm.minY)
    ), 0);
    const targetWidth = Math.sqrt(totalArea) * 1.35 || 1;

    let cursorX = 0; let cursorY = 0; let shelfHeight = 0;
    let fieldWidth = 0; let fieldHeight = 0;
    const shapes: string[] = [];
    for (const { panel } of order) {
        const width = panel.boundsMm.maxX - panel.boundsMm.minX;
        const height = panel.boundsMm.maxY - panel.boundsMm.minY;
        if (cursorX > 0 && cursorX + width > targetWidth) {
            cursorX = 0;
            cursorY += shelfHeight + gap;
            shelfHeight = 0;
        }
        const dx = cursorX - panel.boundsMm.minX;
        const dy = cursorY - panel.boundsMm.minY;
        cursorX += width + gap;
        shelfHeight = Math.max(shelfHeight, height);
        fieldWidth = Math.max(fieldWidth, cursorX - gap);
        fieldHeight = Math.max(fieldHeight, cursorY + height);

        const strokeWidth = round2(Math.max(0.2, Math.sqrt(totalArea) * 0.004));
        panel.boundaryEdges.forEach((edge) => {
            shapes.push(`<line x1="${round2(edge.a.x + dx)}" y1="${round2(edge.a.y + dy)}" x2="${round2(edge.b.x + dx)}" y2="${round2(edge.b.y + dy)}" stroke="#334155" stroke-width="${strokeWidth}"/>`);
        });
        panel.interiorEdges.forEach((edge) => {
            if (edge.direction === 'flat') return;
            const color = edge.direction === 'mountain' ? '#d97706' : '#2563eb';
            shapes.push(`<line x1="${round2(edge.a.x + dx)}" y1="${round2(edge.a.y + dy)}" x2="${round2(edge.b.x + dx)}" y2="${round2(edge.b.y + dy)}" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${round2(strokeWidth * 5)} ${round2(strokeWidth * 3)}"/>`);
        });
    }

    const pad = Math.max(fieldWidth, fieldHeight) * 0.04 || 1;
    const viewBox = `${round2(-pad)} ${round2(-pad)} ${round2(fieldWidth + pad * 2)} ${round2(fieldHeight + pad * 2)}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${shapes.join('')}</svg>`;
}
