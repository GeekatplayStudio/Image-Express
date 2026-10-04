import { open } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

/**
 * What an AI image says about how it was made.
 *
 * ComfyUI writes the executed graph into a PNG's `prompt` text chunk and
 * AUTOMATIC1111 writes a `parameters` block. Reading them gives the vault the
 * prompt, the model and the sampler settings as exact, searchable text — for
 * free, with no captioning model. This is a reduced port of
 * ComfyUIAssetManager's `parsers/image_meta.py` and `graph_utils.py`: only the
 * PNG header and text chunks are read, never the pixels.
 */

export interface GenerationMeta {
    source: 'comfyui' | 'a1111';
    prompt?: string;
    negativePrompt?: string;
    model?: string;
    sampler?: string;
    seed?: string;
    steps?: number;
    cfg?: number;
}

export interface PngInfo {
    width: number;
    height: number;
    text: Record<string, string>;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A text chunk larger than this is skipped, not read: a graph is kilobytes, not megabytes. */
const MAX_TEXT_CHUNK = 2 * 1024 * 1024;
/** Chunks are walked, never trusted to be few. */
const MAX_CHUNKS = 256;
const MAX_FIELD = 8000;

function decodeTextChunk(type: string, data: Buffer): [string, string] | null {
    const keyEnd = data.indexOf(0);
    if (keyEnd <= 0) return null;
    const key = data.toString('latin1', 0, keyEnd);
    try {
        if (type === 'tEXt') return [key, data.toString('latin1', keyEnd + 1)];
        if (type === 'zTXt') return [key, inflateSync(data.subarray(keyEnd + 2)).toString('latin1')];
        // iTXt: key \0 compressionFlag compressionMethod language \0 translatedKey \0 text
        const compressed = data[keyEnd + 1] === 1;
        const languageEnd = data.indexOf(0, keyEnd + 3);
        const translatedEnd = languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);
        if (translatedEnd < 0) return null;
        const body = data.subarray(translatedEnd + 1);
        return [key, (compressed ? inflateSync(body) : body).toString('utf8')];
    } catch {
        return null;
    }
}

/**
 * Size and text chunks of a PNG, reading only chunk headers and the text
 * chunks themselves. Returns null for anything that is not a readable PNG.
 */
export async function readPngInfo(filePath: string): Promise<PngInfo | null> {
    let handle;
    try {
        handle = await open(filePath, 'r');
        const head = Buffer.alloc(33);
        const { bytesRead } = await handle.read(head, 0, 33, 0);
        if (bytesRead < 33 || !head.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
        if (head.toString('latin1', 12, 16) !== 'IHDR') return null;
        const info: PngInfo = { width: head.readUInt32BE(16), height: head.readUInt32BE(20), text: {} };

        let position = 33;
        const header = Buffer.alloc(8);
        for (let index = 0; index < MAX_CHUNKS; index += 1) {
            const read = await handle.read(header, 0, 8, position);
            if (read.bytesRead < 8) break;
            const length = header.readUInt32BE(0);
            const type = header.toString('latin1', 4, 8);
            // Text written by generators comes before the pixels; stop there.
            if (type === 'IDAT' || type === 'IEND') break;
            if ((type === 'tEXt' || type === 'iTXt' || type === 'zTXt') && length <= MAX_TEXT_CHUNK) {
                const data = Buffer.alloc(length);
                await handle.read(data, 0, length, position + 8);
                const entry = decodeTextChunk(type, data);
                if (entry) info.text[entry[0]] = entry[1];
            }
            position += 12 + length;
        }
        return info;
    } catch {
        return null;
    } finally {
        await handle?.close().catch(() => {});
    }
}

const clip = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const text = value.trim();
    return text ? text.slice(0, MAX_FIELD) : undefined;
};

const A1111 = /^([\s\S]*?)(?:\nNegative prompt:\s*([\s\S]*?))?\n(Steps:[\s\S]*)$/;

/** AUTOMATIC1111 / Forge: prompt, optional "Negative prompt:", then "Steps: …, Sampler: …". */
export function parseA1111Parameters(text: string): GenerationMeta | null {
    const match = A1111.exec(text.trim());
    if (!match) return null;
    const settings = new Map<string, string>();
    for (const pair of match[3].matchAll(/([A-Za-z ]+):\s*([^,]+)/g)) {
        settings.set(pair[1].trim().toLowerCase(), pair[2].trim());
    }
    const number = (key: string) => {
        const parsed = Number.parseFloat(settings.get(key) ?? '');
        return Number.isFinite(parsed) ? parsed : undefined;
    };
    const seed = settings.get('seed');
    return {
        source: 'a1111',
        prompt: clip(match[1]),
        negativePrompt: clip(match[2]),
        model: clip(settings.get('model')),
        sampler: clip(settings.get('sampler')),
        seed: seed && /^-?\d{1,40}$/.test(seed) ? seed : undefined,
        steps: number('steps'),
        cfg: number('cfg scale'),
    };
}

