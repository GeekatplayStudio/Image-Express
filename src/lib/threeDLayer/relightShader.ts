// Screen-space relighting for 3D layers: normals + depth + lights -> relit
// image. Shading model (after NKD-VFX-Tools, reimplemented from scratch):
//   result = rgb * (ambient + Σ per-light)
// Directional lights use plain Lambert; point lights live in screen space
// (x/y in UV, z against disparity depth) with a windowed-quadratic falloff
// that reaches exactly 0 at the radius, wrapped diffuse for soft fill, and
// optional ray-marched screen-space shadows over the depth height field.

import type { ThreeDLayerLight } from '@/types';

export const MAX_RELIGHT_LIGHTS = 8;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
    // Flip v so uv (0,0) is the image's top-left: textures are uploaded
    // unflipped (row 0 = top) while clip-space y points up.
    vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uNormals;
uniform sampler2D uDepth;
uniform vec3 uAmbient;
uniform int uLightCount;
uniform int uKind[${MAX_RELIGHT_LIGHTS}];        // 0 directional, 1 point
uniform vec3 uColor[${MAX_RELIGHT_LIGHTS}];
uniform float uIntensity[${MAX_RELIGHT_LIGHTS}];
uniform vec3 uPosDir[${MAX_RELIGHT_LIGHTS}];     // point: (x,y,z) | directional: unit L
uniform float uRadius[${MAX_RELIGHT_LIGHTS}];
uniform float uSoftness[${MAX_RELIGHT_LIGHTS}];
uniform float uShadow[${MAX_RELIGHT_LIGHTS}];    // strength, 0 = off
uniform float uShadowSoft[${MAX_RELIGHT_LIGHTS}];
uniform float uShadowRange[${MAX_RELIGHT_LIGHTS}];

const int SHADOW_STEPS = 24;

float sceneDepth(vec2 uv) {
    return texture2D(uDepth, uv).r;   // disparity: near = bright
}

// March from this pixel toward the light across the depth height field;
// occlusion accumulates where the field rises above the ray.
float shadowFactor(vec2 uv, vec2 toLight2D, float ownDepth, float strength, float softness, float range) {
    if (strength <= 0.001) return 1.0;
    float occ = 0.0;
    vec2 dir = toLight2D * range;
    for (int i = 1; i <= SHADOW_STEPS; i++) {
        float t = float(i) / float(SHADOW_STEPS);
        vec2 p = uv + dir * t;
        if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) break;
        float d = sceneDepth(p);
        float bias = 0.012 + 0.030 * t;
        float surplus = d - (ownDepth + bias);
        float window = max(softness * 0.5, 1e-3);
        occ = max(occ, clamp(surplus / window, 0.0, 1.0));
    }
    return 1.0 - strength * occ;
}

void main() {
    vec4 base = texture2D(uImage, vUv);
    vec3 n = texture2D(uNormals, vUv).rgb * 2.0 - 1.0;
    n = normalize(vec3(n.x, -n.y, n.z));          // map green-up to screen y-down
    float depth = sceneDepth(vUv);

    vec3 acc = uAmbient;
    for (int i = 0; i < ${MAX_RELIGHT_LIGHTS}; i++) {
        if (i >= uLightCount) break;
        vec3 contrib = vec3(0.0);
        if (uKind[i] == 0) {
            vec3 L = normalize(uPosDir[i]);
            float lambert = max(dot(n, L), 0.0);
            float sh = shadowFactor(vUv, L.xy, depth, uShadow[i], uShadowSoft[i], uShadowRange[i]);
            contrib = uColor[i] * uIntensity[i] * lambert * sh;
        } else {
            vec3 lp = uPosDir[i];                 // x,y in UV, z in disparity units
            vec3 frag = vec3(vUv, depth);
            vec3 toL = lp - frag;
            float dist = length(toL.xy);
            float r = max(uRadius[i], 1e-3);
            float att = clamp(1.0 - (dist / r) * (dist / r), 0.0, 1.0);
            att *= att;                            // windowed quadratic: 0 at radius
            vec3 L = normalize(toL);
            float wrap = uSoftness[i];
            float diff = clamp((dot(n, L) + wrap) / (1.0 + wrap), 0.0, 1.0);
            float sh = shadowFactor(vUv, normalize(toL.xy), depth, uShadow[i], uShadowSoft[i], uShadowRange[i]);
            contrib = uColor[i] * uIntensity[i] * diff * att * sh;
        }
        acc += contrib;
    }
    gl_FragColor = vec4(base.rgb * acc, base.a);
}
`;

export type RelightAmbient = { color: string; intensity: number };

export function hexToRgb(hex: string): [number, number, number] {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return [1, 1, 1];
    const v = parseInt(m[1], 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** Azimuth (deg, 0 = from the right, CCW) + elevation (deg) -> unit light dir. */
export function sunDirection(azimuth: number, elevation: number): [number, number, number] {
    const az = (azimuth * Math.PI) / 180;
    const el = (elevation * Math.PI) / 180;
    return [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`3D layer relight shader: ${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
}

