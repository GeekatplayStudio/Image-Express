'use client';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Offscreen still-frame renderer for 3D model thumbnails.
 *
 * Renders a GLB/GLTF once to a small canvas and returns a PNG data URL.
 * Results are cached in-memory per asset key so re-opening the library or
 * switching tabs never re-renders the same model. Renders are serialized
 * through a queue so many models in a grid don't spawn concurrent WebGL
 * contexts (browsers hard-cap those and start evicting the oldest).
 */

const thumbnailCache = new Map<string, string>();
let renderQueue: Promise<unknown> = Promise.resolve();

// One WebGL context shared by every thumbnail render. Browsers cap active
// WebGL contexts (~8-16 per page) and evict the oldest with "Context Lost"
// once exceeded, so creating a renderer per model breaks on bulk uploads.
let sharedRenderer: THREE.WebGLRenderer | null = null;

function getSharedRenderer(size: number): THREE.WebGLRenderer {
    if (!sharedRenderer) {
        const canvas = document.createElement('canvas');
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
        });
        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            // Drop the wedged renderer; the next render creates a fresh one.
            if (sharedRenderer?.domElement === canvas) {
                sharedRenderer.dispose();
                sharedRenderer = null;
            }
        });
        sharedRenderer = renderer;
    }
    sharedRenderer.setSize(size, size, false);
    return sharedRenderer;
}

const RENDERABLE_MODEL_EXTENSIONS = new Set(['.glb', '.gltf']);

export function canRenderModelThumbnail(filename: string): boolean {
    const dotIndex = filename.toLowerCase().lastIndexOf('.');
    const extension = dotIndex >= 0 ? filename.toLowerCase().slice(dotIndex) : '';
    return RENDERABLE_MODEL_EXTENSIONS.has(extension);
}

export function getCachedModelThumbnail(cacheKey: string): string | null {
    return thumbnailCache.get(cacheKey) ?? null;
}

export function renderModelThumbnail(cacheKey: string, url: string, size = 256): Promise<string> {
    const cached = thumbnailCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    const run = renderQueue.then(async () => {
        const again = thumbnailCache.get(cacheKey);
        if (again) return again;
        const dataUrl = await renderModelToDataUrl(url, size);
        thumbnailCache.set(cacheKey, dataUrl);
        return dataUrl;
    });
    // Keep the queue alive even when a render fails so later models still run.
    renderQueue = run.catch(() => undefined);
    return run;
}

async function renderModelToDataUrl(url: string, size: number): Promise<string> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-4, 2, -5);
    scene.add(fillLight);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    model.position.sub(center);
    scene.add(model);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    const radius = sphere.radius > 0 ? sphere.radius : 1;
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(20))) * 1.1;
    camera.position.set(0.6, 0.45, 0.75).normalize().multiplyScalar(distance);
    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    const renderer = getSharedRenderer(size);
    try {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
    } finally {
        // Free the model's GPU resources but keep the shared renderer alive.
        model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(material)) {
                material.forEach((entry) => entry.dispose());
            } else if (material) {
                material.dispose();
            }
        });
    }
}
