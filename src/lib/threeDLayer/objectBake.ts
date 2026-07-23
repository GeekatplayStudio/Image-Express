// Headless Three.js bake for the 3D layer's object mode: loads a GLB and
// renders it with the sun + shadow catcher to a transparent RGBA canvas —
// no R3F, no modal. Mirrors ThreeDLayerEditor's lighting conventions
// (VSM shadow map, bounds-fitted shadow frustum, bottom pivot).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GlobalLightState } from './globalLight';
import type { Quaternion } from './fspySolver';

export type ObjectBakeSettings = {
    modelUrl: string;
    rotationY?: number;         // degrees
    rotationX?: number;
    scale?: number;
    cameraFovV?: number;        // degrees; fSpy solve or default
    cameraQuaternion?: Quaternion | null;
    cameraElevation?: number;   // degrees above ground, used without a solve
    cameraDistance?: number;    // multiples of model radius
    shadowOpacity?: number;
};

const modelCache = new Map<string, Promise<THREE.Group>>();

function loadModel(url: string): Promise<THREE.Group> {
    let cached = modelCache.get(url);
    if (!cached) {
        cached = new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene);
        cached.catch(() => modelCache.delete(url));
        modelCache.set(url, cached);
    }
    // Clone per bake so transforms don't accumulate across layers.
    return cached.then((scene) => scene.clone(true));
}

/** Built-in placeholder so object mode works before any model is chosen. */
function placeholderModel(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8fb3ce, roughness: 0.55, metalness: 0.05 });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    cube.position.y = 0.5;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 32), mat.clone());
    sphere.position.set(0.85, 0.42, 0.35);
    group.add(cube, sphere);
    return group;
}

export async function bakeObjectLayer(
    settings: ObjectBakeSettings,
    sun: GlobalLightState,
    outSize: { width: number; height: number } = { width: 1024, height: 1024 },
): Promise<HTMLCanvasElement> {
    const model = settings.modelUrl === '__placeholder'
        ? placeholderModel()
        : await loadModel(settings.modelUrl);

    model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Bottom pivot at world origin, uniform scale + rotation from settings.
    model.rotation.set(
        ((settings.rotationX ?? 0) * Math.PI) / 180,
        ((settings.rotationY ?? 0) * Math.PI) / 180,
        0,
    );
    model.scale.setScalar(settings.scale ?? 1);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z); // rest on y=0, centered
    model.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(model);
    const sphere = fitted.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 1e-3);

    const scene = new THREE.Scene();
    scene.add(model);

    // Sun: shared GlobalLightState azimuth/elevation, same convention as the
    // relight shader (0° azimuth = from +x, elevation above the horizon).
    const az = (sun.azimuth * Math.PI) / 180;
    const el = (sun.elevation * Math.PI) / 180;
    const lightDir = new THREE.Vector3(
        Math.cos(az) * Math.cos(el),
        Math.sin(el),
        -Math.sin(az) * Math.cos(el),
    );
    const dirLight = new THREE.DirectionalLight(sun.color, sun.intensity * 2.4);
    dirLight.position.copy(lightDir.clone().multiplyScalar(radius * 6));
    dirLight.castShadow = sun.shadows.enabled;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.0015;
    dirLight.shadow.radius = 4 + sun.shadows.softness * 12;
    dirLight.shadow.blurSamples = 16;
    const frustum = radius * 2.5;
    dirLight.shadow.camera.left = -frustum;
    dirLight.shadow.camera.right = frustum;
    dirLight.shadow.camera.top = frustum;
    dirLight.shadow.camera.bottom = -frustum;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = radius * 20;
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-lightDir.x, 0.6, -lightDir.z);
    scene.add(fill);

    // Shadow catcher: transparent ground that only shows the shadow.
    const catcher = new THREE.Mesh(
        new THREE.PlaneGeometry(radius * 12, radius * 12),
        new THREE.ShadowMaterial({ opacity: settings.shadowOpacity ?? 0.35 }),
    );
    catcher.rotation.x = -Math.PI / 2;
    catcher.receiveShadow = true;
    scene.add(catcher);

    const camera = new THREE.PerspectiveCamera(
        settings.cameraFovV ?? 40,
        outSize.width / outSize.height,
        radius / 50,
        radius * 60,
    );
    if (settings.cameraQuaternion) {
        // fSpy solve: orientation from the photo; position the camera along
        // its own backward axis so the model fills the frame.
        const q = settings.cameraQuaternion;
        camera.quaternion.set(q.x, q.y, q.z, q.w);
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
        camera.position.copy(back.multiplyScalar(radius * (settings.cameraDistance ?? 3.2)));
        camera.position.y += radius * 0.4;
    } else {
        const elev = ((settings.cameraElevation ?? 12) * Math.PI) / 180;
        const dist = radius * (settings.cameraDistance ?? 3.2);
        camera.position.set(0, Math.sin(elev) * dist + radius * 0.4, Math.cos(elev) * dist);
        camera.lookAt(0, radius * 0.45, 0);
    }

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(outSize.width, outSize.height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);

    const out = document.createElement('canvas');
    out.width = outSize.width;
    out.height = outSize.height;
    out.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    renderer.dispose();
    return out;
}
