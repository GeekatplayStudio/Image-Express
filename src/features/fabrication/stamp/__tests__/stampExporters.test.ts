/**
 * 3D Stamp Tool - Exporter Unit Tests
 */

import { buildStampModel } from '../domain/stampModelBuilder';
import {
    exportStampToSTL,
    exportStampToOBJ,
    exportStampToGLB,
} from '../domain/stampExporters';
import { DEFAULT_STAMP_CONFIG } from '../domain/stampTypes';

function readBlobAsText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(blob);
    });
}

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

describe('3D Stamp Exporters', () => {
    const width = 16;
    const height = 16;
    const dummyHeightmap = new Uint8ClampedArray(width * height * 4);
    const assembly = buildStampModel(DEFAULT_STAMP_CONFIG, dummyHeightmap, width, height);

    describe('exportStampToSTL', () => {
        it('exports valid binary STL blob', async () => {
            const blob = exportStampToSTL(assembly, 'stl-binary', 'complete');
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe('application/octet-stream');
            expect(blob.size).toBeGreaterThan(84);

            const buffer = await readBlobAsArrayBuffer(blob);
            const view = new DataView(buffer);
            const triangleCount = view.getUint32(80, true);
            expect(triangleCount).toBeGreaterThan(0);
        });

        it('exports valid ASCII STL blob', async () => {
            const blob = exportStampToSTL(assembly, 'stl-ascii', 'complete');
            expect(blob).toBeInstanceOf(Blob);
            const text = await readBlobAsText(blob);
            expect(text.startsWith('solid')).toBe(true);
            expect(text.includes('facet normal')).toBe(true);
            expect(text.includes('endsolid')).toBe(true);
        });

        it('exports die plate only target', () => {
            const blob = exportStampToSTL(assembly, 'stl-binary', 'die-plate');
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.size).toBeGreaterThan(84);
        });
    });

    describe('exportStampToOBJ', () => {
        it('exports valid Wavefront OBJ blob', async () => {
            const blob = exportStampToOBJ(assembly, 'complete');
            expect(blob).toBeInstanceOf(Blob);
            const text = await readBlobAsText(blob);
            expect(text.includes('v ')).toBe(true);
            expect(text.includes('f ')).toBe(true);
        });
    });

    describe('exportStampToGLB', () => {
        it('exports valid GLTF/GLB blob', async () => {
            const blob = await exportStampToGLB(assembly, 'complete');
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.size).toBeGreaterThan(100);
        });
    });
});
