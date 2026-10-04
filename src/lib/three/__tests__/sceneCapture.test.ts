/**
 * @jest-environment jsdom
 */

import * as THREE from 'three';
import { clampCaptureSize, renderSceneToDataUrl } from '@/lib/three/sceneCapture';

/**
 * A renderer that records its state the way the real one holds it, so a test
 * can assert the capture left that state as it found it.
 */
const createRenderer = () => {
    const state = {
        target: null as THREE.WebGLRenderTarget | null,
        size: new THREE.Vector2(800, 600),
        pixelRatio: 2,
        viewport: new THREE.Vector4(0, 0, 800, 600),
        scissor: new THREE.Vector4(10, 20, 30, 40),
        scissorTest: true,
    };
    const frames: Array<{ size: number[]; pixelRatio: number; target: unknown }> = [];
    const gl = {
        domElement: document.createElement('canvas'),
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
        render: jest.fn(() => {
            frames.push({ size: state.size.toArray(), pixelRatio: state.pixelRatio, target: state.target });
        }),
    };
    return { gl: gl as unknown as THREE.WebGLRenderer, state, frames, mock: gl };
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
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let getContext: jest.SpyInstance;
    let drawImage: jest.Mock;

    beforeEach(() => {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(50, 800 / 600);
        drawImage = jest.fn();
        getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
        jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('renders at exactly the requested size, whatever the display scale', () => {
        const { gl, frames, mock } = createRenderer();
        let aspectDuringRender = 0;
        mock.render.mockImplementationOnce(() => {
            aspectDuringRender = camera.aspect;
            frames.push({ size: [gl.getSize(new THREE.Vector2()).x, gl.getSize(new THREE.Vector2()).y], pixelRatio: gl.getPixelRatio(), target: gl.getRenderTarget() });
        });

        expect(renderSceneToDataUrl(gl, scene, camera, 4, 2)).toBe('data:image/png;base64,AAAA');

        // Pixel ratio 1: a 2x display must not turn 4x2 into 8x4.
        expect(frames[0]).toEqual({ size: [4, 2], pixelRatio: 1, target: null });
        expect(aspectDuringRender).toBe(2);
    });

    it('draws to the canvas, not a render target, so tone mapping and anti-aliasing apply', () => {
        const { gl, frames } = createRenderer();
        gl.setRenderTarget(new THREE.WebGLRenderTarget(1, 1));
        renderSceneToDataUrl(gl, scene, camera, 4, 2);
        expect(frames[0].target).toBeNull();
        expect(drawImage).toHaveBeenCalledWith(gl.domElement, 0, 0, 4, 2);
    });

    it('puts every piece of renderer and camera state back, and redraws the preview', () => {
        const { gl, state, frames } = createRenderer();
        renderSceneToDataUrl(gl, scene, camera, 4, 2);
        expectRestored(state, camera);
        expect(frames).toHaveLength(2);
        expect(frames[1]).toEqual({ size: [800, 600], pixelRatio: 2, target: null });
    });

    it('restores state when the render throws', () => {
        const { gl, state, mock } = createRenderer();
        mock.render.mockImplementationOnce(() => { throw new Error('context lost'); });
        expect(() => renderSceneToDataUrl(gl, scene, camera, 4, 2)).toThrow('context lost');
        expectRestored(state, camera);
    });

    it('touches nothing and returns an empty string when no 2D context exists', () => {
        getContext.mockReturnValue(null);
        const { gl, state, mock } = createRenderer();
        expect(renderSceneToDataUrl(gl, scene, camera, 4, 2)).toBe('');
        expect(mock.render).not.toHaveBeenCalled();
        expectRestored(state, camera);
    });

    it('hides a named helper for the captured frame only', () => {
        const helper = new THREE.Group();
        helper.name = 'gizmo';
        scene.add(helper);
        const { gl, mock } = createRenderer();
        const visibleDuring: boolean[] = [];
        mock.render.mockImplementation(() => { visibleDuring.push(helper.visible); });

        renderSceneToDataUrl(gl, scene, camera, 4, 2, { hideObjectNamed: 'gizmo' });

        expect(visibleDuring).toEqual([false, true]);
    });
});

describe('clampCaptureSize', () => {
    it('keeps a size inside what the renderer can produce', () => {
        expect(clampCaptureSize(2048)).toBe(2048);
        expect(clampCaptureSize(10)).toBe(64);
        expect(clampCaptureSize(100000)).toBe(8192);
        expect(clampCaptureSize('1024')).toBe(1024);
    });

    it('falls back for an empty or unreadable value', () => {
        expect(clampCaptureSize('')).toBe(2048);
        expect(clampCaptureSize(Number.NaN, 512)).toBe(512);
    });
});
