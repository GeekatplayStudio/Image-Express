/**
 * 3D Stamp Tool - Model Assembly Builder
 * Combines Die, Podium, and Handle into a cohesive Three.js Group for interactive inspection,
 * and creates unified geometries for 3D printing export.
 */

import * as THREE from 'three';
import { createStampHandleGeometry } from './stampHandleGeometry';
import { computeSignedVolume } from './stampMeshIntegrity';
import { createStampPodiumGeometry } from './stampPodiumGeometry';
import { createStampReliefGeometry } from './stampReliefExtrusion';
import {
    StampConfig,
    StampMaterialTheme,
    StampModelMetrics,
} from './stampTypes';

export interface AssembledStampResult {
    rootGroup: THREE.Group;
    dieMesh: THREE.Mesh;
    podiumMesh: THREE.Mesh;
    handleMesh: THREE.Mesh | null;
    metrics: StampModelMetrics;
    mergedGeometry: THREE.BufferGeometry;
}

/**
 * Creates realistic PBR materials based on the chosen theme.
 */
export function createStampMaterials(theme: StampMaterialTheme): {
    dieMaterial: THREE.Material;
    podiumMaterial: THREE.Material;
    handleMaterial: THREE.Material;
} {
    if (theme === 'wireframe') {
        const wire = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
        return { dieMaterial: wire, podiumMaterial: wire, handleMaterial: wire };
    }

    if (theme === 'white-filament') {
        const whitePLA = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.35,
            metalness: 0.05,
        });
        return { dieMaterial: whitePLA, podiumMaterial: whitePLA, handleMaterial: whitePLA };
    }

    if (theme === 'gold-ebony') {
        const gold = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            roughness: 0.25,
            metalness: 0.85,
        });
        const ebony = new THREE.MeshStandardMaterial({
            color: 0x18181b,
            roughness: 0.4,
            metalness: 0.1,
        });
        return { dieMaterial: gold, podiumMaterial: ebony, handleMaterial: ebony };
    }

    if (theme === 'wax-brass-wood') {
        const brass = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.28,
            metalness: 0.82,
        });
        const darkWood = new THREE.MeshStandardMaterial({
            color: 0x451a03,
            roughness: 0.55,
            metalness: 0.05,
        });
        return { dieMaterial: brass, podiumMaterial: brass, handleMaterial: darkWood };
    }

    if (theme === 'slate-resin') {
        const darkResin = new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.3,
            metalness: 0.1,
        });
        const amberDie = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            roughness: 0.25,
            metalness: 0.05,
        });
        return { dieMaterial: amberDie, podiumMaterial: darkResin, handleMaterial: darkResin };
    }

    // Default: 'rubber-wood' (Classic desk hand stamp)
    const terracottaRubber = new THREE.MeshStandardMaterial({
        color: 0xffffff, // Modulates with vertexColors
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.0,
    });
    const cherryWood = new THREE.MeshStandardMaterial({
        color: 0x78350f, // Warm cherry wood
        roughness: 0.48,
        metalness: 0.05,
    });

    return {
        dieMaterial: terracottaRubber,
        podiumMaterial: cherryWood,
        handleMaterial: cherryWood,
    };
}

/**
 * Merges multiple BufferGeometries into a single unified geometry for clean 3D printing.
 */
function mergeGeometries(geometries: { geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }[]): THREE.BufferGeometry {
    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    for (const { geom, matrix } of geometries) {
        const posAttr = geom.getAttribute('position');
        const normalAttr = geom.getAttribute('normal');
        const indexAttr = geom.getIndex();

        if (!posAttr) continue;

        const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
        const tempVec = new THREE.Vector3();
        const tempNormal = new THREE.Vector3();

        for (let i = 0; i < posAttr.count; i++) {
            tempVec.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
            positions.push(tempVec.x, tempVec.y, tempVec.z);

            if (normalAttr) {
                tempNormal.fromBufferAttribute(normalAttr, i).applyMatrix3(normalMatrix).normalize();
                normals.push(tempNormal.x, tempNormal.y, tempNormal.z);
            } else {
                normals.push(0, 1, 0);
            }
        }

        if (indexAttr) {
            for (let i = 0; i < indexAttr.count; i++) {
                indices.push(indexAttr.getX(i) + vertexOffset);
            }
        } else {
            for (let i = 0; i < posAttr.count; i++) {
                indices.push(i + vertexOffset);
            }
        }

        vertexOffset += posAttr.count;
    }

    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setIndex(indices);
    return merged;
}

