/**
 * 3D Stamp Tool - Exporters
 * Exports stamp geometries to STL (Binary & ASCII), OBJ, and GLTF/GLB formats.
 */

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { AssembledStampResult } from './stampModelBuilder';
import { StampExportFormat, StampExportTarget } from './stampTypes';

/**
 * Triggers a file download in the browser.
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Resolves the 3D object to export based on the chosen target:
 * - 'complete': every part, or the pre-merged single mesh
 * - 'die-plate': the die mesh + podium
 * - 'handle': the handle mesh, dropped to the build plate
 *
 * Always assembled from clones. `Object3D.add` detaches an object from its current parent,
 * so exporting the live meshes would pull them out of whatever scene is rendering them -
 * and reading `rootGroup` would return an empty group once the viewport has adopted them.
 */
function resolveExportObject(
    assembly: AssembledStampResult,
    target: StampExportTarget,
    useMergedMesh: boolean = false
): THREE.Object3D {
    if (target === 'handle' && assembly.handleMesh) {
        const handle = assembly.handleMesh.clone();
        // Print the handle standing on the bed rather than floating at podium height.
        handle.position.set(0, 0, 0);
        handle.updateMatrixWorld(true);
        return handle;
    }

    if (target === 'die-plate') {
        const diePlateGroup = new THREE.Group();
        diePlateGroup.add(assembly.dieMesh.clone());
        diePlateGroup.add(assembly.podiumMesh.clone());
        diePlateGroup.updateMatrixWorld(true);
        return diePlateGroup;
    }

    // 'complete' (also the fallback when a handle export is requested on a handle-less stamp)
    if (useMergedMesh) {
        return new THREE.Mesh(
            assembly.mergedGeometry,
            new THREE.MeshStandardMaterial({ color: 0xcccccc })
        );
    }

    const completeGroup = new THREE.Group();
    completeGroup.name = 'StampAssembly';
    completeGroup.add(assembly.dieMesh.clone());
    completeGroup.add(assembly.podiumMesh.clone());
    if (assembly.handleMesh) {
        completeGroup.add(assembly.handleMesh.clone());
    }
    completeGroup.updateMatrixWorld(true);
    return completeGroup;
}

/**
 * Exports the stamp in STL format (Binary or ASCII).
 * Binary STL is recommended for 3D printing slicers (Cura, Bambu Studio, PrusaSlicer).
 */
export function exportStampToSTL(
    assembly: AssembledStampResult,
    format: 'stl-binary' | 'stl-ascii' = 'stl-binary',
    target: StampExportTarget = 'complete'
): Blob {
    const exporter = new STLExporter();
    const isBinary = format === 'stl-binary';

    // For 3D printing, exporting the merged single manifold mesh ensures 100% slicer compatibility
    const exportTargetObj = resolveExportObject(assembly, target, true);

    const result = exporter.parse(exportTargetObj, { binary: isBinary });

    if (result instanceof ArrayBuffer) {
        return new Blob([result], { type: 'application/octet-stream' });
    }
    if (result instanceof DataView) {
        return new Blob([result.buffer], { type: 'application/octet-stream' });
    }

    return new Blob([result], { type: 'text/plain;charset=utf-8' });
}

/**
 * Exports the stamp in Wavefront OBJ format.
 */
export function exportStampToOBJ(
    assembly: AssembledStampResult,
    target: StampExportTarget = 'complete'
): Blob {
    const exporter = new OBJExporter();
    const exportTargetObj = resolveExportObject(assembly, target, false);
    const objText = exporter.parse(exportTargetObj);

    return new Blob([objText], { type: 'text/plain;charset=utf-8' });
}

/**
 * Exports the stamp in GLTF/GLB binary format with full PBR materials.
 */
export function exportStampToGLB(
    assembly: AssembledStampResult,
    target: StampExportTarget = 'complete'
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const exporter = new GLTFExporter();
        const exportTargetObj = resolveExportObject(assembly, target, false);

        exporter.parse(
            exportTargetObj,
            (gltf) => {
                if (gltf instanceof ArrayBuffer) {
                    resolve(new Blob([gltf], { type: 'model/gltf-binary' }));
                } else {
                    const jsonString = JSON.stringify(gltf, null, 2);
                    resolve(new Blob([jsonString], { type: 'application/json' }));
                }
            },
            (error) => {
                reject(error);
            },
            { binary: true }
        );
    });
}

/**
 * Unified export dispatcher.
 */
export async function exportStampFile(
    assembly: AssembledStampResult,
    format: StampExportFormat,
    target: StampExportTarget = 'complete',
    baseFilename: string = 'stamp-model'
): Promise<Blob> {
    const sanitizedName = baseFilename.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    let blob: Blob;
    let extension = 'stl';

    if (format === 'stl-binary' || format === 'stl-ascii') {
        blob = exportStampToSTL(assembly, format, target);
        extension = 'stl';
    } else if (format === 'obj') {
        blob = exportStampToOBJ(assembly, target);
        extension = 'obj';
    } else {
        blob = await exportStampToGLB(assembly, target);
        extension = 'glb';
    }

    const fullFilename = `${sanitizedName}-${target}.${extension}`;
    downloadBlob(blob, fullFilename);
    return blob;
}
