// WebGL projective warp renderer for the 3D layer's unwarp/rewarp round-trip.
// A homography cannot be expressed with canvas2D (affine-only), so both
// directions render a full-output quad whose fragment shader maps output
// pixels through a 3x3 matrix into the source texture.

import {
    applyHomography,
    computeHomography,
    invertMat3,
    rescaleHomography,
    type Mat3,
    type Vec2,
} from './homography';
import type { ThreeDLayerRewarpSettings } from '@/types';

export type WarpSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// uH maps output pixel coords -> source pixel coords (projective).
const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform mat3 uH;
uniform vec2 uOutSize;
uniform vec2 uSrcSize;
void main() {
    vec2 outPx = vec2(gl_FragCoord.x, uOutSize.y - gl_FragCoord.y);
    vec3 s = uH * vec3(outPx, 1.0);
    vec2 srcPx = s.xy / s.z;
    vec2 uv = srcPx / uSrcSize;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0);
    } else {
        gl_FragColor = texture2D(uTex, uv);
    }
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`3D layer warp shader: ${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
}

function sourceSize(src: WarpSource): { width: number; height: number } {
    if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
        return { width: src.naturalWidth, height: src.naturalHeight };
    }
    return { width: src.width, height: src.height };
}

/**
 * Render `source` through homography `hOutToSrc` (output px -> source px)
 * into a canvas of `outSize`. Supersamples up to 3x on minification and
 * area-downscales, since single-tap sampling aliases when the quad shrinks.
 */
export function renderProjective(
    source: WarpSource,
    hOutToSrc: Mat3,
    outSize: { width: number; height: number },
    supersample = 1,
): HTMLCanvasElement {
    const ss = Math.max(1, Math.min(3, Math.round(supersample)));
    const rw = Math.min(outSize.width * ss, 8192);
    const rh = Math.min(outSize.height * ss, 8192);
    const glCanvas = document.createElement('canvas');
    glCanvas.width = rw;
    glCanvas.height = rh;
    const gl = glCanvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('3D layer warp: WebGL unavailable');

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(`3D layer warp link: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // The render-space homography consumes render pixels, not output pixels.
    const srcSz = sourceSize(source);
    const hRender = rescaleHomography(hOutToSrc, outSize, { width: rw, height: rh }, srcSz, srcSz);
    // rescaleHomography above maps out2->src given out->src? It rescales the
    // input side: H consumes (rw,rh)-space coords proportional to outSize.
    gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'uH'), false, transpose3(hRender));
    gl.uniform2f(gl.getUniformLocation(prog, 'uOutSize'), rw, rh);
    gl.uniform2f(gl.getUniformLocation(prog, 'uSrcSize'), srcSz.width, srcSz.height);

    gl.viewport(0, 0, rw, rh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Always copy into a 2D canvas: losing the GL context below wipes the
    // drawing buffer, so the GL canvas itself must not be handed out.
    const down = document.createElement('canvas');
    down.width = outSize.width;
    down.height = outSize.height;
    const ctx = down.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(glCanvas, 0, 0, outSize.width, outSize.height);
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    return down;
}

