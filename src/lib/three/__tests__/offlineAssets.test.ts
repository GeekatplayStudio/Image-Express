/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';

import { sameWidthScale } from '@/components/Editor/useEditorThreeDWorkspace';

const root = path.resolve(__dirname, '..', '..', '..', '..');
const publicThree = path.join(root, 'public', 'three');
const threeLibs = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs');

// Kept in step with gltfLoading.ts; importing that module here would pull in
// three's ESM loaders, which this suite has no need to transform.
const ENVIRONMENT_NAMES = ['studio', 'city', 'apartment', 'dawn', 'sunset', 'forest', 'park', 'night', 'lobby', 'warehouse'];

describe('3D assets served by the app', () => {
    it.each([
        ['draco', path.join(threeLibs, 'draco', 'gltf'), ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']],
        ['basis', path.join(threeLibs, 'basis'), ['basis_transcoder.js', 'basis_transcoder.wasm']],
    ])('%s decoder matches the installed three.js (run scripts/sync-three-assets.mjs after an upgrade)', (folder, source, files) => {
        for (const file of files) {
            const shipped = fs.readFileSync(path.join(publicThree, folder, file));
            const installed = fs.readFileSync(path.join(source, file));
            expect(shipped.equals(installed)).toBe(true);
        }
    });

    it('ships every lighting environment the editor offers, as a real EXR', () => {
        for (const name of ENVIRONMENT_NAMES) {
            const file = path.join(publicThree, 'hdri', `${name}.exr`);
            const head = fs.readFileSync(file).subarray(0, 4);
            // OpenEXR magic number.
            expect([...head]).toEqual([0x76, 0x2f, 0x31, 0x01]);
        }
    });

    it('offers the same environments in the editor as it ships', () => {
        const source = fs.readFileSync(path.join(root, 'src', 'lib', 'three', 'gltfLoading.ts'), 'utf8');
        const presets = fs.readFileSync(path.join(root, 'src', 'components', 'three', 'threeDLayerPresets.ts'), 'utf8');
        for (const name of ENVIRONMENT_NAMES) {
            expect(source).toContain(`'${name}'`);
            expect(presets).toContain(`'${name}'`);
        }
    });

    it('no longer reaches for a CDN preset or a bare loader', () => {
        const read = (relative: string) => fs.readFileSync(path.join(root, 'src', relative), 'utf8');
        for (const file of ['components/ThreeDLayerEditor.tsx', 'components/ThreeDGenerator.tsx', 'components/Asset3DPreview.tsx']) {
            const text = read(file);
            expect(text).not.toMatch(/preset="/);
            expect(text).not.toMatch(/environment="city"/);
            expect(text).not.toMatch(/useGLTF\(url\)/);
        }
        for (const file of ['lib/modelThumbnail.ts', 'lib/threeDLayer/objectBake.ts']) {
            expect(read(file)).not.toMatch(/new GLTFLoader\(\)/);
        }
    });
});

describe('sameWidthScale', () => {
    it('keeps a re-rendered layer as wide on the page as the one it replaces', () => {
        // A 2048 px render shown at 512 px, re-rendered at 4096 px.
        expect(sameWidthScale({ getScaledWidth: () => 512 }, { width: 4096 })).toEqual({ scaleX: 0.125, scaleY: 0.125 });
        expect(sameWidthScale({ getScaledWidth: () => 512 }, { width: 2048 })).toEqual({ scaleX: 0.25, scaleY: 0.25 });
    });

    it('does not divide by zero for an image that has no size yet', () => {
        expect(sameWidthScale({ getScaledWidth: () => 0 }, {})).toEqual({ scaleX: 1, scaleY: 1 });
    });
});