type ComfyNode = { class_type?: string; inputs?: Record<string, unknown> };
type ComfyGraph = Record<string, ComfyNode>;

const isLink = (value: unknown): value is [string | number, number] => (
    Array.isArray(value) && value.length === 2 && typeof value[1] === 'number'
);

const TEXT_INPUTS = ['text', 'text_g', 'text_l', 'prompt', 'string', 'value', 't5xxl', 'clip_l'];
const MODEL_INPUTS = ['ckpt_name', 'unet_name', 'model_name', 'gguf_name'];

/**
 * Follow a conditioning input back to the text that produced it. Graphs route
 * conditioning through combine/guidance/reroute nodes, so the walk continues
 * through whatever links a node has until it reaches a string.
 */
function textBehind(graph: ComfyGraph, value: unknown, depth = 0): string | undefined {
    if (typeof value === 'string') return clip(value);
    if (!isLink(value) || depth > 12) return undefined;
    const node = graph[String(value[0])];
    if (!node?.inputs) return undefined;
    for (const name of TEXT_INPUTS) {
        if (name in node.inputs) {
            const text = textBehind(graph, node.inputs[name], depth + 1);
            if (text) return text;
        }
    }
    // Not a text node: keep walking, preferring the input that carries conditioning.
    const names = Object.keys(node.inputs).sort((a, b) => (
        Number(/cond|positive/i.test(b)) - Number(/cond|positive/i.test(a))
    ));
    for (const name of names) {
        if (!isLink(node.inputs[name]) || /^(clip|vae|model|image|pixels|latent)/i.test(name)) continue;
        const text = textBehind(graph, node.inputs[name], depth + 1);
        if (text) return text;
    }
    return undefined;
}

/** A plain value, or the value behind one hop of link (a primitive / seed node). */
function scalarBehind(graph: ComfyGraph, value: unknown): unknown {
    if (!isLink(value)) return value;
    const inputs = graph[String(value[0])]?.inputs ?? {};
    return inputs.value ?? inputs.seed ?? inputs.noise_seed ?? inputs.int ?? inputs.float;
}

/** ComfyUI's executed graph (`prompt` chunk): `{ nodeId: { class_type, inputs } }`. */
export function summarizeComfyPrompt(raw: string): GenerationMeta | null {
    let graph: ComfyGraph;
    try {
        // ComfyUI writes NaN for some widget values, which JSON does not allow.
        graph = JSON.parse(raw.replace(/\bNaN\b/g, 'null'));
    } catch {
        return null;
    }
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return null;
    const nodes = Object.values(graph).filter((node) => node && typeof node === 'object' && node.inputs);
    if (nodes.length === 0) return null;

    const meta: GenerationMeta = { source: 'comfyui' };
    // The node that owns `positive` is the sampler or, in FLUX-style graphs, a guider.
    const conditioned = nodes.find((node) => 'positive' in node.inputs!)
        ?? nodes.find((node) => 'conditioning' in node.inputs! && /guid/i.test(node.class_type ?? ''));
    if (conditioned?.inputs) {
        meta.prompt = textBehind(graph, conditioned.inputs.positive ?? conditioned.inputs.conditioning);
        meta.negativePrompt = textBehind(graph, conditioned.inputs.negative);
    }

    const sampler = nodes.find((node) => /sampler/i.test(node.class_type ?? '') && ('steps' in node.inputs! || 'seed' in node.inputs!))
        ?? nodes.find((node) => 'steps' in node.inputs!);
    const settings = sampler?.inputs ?? {};
    const numeric = (value: unknown) => {
        const parsed = Number(scalarBehind(graph, value));
        return Number.isFinite(parsed) ? parsed : undefined;
    };
    meta.steps = numeric(settings.steps);
    meta.cfg = numeric(settings.cfg);
    meta.sampler = clip(scalarBehind(graph, settings.sampler_name));
    const seedNode = nodes.find((node) => 'seed' in node.inputs! || 'noise_seed' in node.inputs!);
    const seed = scalarBehind(graph, seedNode?.inputs?.seed ?? seedNode?.inputs?.noise_seed);
    if (typeof seed === 'number' || (typeof seed === 'string' && /^-?\d{1,40}$/.test(seed))) meta.seed = String(seed);

    for (const node of nodes) {
        const name = MODEL_INPUTS.map((input) => node.inputs![input]).find((value) => typeof value === 'string');
        if (typeof name === 'string') {
            meta.model = clip(name.split(/[\\/]/).pop());
            break;
        }
    }

    const found = meta.prompt || meta.model || meta.seed || meta.steps !== undefined;
    return found ? meta : null;
}

/** Generation details from a PNG's text chunks, whichever tool wrote them. */
export function generationMetaFromText(text: Record<string, string>): GenerationMeta | null {
    if (text.prompt) {
        const comfy = summarizeComfyPrompt(text.prompt);
        if (comfy) return comfy;
    }
    if (text.parameters) return parseA1111Parameters(text.parameters);
    return null;
}
