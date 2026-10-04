import * as THREE from 'three';

export type CaptureContext = {
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
};

export const MIN_CAPTURE_SIZE = 64;
export const MAX_CAPTURE_SIZE = 8192;

/** A capture dimension the renderer can actually produce; `fallback` for anything unreadable. */
export const clampCaptureSize = (value: unknown, fallback = 2048): number => {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(MAX_CAPTURE_SIZE, Math.max(MIN_CAPTURE_SIZE, Math.round(parsed)));
};

/**
 * Render a scene at an exact pixel size and return it as a PNG data URL,
 * leaving the live renderer exactly as it was found.
 *
 * The frame is drawn to the renderer's own canvas and copied out, not into a
 * render target. A render target skips tone mapping, the sRGB output transform
 * and the canvas's anti-aliasing, so the captured layer came out darker, flatter
 * and more jagged than the preview it was captured from. Drawing the same way
 * the preview does is what makes the two match. (This is the approach the
 * Photoshop 3D plugin settled on after forking this editor.)
 *
 * Pixel ratio is forced to 1 so the result is `width` × `height` and not that
 * times the display's scale. The renderer is shared with the on-screen preview,
 * so every piece of state touched — size, pixel ratio, viewport, scissor,
 * camera aspect, the hidden helper — is put back in a `finally`, and the
 * preview is redrawn before the browser paints, so nothing flashes.
 *
 * Returns '' when no 2D context is available to encode with.
 */
export const renderSceneToDataUrl = (
    gl: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
    options: { hideObjectNamed?: string } = {},
) => {
    const perspective = camera as THREE.PerspectiveCamera;
    const originalSize = new THREE.Vector2();
    gl.getSize(originalSize);
    const originalPixelRatio = gl.getPixelRatio();
    const originalAspect = perspective.aspect;
    const originalViewport = new THREE.Vector4();
    const originalScissor = new THREE.Vector4();
    gl.getViewport(originalViewport);
    gl.getScissor(originalScissor);
    const originalScissorTest = gl.getScissorTest();
    const originalTarget = gl.getRenderTarget();
    const helper = options.hideObjectNamed ? scene.getObjectByName(options.hideObjectNamed) : undefined;
    const helperWasVisible = helper?.visible ?? false;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    try {
        if (helper) helper.visible = false;
        gl.setRenderTarget(null);
        gl.setPixelRatio(1);
        gl.setSize(width, height, false);
        perspective.aspect = width / height;
        perspective.updateProjectionMatrix();
        gl.render(scene, camera);
        ctx.drawImage(gl.domElement, 0, 0, width, height);
    } finally {
        if (helper) helper.visible = helperWasVisible;
        gl.setPixelRatio(originalPixelRatio);
        gl.setSize(originalSize.x, originalSize.y, false);
        perspective.aspect = originalAspect;
        perspective.updateProjectionMatrix();
        gl.setViewport(originalViewport);
        gl.setScissor(originalScissor);
        gl.setScissorTest(originalScissorTest);
        gl.setRenderTarget(originalTarget);
        // Put the preview back in the same task the capture ran in.
        gl.render(scene, camera);
    }

    return canvas.toDataURL('image/png');
};
