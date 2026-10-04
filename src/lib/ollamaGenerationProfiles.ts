/**
 * Quality profiles for local (Ollama) image generation.
 *
 * Local generation here means a language model writing an SVG. That is the
 * first thing a user needs to know, and the reason for `OLLAMA_GENERATION_NOTE`:
 * it produces flat vector illustration, never a photograph, and the result
 * depends heavily on the model.
 *
 * The three profiles trade time for detail. They differ in what the model is
 * asked to draw *and* in how much it is allowed to write: a "quality" prompt
 * with a "fast" token budget would simply be cut off mid-document, so the two
 * are set together.
 */

export type OllamaGenerationProfileId = 'fast' | 'balanced' | 'quality';

export interface OllamaGenerationProfile {
    id: OllamaGenerationProfileId;
    labelKey: string;
    /** One line on what it costs and what it buys. */
    tradeoffKey: string;
    /** Extra drawing instructions appended to the prompt. */
    directions: readonly string[];
    /** Ollama sampling options. */
    options: {
        temperature: number;
        /** Upper bound on generated tokens — the SVG's size budget. */
        num_predict: number;
    };
}

export const OLLAMA_GENERATION_PROFILES: readonly OllamaGenerationProfile[] = [
    {
        id: 'fast',
        labelKey: 'ollamaProfile.fast',
        tradeoffKey: 'ollamaProfile.fastTradeoff',
        directions: [
            '- Keep it simple: at most 12 shapes.',
            '- Flat solid fills only. No gradients, no filters, no fine detail.',
        ],
        // A ceiling, not a target: the brief keeps a fast SVG near 400 tokens, but
        // a budget set close to that truncated the occasional wordier reply
        // before its closing tag, which fails the whole generation.
        options: { temperature: 0.2, num_predict: 1600 },
    },
    {
        id: 'balanced',
        labelKey: 'ollamaProfile.balanced',
        tradeoffKey: 'ollamaProfile.balancedTradeoff',
        directions: [
            '- Use roughly 15 to 30 shapes, with a clear foreground, midground and background.',
            '- Gradients are welcome where they add depth.',
        ],
        options: { temperature: 0.3, num_predict: 3600 },
    },
    {
        id: 'quality',
        labelKey: 'ollamaProfile.quality',
        tradeoffKey: 'ollamaProfile.qualityTradeoff',
        directions: [
            '- Build a rich, layered composition: 30 to 60 shapes.',
            '- Use gradients for lighting, overlapping layers for depth, and small accent shapes for detail.',
            '- Group related shapes with <g> and keep the palette harmonious.',
        ],
        options: { temperature: 0.4, num_predict: 7000 },
    },
];

export const DEFAULT_OLLAMA_GENERATION_PROFILE: OllamaGenerationProfileId = 'balanced';

/** Shown before a run: what local generation can and cannot do. */
export const OLLAMA_GENERATION_NOTE_KEY = 'ollamaProfile.capabilityNote';

export function getOllamaGenerationProfile(id: unknown): OllamaGenerationProfile {
    return OLLAMA_GENERATION_PROFILES.find((profile) => profile.id === id)
        ?? OLLAMA_GENERATION_PROFILES.find((profile) => profile.id === DEFAULT_OLLAMA_GENERATION_PROFILE)!;
}

export const isOllamaGenerationProfileId = (value: unknown): value is OllamaGenerationProfileId => (
    OLLAMA_GENERATION_PROFILES.some((profile) => profile.id === value)
);