// GLSL mat3 uniforms are column-major; our Mat3 is row-major.
function transpose3(m: Mat3): Float32Array {
    return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

/** Unwarp: flatten the quad region of `source` into a flatSize canvas. */
export function unwarpQuad(
    source: WarpSource,
    quadPx: Vec2[],
    flatSize: { width: number; height: number },
): HTMLCanvasElement {
    const hFlatToSrc = computeHomography(
        [[0, 0], [flatSize.width, 0], [flatSize.width, flatSize.height], [0, flatSize.height]],
        quadPx,
    );
    if (!hFlatToSrc) throw new Error('3D layer unwarp: degenerate quad');
    // Minification check: if the quad is larger than the flat image,
    // supersample the flatten to keep detail from aliasing.
    const quadW = Math.hypot(quadPx[1][0] - quadPx[0][0], quadPx[1][1] - quadPx[0][1]);
    const ss = quadW > flatSize.width * 1.5 ? (quadW > flatSize.width * 2.5 ? 3 : 2) : 1;
    return renderProjective(source, hFlatToSrc, flatSize, ss);
}

export type RewarpResult = { composite: HTMLCanvasElement; element: HTMLCanvasElement };

/**
 * Rewarp: project the edited flat image back onto the source quad.
 * The edit may be any resolution (upscaled/sampler-snapped) — the homography
 * is rescaled to sample it natively rather than resizing the edit.
 */
export function rewarpQuad(
    original: WarpSource,
    edited: WarpSource,
    quadPx: Vec2[],
    flatSize: { width: number; height: number },
    settings: ThreeDLayerRewarpSettings,
): RewarpResult {
    const origSz = sourceSize(original);
    const editSz = sourceSize(edited);
    const hFlatToSrc = computeHomography(
        [[0, 0], [flatSize.width, 0], [flatSize.width, flatSize.height], [0, flatSize.height]],
        quadPx,
    );
    if (!hFlatToSrc) throw new Error('3D layer rewarp: degenerate quad');
    const hSrcToFlat = invertMat3(hFlatToSrc);
    if (!hSrcToFlat) throw new Error('3D layer rewarp: singular homography');
    // Sample the edit at its native resolution: scale flat-space coords up.
    const hSrcToEdit = rescaleHomography(hSrcToFlat, origSz, origSz, flatSize, editSz);

    // Minification: how much the edit shrinks into the quad footprint.
    const minify = Math.max(editSz.width / Math.max(flatSize.width, 1), 1);
    const ss = minify > 1.5 ? (minify > 2.5 ? 3 : 2) : 1;
    const warped = renderProjective(edited, hSrcToEdit, origSz, ss);

    // Alpha mask: the quad interior, feathered inward only — a symmetric
    // feather bleeds alpha into the black outside the quad (dark halo).
    const masked = applyQuadMask(warped, quadPx, origSz, settings.feather, settings.edgeHardness);

    let element = masked;
    if (settings.matchColors) {
        element = matchColorsLab(element, original, quadPx, origSz);
    }

    const composite = document.createElement('canvas');
    composite.width = origSz.width;
    composite.height = origSz.height;
    const ctx = composite.getContext('2d')!;
    ctx.drawImage(original as CanvasImageSource, 0, 0, origSz.width, origSz.height);
    ctx.drawImage(element, 0, 0);
    return { composite, element };
}

/** Feathered (inward-only) quad mask multiplied into the warped element. */
function applyQuadMask(
    warped: HTMLCanvasElement,
    quadPx: Vec2[],
    size: { width: number; height: number },
    feather: number,
    edgeHardness: number,
): HTMLCanvasElement {
    const mask = document.createElement('canvas');
    mask.width = size.width;
    mask.height = size.height;
    const mctx = mask.getContext('2d')!;
    const drawQuad = (ctx: CanvasRenderingContext2D) => {
        ctx.beginPath();
        ctx.moveTo(quadPx[0][0], quadPx[0][1]);
        for (let i = 1; i < 4; i++) ctx.lineTo(quadPx[i][0], quadPx[i][1]);
        ctx.closePath();
        ctx.fill();
    };
    mctx.fillStyle = '#fff';
    if (feather > 0.01) {
        // Blur the hard mask, then remap [0.5..1] -> [0..1]: the ramp lands
        // entirely inside the quad (inward feather) without an erode pass.
        mctx.filter = `blur(${feather}px)`;
        drawQuad(mctx);
        mctx.filter = 'none';
        const img = mctx.getImageData(0, 0, size.width, size.height);
        const d = img.data;
        const hard = hardQuadTest(quadPx);
        for (let i = 0; i < d.length; i += 4) {
            const px = (i / 4) % size.width;
            const py = Math.floor(i / 4 / size.width);
            if (!hard(px, py)) { d[i + 3] = 0; continue; }
            const a = d[i + 3] / 255;
            d[i + 3] = Math.round(Math.min(1, Math.max(0, (a - 0.5) * 2)) * 255);
        }
        applyEdgeHardness(d, edgeHardness);
        mctx.putImageData(img, 0, 0);
    } else {
        drawQuad(mctx);
    }
    const out = document.createElement('canvas');
    out.width = size.width;
    out.height = size.height;
    const octx = out.getContext('2d')!;
    octx.drawImage(warped, 0, 0);
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(mask, 0, 0);
    return out;
}

/** Histogram-style alpha remap that kills low-alpha ghosting fringe. */
function applyEdgeHardness(d: Uint8ClampedArray, hardness: number) {
    if (hardness <= 0.001) return;
    const lo = hardness * 0.45;
    const hi = 1 - hardness * 0.45;
    for (let i = 3; i < d.length; i += 4) {
        const a = d[i] / 255;
        d[i] = Math.round(Math.min(1, Math.max(0, (a - lo) / Math.max(hi - lo, 1e-3))) * 255);
    }
}

function hardQuadTest(quad: Vec2[]): (x: number, y: number) => boolean {
    return (x, y) => {
        let sign = 0;
        for (let i = 0; i < 4; i++) {
            const [ax, ay] = quad[i];
            const [bx, by] = quad[(i + 1) % 4];
            const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
            const s = Math.sign(cross);
            if (s === 0) continue;
            if (sign === 0) sign = s;
            else if (s !== sign) return false;
        }
        return true;
    };
}

/**
 * Reinhard statistics transfer in float LAB, measured over the masked quad
 * region of both images (measuring the whole background is a no-op when the
 * composite preserves the original outside the mask).
 */
function matchColorsLab(
    element: HTMLCanvasElement,
    original: WarpSource,
    quadPx: Vec2[],
    size: { width: number; height: number },
): HTMLCanvasElement {
    const origCanvas = document.createElement('canvas');
    origCanvas.width = size.width;
    origCanvas.height = size.height;
    origCanvas.getContext('2d')!.drawImage(original as CanvasImageSource, 0, 0, size.width, size.height);
    const octx = origCanvas.getContext('2d')!;
    const ectx = element.getContext('2d')!;
    const oimg = octx.getImageData(0, 0, size.width, size.height);
    const eimg = ectx.getImageData(0, 0, size.width, size.height);
    const inQuad = hardQuadTest(quadPx);

    const stats = (data: Uint8ClampedArray, useAlpha: boolean) => {
        const mean = [0, 0, 0];
        const m2 = [0, 0, 0];
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (useAlpha && data[i + 3] < 200) continue;
            const px = (i / 4) % size.width;
            const py = Math.floor(i / 4 / size.width);
            if (!inQuad(px, py)) continue;
            const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
            n++;
            for (let c = 0; c < 3; c++) {
                const delta = lab[c] - mean[c];
                mean[c] += delta / n;
                m2[c] += delta * (lab[c] - mean[c]);
            }
        }
        const std = m2.map((v) => Math.sqrt(v / Math.max(n - 1, 1)));
        return { mean, std, n };
    };
    const target = stats(oimg.data, false);
    const src = stats(eimg.data, true);
    if (target.n < 16 || src.n < 16) return element;

    const d = eimg.data;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const lab = rgbToLab(d[i], d[i + 1], d[i + 2]);
        for (let c = 0; c < 3; c++) {
            const s = src.std[c] > 1e-3 ? target.std[c] / src.std[c] : 1;
            lab[c] = (lab[c] - src.mean[c]) * s + target.mean[c];
        }
        const [r, g, b] = labToRgb(lab[0], lab[1], lab[2]);
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    ectx.putImageData(eimg, 0, 0);
    return element;
}

