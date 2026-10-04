/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import {
    generationMetaFromText,
    parseA1111Parameters,
    readPngInfo,
    summarizeComfyPrompt,
} from '@/lib/server/generationMeta';
import { mimeTypeForName, readFileMeta, withFileMeta, VAULT_META_VERSION } from '@/lib/server/vaultFileMeta';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG chunk. The reader never checks the CRC, so it is left as zeros. */
const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
};

const ihdr = (width: number, height: number) => {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(width, 0);
    data.writeUInt32BE(height, 4);
    return chunk('IHDR', data);
};

const text = (key: string, value: string) => chunk('tEXt', Buffer.concat([Buffer.from(`${key}\0`, 'latin1'), Buffer.from(value, 'latin1')]));

const png = (...chunks: Buffer[]) => Buffer.concat([SIGNATURE, ...chunks, chunk('IDAT', Buffer.alloc(4)), chunk('IEND', Buffer.alloc(0))]);

const comfyGraph = {
    3: { class_type: 'KSampler', inputs: { seed: 42, steps: 20, cfg: 7.5, sampler_name: 'euler', model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sdxl\\juggernaut.safetensors' } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: 'a red kite over a beach', clip: ['4', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: 'blurry', clip: ['4', 1] } },
};

let dir: string;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-meta-'));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

const write = async (name: string, data: Buffer) => {
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, data);
    return filePath;
};

describe('readPngInfo', () => {
    it('reads the size and the text chunks before the pixels', async () => {
        const filePath = await write('a.png', png(ihdr(640, 480), text('prompt', '{"a":1}'), text('workflow', '{}')));
        expect(await readPngInfo(filePath)).toEqual({ width: 640, height: 480, text: { prompt: '{"a":1}', workflow: '{}' } });
    });

    it('reads compressed and international text chunks', async () => {
        const ztxt = chunk('zTXt', Buffer.concat([Buffer.from('parameters\0\0', 'latin1'), deflateSync(Buffer.from('zipped'))]));
        const itxt = chunk('iTXt', Buffer.concat([Buffer.from('note\0\0\0\0\0', 'latin1'), Buffer.from('héllo', 'utf8')]));
        const filePath = await write('b.png', png(ihdr(1, 1), ztxt, itxt));
        expect((await readPngInfo(filePath))?.text).toEqual({ parameters: 'zipped', note: 'héllo' });
    });

    it('returns null for a file that is not a PNG, or does not exist', async () => {
        expect(await readPngInfo(await write('c.png', Buffer.from('<html>not an image</html>'.repeat(4))))).toBeNull();
        expect(await readPngInfo(path.join(dir, 'missing.png'))).toBeNull();
    });

    it('skips an oversized text chunk instead of reading it', async () => {
        const huge = chunk('tEXt', Buffer.alloc(0));
        huge.writeUInt32BE(0x7fffffff, 0);
        const filePath = await write('d.png', Buffer.concat([SIGNATURE, ihdr(2, 2), huge]));
        expect(await readPngInfo(filePath)).toEqual({ width: 2, height: 2, text: {} });
    });
});

describe('summarizeComfyPrompt', () => {
    it('follows the sampler back to its prompt, model and settings', () => {
        expect(summarizeComfyPrompt(JSON.stringify(comfyGraph))).toEqual({
            source: 'comfyui',
            prompt: 'a red kite over a beach',
            negativePrompt: 'blurry',
            model: 'juggernaut.safetensors',
            sampler: 'euler',
            seed: '42',
            steps: 20,
            cfg: 7.5,
        });
    });

    it('walks through guidance nodes and linked text, as FLUX graphs do', () => {
        const flux = {
            1: { class_type: 'UNETLoader', inputs: { unet_name: 'flux1-dev.safetensors' } },
            2: { class_type: 'PrimitiveString', inputs: { value: 'a lighthouse at dusk' } },
            3: { class_type: 'CLIPTextEncode', inputs: { text: ['2', 0], clip: ['9', 0] } },
            4: { class_type: 'FluxGuidance', inputs: { conditioning: ['3', 0], guidance: 3.5 } },
            5: { class_type: 'BasicGuider', inputs: { model: ['1', 0], conditioning: ['4', 0] } },
            6: { class_type: 'RandomNoise', inputs: { noise_seed: 123456789012345 } },
            7: { class_type: 'BasicScheduler', inputs: { steps: 28, scheduler: 'simple' } },
        };
        expect(summarizeComfyPrompt(JSON.stringify(flux))).toMatchObject({
            prompt: 'a lighthouse at dusk',
            model: 'flux1-dev.safetensors',
            seed: '123456789012345',
            steps: 28,
        });
    });

    it('accepts the NaN ComfyUI writes, and rejects what is not a graph', () => {
        const withNaN = JSON.stringify(comfyGraph).replace('7.5', 'NaN');
        expect(summarizeComfyPrompt(withNaN)?.prompt).toBe('a red kite over a beach');
        expect(summarizeComfyPrompt('not json')).toBeNull();
        expect(summarizeComfyPrompt('[1,2]')).toBeNull();
        expect(summarizeComfyPrompt('{"1":{"class_type":"Note","inputs":{}}}')).toBeNull();
    });
});

describe('parseA1111Parameters', () => {
    it('splits prompt, negative prompt and settings', () => {
        const block = 'a castle, dramatic light\nNegative prompt: lowres, text\nSteps: 30, Sampler: DPM++ 2M, CFG scale: 6.5, Seed: 1234, Size: 512x768, Model: dreamshaper_8';
        expect(parseA1111Parameters(block)).toEqual({
            source: 'a1111',
            prompt: 'a castle, dramatic light',
            negativePrompt: 'lowres, text',
            model: 'dreamshaper_8',
            sampler: 'DPM++ 2M',
            seed: '1234',
            steps: 30,
            cfg: 6.5,
        });
    });

    it('is null for text that is not a parameters block', () => {
        expect(parseA1111Parameters('just a caption')).toBeNull();
    });
});

describe('readFileMeta', () => {
    it('reads a ComfyUI image into record fields', async () => {
        const filePath = await write('ComfyUI_0001.png', png(ihdr(1024, 1024), text('prompt', JSON.stringify(comfyGraph))));
        const meta = await readFileMeta(filePath, 'ComfyUI_0001.png');
        expect(meta).toMatchObject({
            mimeType: 'image/png',
            width: 1024,
            height: 1024,
            prompt: 'a red kite over a beach',
            metaVersion: VAULT_META_VERSION,
        });
        expect(meta.generation).toMatchObject({ source: 'comfyui', model: 'juggernaut.safetensors', seed: '42' });
    });

    it('gives every file its real type and stamps it as seen, readable or not', async () => {
        expect(await readFileMeta(path.join(dir, 'gone.png'), 'gone.png')).toEqual({ mimeType: 'image/png', metaVersion: VAULT_META_VERSION });
        expect(mimeTypeForName('Clip.MOV')).toBe('video/quicktime');
        expect(mimeTypeForName('model.glb')).toBe('model/gltf-binary');
        expect(mimeTypeForName('notes.xyz')).toBe('application/octet-stream');
    });

    it('keeps a caption the file cannot replace', () => {
        const record = { prompt: 'typed by hand', width: 10 } as VaultAssetRecord;
        const merged = withFileMeta(record, { mimeType: 'image/jpeg', metaVersion: 1 });
        expect(merged).toMatchObject({ prompt: 'typed by hand', width: 10, mimeType: 'image/jpeg', metaVersion: 1 });
    });
});

describe('generationMetaFromText', () => {
    it('prefers the ComfyUI graph and falls back to an A1111 block', () => {
        expect(generationMetaFromText({ prompt: JSON.stringify(comfyGraph), parameters: 'x\nSteps: 1' })?.source).toBe('comfyui');
        expect(generationMetaFromText({ parameters: 'a cat\nSteps: 12, Seed: 7' })).toMatchObject({ source: 'a1111', steps: 12, seed: '7' });
        expect(generationMetaFromText({ Software: 'Photoshop' })).toBeNull();
    });
});