/**
 * Builds the complete assembled stamp model.
 */
export function buildStampModel(
    config: StampConfig,
    heightmapData: Uint8ClampedArray,
    gridWidth: number,
    gridHeight: number
): AssembledStampResult {
    const { dimensions, podiumShape, handleStyle, materialTheme } = config;
    const {
        widthMm,
        depthMm,
        podiumThicknessMm,
        handleHeightMm,
        reliefDepthMm,
        basePlateThicknessMm,
        draftAngleDeg,
        cornerRadiusMm,
    } = dimensions;

    const materials = createStampMaterials(materialTheme);

    // 1. Build Die Mesh
    const dieGeometry = createStampReliefGeometry({
        heightmapData,
        gridWidth,
        gridHeight,
        physicalWidthMm: widthMm,
        physicalDepthMm: depthMm,
        reliefDepthMm,
        basePlateThicknessMm,
        shape: podiumShape,
        draftAngleDeg,
        useContinuousGrayscale: config.artwork.useContinuousGrayscale,
    });
    const dieMesh = new THREE.Mesh(dieGeometry, materials.dieMaterial);
    dieMesh.name = 'StampDie';
    dieMesh.castShadow = true;
    dieMesh.receiveShadow = true;

    // 2. Build Backing Podium Mesh
    const podiumGeometry = createStampPodiumGeometry(
        podiumShape,
        widthMm,
        depthMm,
        podiumThicknessMm,
        cornerRadiusMm
    );
    const podiumMesh = new THREE.Mesh(podiumGeometry, materials.podiumMaterial);
    podiumMesh.name = 'StampPodium';
    podiumMesh.castShadow = true;
    podiumMesh.receiveShadow = true;

    // 3. Build Handle Mesh (if handle is enabled)
    let handleMesh: THREE.Mesh | null = null;
    const handleGeometry = createStampHandleGeometry(handleStyle, handleHeightMm, widthMm);

    if (handleGeometry) {
        handleMesh = new THREE.Mesh(handleGeometry, materials.handleMaterial);
        handleMesh.name = 'StampHandle';
        handleMesh.position.y = podiumThicknessMm;
        handleMesh.castShadow = true;
        handleMesh.receiveShadow = true;
    }

    // Assemble root group
    const rootGroup = new THREE.Group();
    rootGroup.name = 'StampAssembly';
    rootGroup.add(dieMesh);
    rootGroup.add(podiumMesh);
    if (handleMesh) {
        rootGroup.add(handleMesh);
    }

    // Merge geometries for 3D printing export
    const mergeParts: { geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [
        { geom: dieGeometry, matrix: new THREE.Matrix4() },
        { geom: podiumGeometry, matrix: new THREE.Matrix4() },
    ];
    if (handleGeometry) {
        const handleMatrix = new THREE.Matrix4().makeTranslation(0, podiumThicknessMm, 0);
        mergeParts.push({ geom: handleGeometry, matrix: handleMatrix });
    }
    const mergedGeometry = mergeGeometries(mergeParts);

    // Measure the assembled solid rather than re-deriving it from the config: several
    // handle styles clamp their own height (finger-grip tops out at 12mm), so adding the
    // requested handle height would over-report how tall the printed stamp actually is.
    mergedGeometry.computeBoundingBox();
    const bounds = mergedGeometry.boundingBox;
    const totalHeightMm = bounds ? bounds.max.y - bounds.min.y : 0;

    const triangleCount = mergedGeometry.getIndex() ? mergedGeometry.getIndex()!.count / 3 : 0;
    const vertexCount = mergedGeometry.getAttribute('position') ? mergedGeometry.getAttribute('position').count : 0;

    // Each part is an independently closed shell; a negative signed volume means one of them
    // is wound inside-out, which renders as a see-through shape and fails slicer repair.
    const shellVolumes = mergeParts.map(({ geom }) => computeSignedVolume(geom));
    const isManifold = shellVolumes.every((volume) => volume > 0);
    const solidVolumeMm3 = shellVolumes.reduce((sum, volume) => sum + Math.abs(volume), 0);

    const metrics: StampModelMetrics = {
        widthMm,
        depthMm,
        totalHeightMm: Math.round(totalHeightMm * 10) / 10,
        reliefDepthMm,
        triangleCount,
        vertexCount,
        solidVolumeMm3: Math.round(solidVolumeMm3),
        isManifold,
    };

    return {
        rootGroup,
        dieMesh,
        podiumMesh,
        handleMesh,
        metrics,
        mergedGeometry,
    };
}
