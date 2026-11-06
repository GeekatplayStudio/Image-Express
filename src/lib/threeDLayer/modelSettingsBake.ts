// Headless re-render of a placed 3D model layer from its saved ThreeDSettings,
// used by the in-panel lighting controls (ThreeDModelLayerPanel).
//
// It must produce the same pixels the 3D View Editor captured, or the layer
// visibly changes the moment a slider moves. An earlier version lit the model
// with only the ambient and sun lights, so the first adjustment made the layer
// darker and dropped its contact shadow. The editor scene (ThreeDLayerEditor)
// also has, and this file now reproduces:
//
//   - the HDR environment map (`settings.environment`, default "city") that
//     drei's <Environment> puts on `scene.environment`;
//   - drei <Stage>'s own lights: an ambient at intensity/3, a soft spotlight and
//     a point light placed on the model's radius (preset "rembrandt");
//   - R3F's renderer defaults: ACES filmic tone mapping and sRGB output;
//   - drei <ContactShadows> under the model;
//   - the editor's geometry: model centred like <Center>, the sun at its saved
//     position, the shadow frustum and floor sized from the model bounds, and
//     the saved camera with R3F's default 45° lens.
//
// Change the editor scene and this file together.

import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { createGltfLoader, environmentFile } from '@/lib/three/gltfLoading';
import type { ThreeDSettings } from '@/types';

/** The editor's fallbacks for a layer saved before a setting existed. */
export const EDITOR_LIGHTING_FALLBACKS = {
    lightPosition: { x: 5, y: 5, z: 5 },
    lightIntensity: 1.2,
    lightColor: '#ffffff',
    ambientIntensity: 0.35,
    environment: 'city',
    envIntensity: 0.6,
    castShadowEnabled: true,
    castShadowBlur: 22,
    castShadowIntensity: 0.35,
    contactShadowEnabled: true,
    contactShadowBlur: 8,
    contactShadowIntensity: 0.6,
} as const;

/** drei <Stage> preset "rembrandt", in multiples of the model radius. */
const STAGE_MAIN = [1, 2, 1] as const;
const STAGE_FILL = [-2, -0.5, -2] as const;
const CONTACT_RESOLUTION = 512;

const modelCache = new Map<string, Promise<THREE.Group>>();
const environmentCache = new Map<string, Promise<THREE.DataTexture>>();
let sharedRenderer: THREE.WebGLRenderer | null = null;

function loadModel(url: string): Promise<THREE.Group> {
    let cached = modelCache.get(url);
    if (!cached) {
        cached = createGltfLoader().loadAsync(url).then((gltf) => gltf.scene);
        cached.catch(() => modelCache.delete(url));
        modelCache.set(url, cached);
    }
    return cached.then((scene) => scene.clone(true));
}

function loadEnvironment(url: string): Promise<THREE.DataTexture> {
    let cached = environmentCache.get(url);
    if (!cached) {
        cached = new EXRLoader().loadAsync(url).then((texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            return texture;
        });
        cached.catch(() => environmentCache.delete(url));
        environmentCache.set(url, cached);
    }
    return cached;
}

/**
 * One renderer for every bake. A slider drag queues many bakes, and a new
 * WebGL context per bake runs into the browser's context limit, which loses
 * the oldest context and renders black. Reusing one also keeps the
 * environment's prefiltered map cached between bakes.
 */
function getRenderer(): THREE.WebGLRenderer {
    if (sharedRenderer && !sharedRenderer.getContext().isContextLost()) return sharedRenderer;
    sharedRenderer?.dispose();
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    sharedRenderer = renderer;
    return renderer;
}

/** drei <ContactShadows>: a depth render from below, blurred, on a transparent plane. */
function createContactShadow(options: { y: number; scale: number; far: number; blur: number; opacity: number }) {
    const size = options.scale;
    const renderTarget = new THREE.WebGLRenderTarget(CONTACT_RESOLUTION, CONTACT_RESOLUTION);
    const renderTargetBlur = new THREE.WebGLRenderTarget(CONTACT_RESOLUTION, CONTACT_RESOLUTION);
    renderTarget.texture.generateMipmaps = renderTargetBlur.texture.generateMipmaps = false;
    const planeGeometry = new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2);
    const blurPlane = new THREE.Mesh(planeGeometry);
    const depthMaterial = new THREE.MeshDepthMaterial();
    depthMaterial.depthTest = depthMaterial.depthWrite = false;
    depthMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.ucolor = { value: new THREE.Color('#000000') };
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', 'uniform vec3 ucolor;\nvoid main() {')
            .replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );');
    };
    const horizontal = new THREE.ShaderMaterial(HorizontalBlurShader);
    const vertical = new THREE.ShaderMaterial(VerticalBlurShader);
    horizontal.depthTest = vertical.depthTest = false;

    const group = new THREE.Group();
    group.rotation.x = Math.PI / 2;
    group.position.set(0, options.y, 0);
    const shadowMaterial = new THREE.MeshBasicMaterial({
        transparent: true, map: renderTarget.texture, opacity: options.opacity, depthWrite: false,
    });
    const plane = new THREE.Mesh(planeGeometry, shadowMaterial);
    plane.scale.set(1, -1, 1);
    plane.rotation.set(-Math.PI / 2, 0, 0);
    const camera = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, options.far);
    group.add(plane, camera);

    const blurPass = (renderer: THREE.WebGLRenderer, amount: number) => {
        blurPlane.material = horizontal;
        horizontal.uniforms.tDiffuse.value = renderTarget.texture;
        horizontal.uniforms.h.value = amount / 256;
        renderer.setRenderTarget(renderTargetBlur);
        renderer.render(blurPlane, camera);
        blurPlane.material = vertical;
        vertical.uniforms.tDiffuse.value = renderTargetBlur.texture;
        vertical.uniforms.v.value = amount / 256;
        renderer.setRenderTarget(renderTarget);
        renderer.render(blurPlane, camera);
    };

    return {
        group,
        render(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
            group.visible = false;
            const previousOverride = scene.overrideMaterial;
            scene.overrideMaterial = depthMaterial;
            renderer.setRenderTarget(renderTarget);
                renderer.render(scene, camera);
            blurPass(renderer, options.blur);
            blurPass(renderer, options.blur * 0.4);
            renderer.setRenderTarget(null);
            scene.overrideMaterial = previousOverride;
            group.visible = true;
        },
        dispose() {
            renderTarget.dispose();
            renderTargetBlur.dispose();
            planeGeometry.dispose();
            depthMaterial.dispose();
            horizontal.dispose();
            vertical.dispose();
            shadowMaterial.dispose();
        },
    };
}

