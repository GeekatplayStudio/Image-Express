import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * One way to load a glTF, with everything served by the app itself.
 *
 * Two things were wrong before (both found by comparing with the Photoshop 3D
 * plugin, which forked this editor and fixed them):
 *
 * - `useGLTF` fetched the Draco decoder from www.gstatic.com and the lighting
 *   environments from a GitHub CDN at run time. A desktop app that cannot reach
 *   the network could not open a compressed model, or light any model.
 * - The thumbnail and bake paths used a bare `GLTFLoader`, so a Draco- or
 *   meshopt-compressed GLB opened in the editor but failed everywhere else.
 *
 * The decoders live in `public/three/` (copied from the installed three.js by
 * `scripts/sync-three-assets.mjs`) and the environments in `public/three/hdri/`.
 */

export const DRACO_DECODER_PATH = '/three/draco/';
export const BASIS_TRANSCODER_PATH = '/three/basis/';

/** The lighting environments the editor offers, as files this app serves. */
export const ENVIRONMENT_NAMES = [
    'studio', 'city', 'apartment', 'dawn', 'sunset', 'forest', 'park', 'night', 'lobby', 'warehouse',
] as const;
export type EnvironmentName = typeof ENVIRONMENT_NAMES[number];

/** URL of an environment map; an unknown name gets the default look, not a failed fetch. */
export function environmentFile(name: string | null | undefined): string {
    const known = (ENVIRONMENT_NAMES as readonly string[]).includes(name ?? '') ? name : 'city';
    return `/three/hdri/${known}.exr`;
}

let draco: DRACOLoader | null = null;

/** Give a loader the local Draco decoder and meshopt support. */
export function extendGltfLoader<T extends GLTFLoader>(loader: T): T {
    if (!draco) {
        draco = new DRACOLoader();
        draco.setDecoderPath(DRACO_DECODER_PATH);
    }
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
}

/** A loader for code that is not a React component (thumbnails, headless bakes). */
export function createGltfLoader(): GLTFLoader {
    return extendGltfLoader(new GLTFLoader());
}
