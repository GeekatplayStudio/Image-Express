import type { ComfyPromptBlueprint, WorkflowInputBinding } from '@/lib/comfyui/registryTypes';

/**
 * Where the prompt, the image and the mask go in an API workflow, found by
 * reading the graph instead of guessing from node names.
 *
 * Ported from the Photoshop bridge's `workflow.js` (`findTargets`, `upstream`).
 * The guesses it replaces wrote the prompt into every text-like node whose
 * title did not contain "negative", and treated any node with "image" in its
 * class and an `image` input as the place to put the uploaded file — which
 * could replace a link into `ImageScale` with a filename. Here:
 *
 * - the prompt goes to the text that actually feeds a sampler's (or guider's)
 *   positive input, traced through the graph with positive and negative kept
 *   apart, and the negative prompt to the text that feeds the negative one;
 * - an image goes to a Load Image node that something reads, never to a link.
 */

const TEXT_KEYS = ['text', 'prompt', 'value', 'string'] as const;
/** Preview nodes that show the input beside the result; they do not consume an image. */
const PREVIEWS = new Set(['ImageCompare', 'PreviewImage']);

export interface WorkflowTargetSlot {
    id: string;
    key: string;
    label: string;
}

export interface WorkflowTargets {
    /** Load Image nodes something reads, in a stable order. */
    image: WorkflowTargetSlot[];
    mask: WorkflowTargetSlot[];
    /** Text nodes feeding a positive input. */
    prompt: WorkflowTargetSlot[];
    /** Text nodes feeding only a negative input. */
    negativePrompt: WorkflowTargetSlot[];
}

/** An API-format link: `[nodeId, outputSlot]`. */
export const isPromptLink = (value: unknown): value is [string, number] => (
    Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number'
);

const labelOf = (id: string, node: ComfyPromptBlueprint[string]) => `${node._meta?.title ?? node.class_type} (#${id})`;

/**
 * Ids of the nodes that feed an input, walking upstream. A node that passes
 * positive and negative through side by side (ControlNet apply, for one) keeps
 * the two apart: output 0 continues from its positive input, output 1 from its
 * negative.
 */
function upstream(api: ComfyPromptBlueprint, id: string, key: string, seen = new Set<string>()): Set<string> {
    const value = api[id]?.inputs[key];
    if (!isPromptLink(value) || !api[value[0]]) return seen;
    const [origin, slot] = value;
    const mark = `${origin}:${slot}`;
    if (seen.has(mark)) return seen;
    seen.add(mark);
    seen.add(origin);
    const inputs = api[origin].inputs;
    const paired = 'positive' in inputs && 'negative' in inputs;
    for (const input of Object.keys(inputs)) {
        if (paired && ((slot === 0 && input === 'negative') || (slot === 1 && input === 'positive'))) continue;
        upstream(api, origin, input, seen);
    }
    return seen;
}

const textKeyOf = (node: ComfyPromptBlueprint[string]) => TEXT_KEYS.find((key) => typeof node.inputs[key] === 'string');

/** Whether anything other than a preview reads this node's first output. */
function isConsumed(api: ComfyPromptBlueprint, id: string): boolean {
    return Object.values(api).some((node) => (
        !PREVIEWS.has(node.class_type)
        && Object.values(node.inputs).some((value) => isPromptLink(value) && value[0] === id)
    ));
}

const numericOrder = (a: WorkflowTargetSlot, b: WorkflowTargetSlot) => a.id.localeCompare(b.id, undefined, { numeric: true });

export function findWorkflowTargets(api: ComfyPromptBlueprint): WorkflowTargets {
    const entries = Object.entries(api);

    const loaders = entries
        .filter(([id, node]) => /LoadImage/i.test(node.class_type) && typeof node.inputs.image === 'string' && isConsumed(api, id))
        .map(([id, node]) => ({ id, key: 'image', label: labelOf(id, node), mask: /Mask/i.test(node.class_type) }))
        .sort(numericOrder);

    const positive = new Set<string>();
    const negative = new Set<string>();
    for (const [id, node] of entries) {
        upstream(api, id, 'positive', positive);
        upstream(api, id, 'negative', negative);
        // FLUX-style graphs hand a single conditioning to a guider.
        if (/Guider/.test(node.class_type)) upstream(api, id, 'conditioning', positive);
    }

    const texts = entries
        .filter(([, node]) => textKeyOf(node) && /text|prompt|string/i.test(node.class_type))
        .map(([id, node]) => ({ id, key: textKeyOf(node) as string, label: labelOf(id, node) }));

    return {
        image: loaders.filter((slot) => !slot.mask).map(({ id, key, label }) => ({ id, key, label })),
        mask: loaders.filter((slot) => slot.mask).map(({ id, key, label }) => ({ id, key, label })),
        prompt: texts.filter((slot) => positive.has(slot.id)),
        negativePrompt: texts.filter((slot) => negative.has(slot.id) && !positive.has(slot.id)),
    };
}

/**
 * Bindings for a workflow that declares none: the prompt, the image, the mask,
 * the seed and the canvas size, placed where the graph says they belong.
 *
 * Steps, CFG and denoise are left alone on purpose. A template's sampler
 * settings are tuned to its model (a two-step turbo graph, say), and writing
 * the app's generic defaults over them is what makes its output wrong.
 */
export function detectWorkflowBindings(api: ComfyPromptBlueprint): WorkflowInputBinding[] {
    const targets = findWorkflowTargets(api);
    const bindings: WorkflowInputBinding[] = [];
    const bind = (source: WorkflowInputBinding['source'], slots: WorkflowTargetSlot[]) => {
        for (const slot of slots) bindings.push({ source, nodeId: slot.id, inputName: slot.key });
    };

    bind('prompt', targets.prompt);
    bind('negativePrompt', targets.negativePrompt);
    // One uploaded image: it goes to the first loader, the rest keep their own files.
    bind('image', targets.image.slice(0, 1));
    bind('mask', targets.mask.slice(0, 1));

    for (const [id, node] of Object.entries(api)) {
        for (const key of ['seed', 'noise_seed']) {
            if (typeof node.inputs[key] === 'number') bindings.push({ source: 'seed', nodeId: id, inputName: key });
        }
    }

    const latent = Object.entries(api).find(([, node]) => (
        /^Empty.*Latent/.test(node.class_type)
        && typeof node.inputs.width === 'number'
        && typeof node.inputs.height === 'number'
    ));
    if (latent) {
        bindings.push({ source: 'width', nodeId: latent[0], inputName: 'width' });
        bindings.push({ source: 'height', nodeId: latent[0], inputName: 'height' });
    }
    return bindings;
}

/**
 * The bindings to use for a prepared prompt: the workflow's own where they
 * still point at a node, and detected ones for anything it does not cover.
 *
 * A declared binding wins for its source. A source the workflow never bound
 * (the built-in FLUX templates declare none at all) is filled in from the
 * graph, so a prompt typed in the app reaches the workflow.
 */
export function resolveWorkflowBindings(
    api: ComfyPromptBlueprint,
    declared: readonly WorkflowInputBinding[],
): WorkflowInputBinding[] {
    const live = declared.filter((binding) => Boolean(api[binding.nodeId]));
    const covered = new Set(live.map((binding) => binding.source));
    const detected = detectWorkflowBindings(api).filter((binding) => !covered.has(binding.source));
    return [...live, ...detected];
}