/** Render a model layer exactly as the 3D View Editor shows it with these settings. */
export async function bakeModelWithSettings(
    modelUrl: string,
    settings: ThreeDSettings,
    outSize: { width: number; height: number } = { width: 1024, height: 1024 },
): Promise<HTMLCanvasElement> {
    const s = { ...EDITOR_LIGHTING_FALLBACKS, ...settings };
    const [model, environment] = await Promise.all([
        loadModel(modelUrl),
        loadEnvironment(environmentFile(s.environment)).catch(() => null),
    ]);
    model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // <Center> measures the model before the editor applies rotation and
    // scale, then offsets it by that centre: world = R·S·p − centre.
    const bounds = new THREE.Box3().setFromObject(model);
    const centre = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius || 1;
    const modelScale = s.modelScale ?? 1;
    const transform = new THREE.Group();
    transform.rotation.y = ((s.modelRotationY ?? 0) * Math.PI) / 180;
    transform.scale.setScalar(modelScale);
    transform.add(model);
    const centred = new THREE.Group();
    centred.position.copy(centre).negate();
    centred.add(transform);

    const effectiveRadius = Math.max(0.5, radius * modelScale);
    const groundY = (bounds.min.y - centre.y) * modelScale;
    const shadowExtent = Math.max(3, effectiveRadius * 3);
    const floorSize = Math.max(12, effectiveRadius * 12);

    const scene = new THREE.Scene();
    if (environment) scene.environment = environment;
    scene.add(centred);
    scene.add(new THREE.AmbientLight(0xffffff, s.ambientIntensity));

    const sun = new THREE.DirectionalLight(s.lightColor, s.lightIntensity);
    sun.position.set(s.lightPosition.x, s.lightPosition.y, s.lightPosition.z);
    sun.castShadow = s.castShadowEnabled;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = Math.max(1, s.castShadowBlur * 0.6);
    sun.shadow.blurSamples = Math.min(32, Math.max(8, Math.round(s.castShadowBlur / 2) + 8));
    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = Math.max(50, sun.position.length() + effectiveRadius * 6);
    sun.shadow.camera.left = -shadowExtent;
    sun.shadow.camera.right = shadowExtent;
    sun.shadow.camera.top = shadowExtent;
    sun.shadow.camera.bottom = -shadowExtent;
    scene.add(sun);

    // drei <Stage intensity={envIntensity}> lights; its shadows are off in the editor.
    scene.add(new THREE.AmbientLight(0xffffff, s.envIntensity / 3));
    const spot = new THREE.SpotLight(0xffffff, s.envIntensity * 2);
    spot.penumbra = 1;
    spot.position.set(STAGE_MAIN[0] * radius, STAGE_MAIN[1] * radius, STAGE_MAIN[2] * radius);
    scene.add(spot);
    const fill = new THREE.PointLight(0xffffff, s.envIntensity);
    fill.position.set(STAGE_FILL[0] * radius, STAGE_FILL[1] * radius, STAGE_FILL[2] * radius);
    scene.add(fill);

    if (s.castShadowEnabled) {
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(floorSize, floorSize),
            new THREE.ShadowMaterial({ opacity: s.castShadowIntensity, transparent: true }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = groundY;
        floor.receiveShadow = true;
        scene.add(floor);
    }

    const contact = s.contactShadowEnabled
        ? createContactShadow({
            y: groundY + 0.02,
            scale: Math.max(3.5, effectiveRadius * 5),
            far: Math.max(1.2, effectiveRadius * 1.5),
            blur: s.contactShadowBlur,
            opacity: s.contactShadowIntensity,
        })
        : null;
    if (contact) scene.add(contact.group);

    const camera = new THREE.PerspectiveCamera(45, outSize.width / outSize.height, 0.1, 1000);
    const eye = s.cameraPosition ?? { x: 0, y: 0, z: 4 };
    const target = s.cameraTarget ?? { x: 0, y: 0, z: 0 };
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(target.x, target.y, target.z);

    const renderer = getRenderer();
    renderer.setSize(outSize.width, outSize.height, false);
    scene.updateMatrixWorld(true);
    try {
        contact?.render(renderer, scene);
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        const out = document.createElement('canvas');
        out.width = outSize.width;
        out.height = outSize.height;
        out.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
        return out;
    } finally {
        contact?.dispose();
        scene.traverse((object) => {
            // The model shares geometry and materials with the cached glTF, so only the helpers go.
            if (!(object as THREE.Mesh).isMesh || model.getObjectById(object.id)) return;
            const mesh = object as THREE.Mesh;
            mesh.geometry.dispose();
            (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
        });
        sun.shadow.dispose();
    }
}
