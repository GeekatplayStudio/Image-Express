import * as THREE from 'three';

const rendered: Array<{ scene: THREE.Scene; camera: THREE.Camera; target: unknown }> = [];
const renderers: FakeRenderer[] = [];

class FakeRenderer {
    domElement = document.createElement('canvas');
    shadowMap = { enabled: false, type: 0 };
    toneMapping: THREE.ToneMapping = THREE.NoToneMapping;
    outputColorSpace = '';
    private target: unknown = null;
    constructor() { renderers.push(this); }
    getContext() { return { isContextLost: () => false }; }
    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    setRenderTarget(target: unknown) { this.target = target; }
    render(scene: THREE.Scene, camera: THREE.Camera) { rendered.push({ scene, camera, target: this.target }); }
    dispose() {}
}

jest.mock('three', () => ({ ...jest.requireActual('three'), WebGLRenderer: jest.fn().mockImplementation(() => new FakeRenderer()) }));
jest.mock('three/examples/jsm/loaders/EXRLoader.js', () => ({
    EXRLoader: class { loadAsync() { return Promise.resolve(new (jest.requireActual('three').DataTexture)()); } },
}));
jest.mock('three/examples/jsm/shaders/HorizontalBlurShader.js', () => ({
    HorizontalBlurShader: { uniforms: { tDiffuse: { value: null }, h: { value: 0 } }, vertexShader: '', fragmentShader: '' },
}));
jest.mock('three/examples/jsm/shaders/VerticalBlurShader.js', () => ({
    VerticalBlurShader: { uniforms: { tDiffuse: { value: null }, v: { value: 0 } }, vertexShader: '', fragmentShader: '' },
}));
jest.mock('@/lib/three/gltfLoading', () => ({
    environmentFile: (name: string) => `/three/hdri/${name}.exr`,
    createGltfLoader: () => ({
        loadAsync: () => {
            const T = jest.requireActual('three');
            const scene = new T.Group();
            const box = new T.Mesh(new T.BoxGeometry(1, 2, 1), new T.MeshStandardMaterial());
            box.position.y = 1; // a model resting on y=0, centre at y=1
            scene.add(box);
            return Promise.resolve({ scene });
        },
    }),
}));

import { bakeModelWithSettings } from '../modelSettingsBake';
import type { ThreeDSettings } from '@/types';

const SETTINGS: ThreeDSettings = {
    lightPosition: { x: 3, y: 4, z: 5 },
    lightIntensity: 1.5,
    lightColor: '#ffeedd',
    castShadowEnabled: true,
    castShadowBlur: 22,
    castShadowIntensity: 0.35,
    contactShadowEnabled: true,
    contactShadowBlur: 8,
    contactShadowIntensity: 0.6,
    resolution: { width: 256, height: 256 },
    ambientIntensity: 0.4,
    envIntensity: 0.9,
    environment: 'studio',
    cameraPosition: { x: 0, y: 1, z: 6 },
    cameraTarget: { x: 0, y: 0, z: 0 },
};

beforeAll(() => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: jest.fn() } as never);
});

beforeEach(() => { rendered.length = 0; });

const finalFrame = () => rendered.filter((entry) => entry.target === null && entry.scene instanceof THREE.Scene).at(-1)!;

describe('bakeModelWithSettings', () => {
    it('renders with the editor scene: environment, Stage lights, tone mapping and contact shadow', async () => {
        await bakeModelWithSettings('/model.glb', SETTINGS, { width: 256, height: 256 });
        const { scene } = finalFrame();

        expect(scene.environment).toBeInstanceOf(THREE.DataTexture);
        expect(renderers[0].toneMapping).toBe(THREE.ACESFilmicToneMapping);

        const lights = scene.children.filter((child): child is THREE.Light => (child as THREE.Light).isLight);
        const intensities = (type: string) => lights.filter((light) => light.type === type).map((light) => light.intensity);
        expect(intensities('AmbientLight').sort()).toEqual([0.3, 0.4]);   // editor ambient + Stage ambient (0.9 / 3)
        expect(intensities('SpotLight')).toEqual([1.8]);                  // Stage main light, 0.9 × 2
        expect(intensities('PointLight')).toEqual([0.9]);                 // Stage fill light
        const sun = lights.find((light) => light.type === 'DirectionalLight') as THREE.DirectionalLight;
        expect(sun.intensity).toBe(1.5);
        expect(sun.position.toArray()).toEqual([3, 4, 5]);

        // The contact shadow pass ran into its render target before the final frame.
        expect(rendered.some((entry) => entry.target !== null)).toBe(true);
    });

    it('centres the model like the editor and lays the shadow floor at its base', async () => {
        await bakeModelWithSettings('/model.glb', SETTINGS, { width: 256, height: 256 });
        const { scene } = finalFrame();
        const box = new THREE.Box3();
        scene.traverse((object) => {
            if ((object as THREE.Mesh).isMesh && (object as THREE.Mesh).geometry.type === 'BoxGeometry') box.setFromObject(object);
        });
        expect(box.getCenter(new THREE.Vector3()).toArray()).toEqual([0, 0, 0]);
        const floor = scene.children.find((child) => (child as THREE.Mesh).material instanceof THREE.ShadowMaterial)!;
        expect(floor.position.y).toBeCloseTo(-1);
    });

    it('reuses one renderer across bakes so a slider drag cannot exhaust WebGL contexts', async () => {
        await bakeModelWithSettings('/model.glb', SETTINGS);
        await bakeModelWithSettings('/model.glb', { ...SETTINGS, lightIntensity: 2 });
        expect(renderers).toHaveLength(1);
    });
});