function bindTexture(gl: WebGLRenderingContext, unit: number, source: TexImageSource): WebGLTexture {
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

export function renderRelight(
    image: HTMLImageElement | HTMLCanvasElement,
    normals: HTMLCanvasElement,
    depth: HTMLCanvasElement,
    lights: ThreeDLayerLight[],
    ambient: RelightAmbient,
    outSize?: { width: number; height: number },
): HTMLCanvasElement {
    const w = outSize?.width ?? ('naturalWidth' in image ? image.naturalWidth : image.width);
    const h = outSize?.height ?? ('naturalHeight' in image ? image.naturalHeight : image.height);
    const glCanvas = document.createElement('canvas');
    glCanvas.width = w;
    glCanvas.height = h;
    const gl = glCanvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('3D layer relight: WebGL unavailable');

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(`3D layer relight link: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    bindTexture(gl, 0, image);
    bindTexture(gl, 1, normals);
    bindTexture(gl, 2, depth);
    gl.uniform1i(gl.getUniformLocation(prog, 'uImage'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'uNormals'), 1);
    gl.uniform1i(gl.getUniformLocation(prog, 'uDepth'), 2);

    const amb = hexToRgb(ambient.color);
    gl.uniform3f(gl.getUniformLocation(prog, 'uAmbient'),
        amb[0] * ambient.intensity, amb[1] * ambient.intensity, amb[2] * ambient.intensity);

    const active = lights.slice(0, MAX_RELIGHT_LIGHTS);
    gl.uniform1i(gl.getUniformLocation(prog, 'uLightCount'), active.length);
    active.forEach((light, i) => {
        const color = hexToRgb(light.color);
        gl.uniform1i(gl.getUniformLocation(prog, `uKind[${i}]`), light.kind === 'point' ? 1 : 0);
        gl.uniform3f(gl.getUniformLocation(prog, `uColor[${i}]`), color[0], color[1], color[2]);
        gl.uniform1f(gl.getUniformLocation(prog, `uIntensity[${i}]`), light.intensity);
        if (light.kind === 'point') {
            gl.uniform3f(gl.getUniformLocation(prog, `uPosDir[${i}]`), light.x ?? 0.5, light.y ?? 0.5, light.z ?? 1);
        } else {
            const dir = sunDirection(light.azimuth ?? 0, light.elevation ?? 45);
            // Screen y grows downward: positive elevation means light from above.
            gl.uniform3f(gl.getUniformLocation(prog, `uPosDir[${i}]`), dir[0], -dir[1], dir[2]);
        }
        gl.uniform1f(gl.getUniformLocation(prog, `uRadius[${i}]`), light.radius ?? 0.4);
        gl.uniform1f(gl.getUniformLocation(prog, `uSoftness[${i}]`), light.softness ?? 0.3);
        const sh = light.shadows;
        gl.uniform1f(gl.getUniformLocation(prog, `uShadow[${i}]`), sh?.enabled ? sh.strength : 0);
        gl.uniform1f(gl.getUniformLocation(prog, `uShadowSoft[${i}]`), sh?.softness ?? 0.3);
        gl.uniform1f(gl.getUniformLocation(prog, `uShadowRange[${i}]`), sh?.range ?? 0.15);
    });

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Copy out before releasing the context — losing it wipes the buffer.
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d')!.drawImage(glCanvas, 0, 0);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return out;
}
