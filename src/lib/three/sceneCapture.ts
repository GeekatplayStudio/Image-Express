import * as THREE from 'three';

export type CaptureContext = {
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
};

/**
 * Render a scene offscreen at an exact pixel size and return it as a PNG data
 * URL, leaving the live renderer exactly as it was found.
 *
 * The renderer is shared with the on-screen preview, so every piece of state
 * touched here — size, pixel ratio, target, viewport, scissor, camera aspect —
 * is put back, on the failure path too. Returns '' when no 2D context is
 * available to encode with.
 */
export const renderSceneToDataUrl = (
    gl: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number
) => {
    const target = new THREE.WebGLRenderTarget(width, height);
    const originalTarget = gl.getRenderTarget();
    const originalSize = new THREE.Vector2();
    gl.getSize(originalSize);
    const originalPixelRatio = gl.getPixelRatio();
    const originalAspect = (camera as THREE.PerspectiveCamera).aspect;
    const originalViewport = new THREE.Vector4();
    const originalScissor = new THREE.Vector4();
    gl.getViewport(originalViewport);
    gl.getScissor(originalScissor);
    const originalScissorTest = gl.getScissorTest();

    const restore = () => {
        gl.setRenderTarget(originalTarget);
        gl.setSize(originalSize.x, originalSize.y, false);
        gl.setPixelRatio(originalPixelRatio);
        (camera as THREE.PerspectiveCamera).aspect = originalAspect;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        gl.setViewport(originalViewport);
        gl.setScissor(originalScissor);
        gl.setScissorTest(originalScissorTest);
        target.dispose();
    };

    gl.setPixelRatio(1);
    gl.setSize(width, height, false);
    (camera as THREE.PerspectiveCamera).aspect = width / height;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, camera);

    const buffer = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, buffer);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        restore();
        return '';
    }

    // WebGL reads rows bottom-up; canvas image data is top-down.
    const imageData = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const src = ((height - y - 1) * width + x) * 4;
            const dst = (y * width + x) * 4;
            imageData.data[dst] = buffer[src];
            imageData.data[dst + 1] = buffer[src + 1];
            imageData.data[dst + 2] = buffer[src + 2];
            imageData.data[dst + 3] = buffer[src + 3];
        }
    }
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');

    restore();
    return dataUrl;
};
