/**
 * @jest-environment jsdom
 */

import * as THREE from 'three';
import { renderSceneToDataUrl } from '@/lib/three/sceneCapture';

/**
 * A renderer that records its state the way the real one holds it, so a test
 * can assert the capture left that state as it found it. `pixels` is what
 * `readRenderTargetPixels` hands back — rows bottom-up, as WebGL does.
 */
const createRenderer = (pixels: number[] = []) => {
    const state = {
        target: null as THREE.WebGLRenderTarget | null,
        size: new THREE.Vector2(800, 600),
        pixelRatio: 2,
        viewport: new THREE.Vector4(0, 0, 800, 600),
        scissor: new THREE.Vector4(10, 20, 30, 40),
        scissorTest: true,
    };
    const renderedInto: Array<THREE.WebGLRenderTarget | null> = [];
    const gl = {
        getRenderTarget: () => state.target,
        setRenderTarget: (target: THREE.WebGLRenderTarget | null) => { state.target = target; },
        getSize: (out: THREE.Vector2) => out.copy(state.size),
        setSize: (width: number, height: number) => { state.size.set(width, height); },
        getPixelRatio: () => state.pixelRatio,
        setPixelRatio: (ratio: number) => { state.pixelRatio = ratio; },
        getViewport: (out: THREE.Vector4) => out.copy(state.viewport),
        setViewport: (value: THREE.Vector4) => { state.viewport.copy(value); },
        getScissor: (out: THREE.Vector4) => out.copy(state.scissor),
        setScissor: (value: THREE.Vector4) => { state.scissor.copy(value); },
        getScissorTest: () => state.scissorTest,
        setScissorTest: (value: boolean) => { state.scissorTest = value; },
        clear: jest.fn(),
        render: jest.fn(() => { renderedInto.push(state.target); }),
        readRenderTargetPixels: jest.fn((
            _target: unknown, _x: number, _y: number, _w: number, _h: number, buffer: Uint8Array,
        ) => { buffer.set(pixels); }),
    };
    return { gl: gl as unknown as THREE.WebGLRenderer, state, renderedInto, mock: gl };
};

const expectRestored = (state: ReturnType<typeof createRenderer>['state'], camera: THREE.PerspectiveCamera) => {
    expect(state.target).toBeNull();
    expect(state.size.toArray()).toEqual([800, 600]);
    expect(state.pixelRatio).toBe(2);
    expect(state.viewport.toArray()).toEqual([0, 0, 800, 600]);
    expect(state.scissor.toArray()).toEqual([10, 20, 30, 40]);
    expect(state.scissorTest).toBe(true);
    expect(camera.aspect).toBeCloseTo(800 / 600);
};

describe('renderSceneToDataUrl', () => {
    const scene = new THREE.Scene();
    let camera: THREE.PerspectiveCamera;
    let getContext: jest.SpyInstance;

    beforeEach(() => {
        camera = new THREE.PerspectiveCamera(50, 800 / 600);
    });

    afterEach(() => {
        getContext?.mockRestore();
    });

    const stub2dContext = () => {
        const put = jest.fn();
        getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            createImageData: (width: number, height: number) => ({
                width, height, data: new Uint8ClampedArray(width * height * 4),
            }),
            putImageData: put,
        } as unknown as CanvasRenderingContext2D);
        jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
        return put;
    };

    it('renders offscreen at the requested size with the matching camera aspect', () => {
        stub2dContext();
        const { gl, renderedInto, mock } = createRenderer();
        let aspectDuringRender = 0;
        mock.render.mockImplementationOnce(() => {
            aspectDuringRender = camera.aspect;
            renderedInto.push(gl.getRenderTarget());
        });

        expect(renderSceneToDataUrl(gl, scene, camera, 4, 2)).toBe('data:image/png;base64,AAAA');

        // Into a target, never the screen — or the preview would flash.
        expect(renderedInto[0]).toBeInstanceOf(THREE.WebGLRenderTarget);
        expect(renderedInto[0]?.width).toBe(4);
        expect(renderedInto[0]?.height).toBe(2);
        expect(aspectDuringRender).toBe(2);
    });

    it('puts every piece of renderer and camera state back afterwards', () => {
        stub2dContext();
        const { gl, state } = createRenderer();
        renderSceneToDataUrl(gl, scene, camera, 4, 2);
        expectRestored(state, camera);
    });

    it('restores state and returns an empty string when no 2D context exists', () => {
        getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        const { gl, state } = createRenderer();
        expect(renderSceneToDataUrl(gl, scene, camera, 4, 2)).toBe('');
        expectRestored(state, camera);
    });

    it('flips rows, because WebGL reads bottom-up and a canvas is top-down', () => {
        const put = stub2dContext();
        // 1 px wide, 2 px tall: WebGL row 0 (bottom) is red, row 1 (top) is blue.
        const { gl } = createRenderer([255, 0, 0, 255, 0, 0, 255, 255]);
        renderSceneToDataUrl(gl, scene, camera, 1, 2);
        const written = put.mock.calls[0][0] as ImageData;
        expect(Array.from(written.data)).toEqual([0, 0, 255, 255, 255, 0, 0, 255]);
    });
});