// Float sRGB <-> CIELAB (D65). Kept local: fabric filters don't expose one,
// and going through uint8 intermediates (as cv2 does) posterizes the match.
function rgbToLab(r8: number, g8: number, b8: number): [number, number, number] {
    const lin = (v: number) => {
        const c = v / 255;
        return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
    };
    const r = lin(r8), g = lin(g8), b = lin(b8);
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToRgb(L: number, a: number, bb: number): [number, number, number] {
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - bb / 200;
    const fi = (t: number) => {
        const t3 = t * t * t;
        return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
    };
    const x = fi(fx) * 0.95047;
    const y = fi(fy);
    const z = fi(fz) * 1.08883;
    let r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    let g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
    let b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
    const enc = (v: number) => {
        const c = v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v;
        return Math.round(Math.min(1, Math.max(0, c)) * 255);
    };
    r = enc(r); g = enc(g); b = enc(b);
    return [r as number, g as number, b as number];
}

/** Convenience: normalized corners [0,1] -> pixel corners for an image. */
export function cornersToPx(corners: Vec2[], size: { width: number; height: number }): Vec2[] {
    return corners.map(([x, y]) => [x * size.width, y * size.height] as Vec2);
}

export function defaultCorners(): Vec2[] {
    return [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]];
}

export { applyHomography };
