import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const normalizeOllamaBaseUrl = (
    value: string,
    fallback = DEFAULT_OLLAMA_BASE_URL
): string => {
    const raw = value.trim() || fallback;
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Ollama URL must use http or https.');
    }
    return trimTrailingSlashes(parsed.toString());
};

export const isLoopbackOllamaHost = (hostname: string): boolean => LOOPBACK_HOSTS.has(hostname.toLowerCase());

export const resolveOllamaBaseUrlCandidates = (
    value: string,
    fallback = DEFAULT_OLLAMA_BASE_URL,
): string[] => {
    const normalized = normalizeOllamaBaseUrl(value, fallback);
    const parsed = new URL(normalized);
    const candidates = [trimTrailingSlashes(parsed.toString())];
    const hostname = parsed.hostname.toLowerCase();

    if (isLoopbackOllamaHost(hostname)) {
        const dockerReachable = new URL(parsed.toString());
        dockerReachable.hostname = 'host.docker.internal';
        candidates.push(trimTrailingSlashes(dockerReachable.toString()));
    } else if (hostname === 'host.docker.internal') {
        const hostReachable = new URL(parsed.toString());
        hostReachable.hostname = 'localhost';
        candidates.push(trimTrailingSlashes(hostReachable.toString()));
    }

    return Array.from(new Set(candidates));
};

export const extractBase64PayloadFromDataUrl = (value: string): string => {
    const trimmed = value.trim();
    const matches = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!matches || matches.length < 2 || matches[1].trim().length === 0) {
        throw new Error('Critique image must be a base64-encoded image data URL.');
    }
    return matches[1].trim();
};

export const formatOllamaModelList = (models: string[], maxItems = 8): string => {
    const normalized = models.filter((model) => model.trim().length > 0);
    if (normalized.length === 0) {
        return 'none detected';
    }

    const preview = normalized.slice(0, maxItems).join(', ');
    const remainder = normalized.length - Math.min(normalized.length, maxItems);
    return remainder > 0 ? `${preview}, +${remainder} more` : preview;
};

export const buildOllamaCritiquePrompt = (options: {
    target: 'selection' | 'canvas';
    targetLabel: string;
    focus?: string;
}): string => {
    const focus = options.focus?.trim();
    const focusSection = focus
        ? `Focus request: ${focus}\n`
        : '';

    return [
        'You are a concise senior design critic reviewing a creative layout.',
        `Analyze the attached ${options.target === 'selection' ? 'selected layer crop' : 'full canvas'}: ${options.targetLabel}.`,
        focusSection,
        'Respond with plain text under these headings:',
        'Summary',
        'What Works',
        'Issues',
        'Next Edits',
        'Keep it practical, specific, and brief. Mention composition, hierarchy, readability, color, spacing, and obvious production risks when relevant.',
    ].filter(Boolean).join('\n');
};

export const buildOllamaSvgGenerationPrompt = (options: {
    prompt: string;
    width: number;
    height: number;
}): string => {
    const safeWidth = Math.max(64, Math.round(options.width));
    const safeHeight = Math.max(64, Math.round(options.height));

    return [
        'You create clean SVG illustrations from short art-direction prompts.',
        `Return exactly one standalone SVG sized ${safeWidth} by ${safeHeight} pixels.`,
        'Reply with SVG markup only. Do not add markdown fences, explanations, or extra text.',
        'Requirements:',
        `- Use <svg width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">.`,
        '- Fill the full composition rather than drawing a tiny centered icon.',
        '- Use only basic SVG elements such as path, rect, circle, ellipse, polygon, line, polyline, defs, linearGradient, radialGradient, g, and text.',
        '- Do not use script, foreignObject, external images, remote URLs, CSS imports, or animation.',
        '- Prefer bold, readable shapes, layered color, and a polished poster-like composition.',
        `Prompt: ${options.prompt.trim()}`,
    ].join('\n');
};

const stripMarkdownCodeFences = (value: string): string => value
    .replace(/^```(?:svg)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

export const extractOllamaSvgDocument = (value: string): string => {
    const stripped = stripMarkdownCodeFences(value);
    const matches = stripped.match(/<svg[\s\S]*<\/svg>/i);
    if (!matches || matches.length === 0) {
        throw new Error('Ollama did not return SVG markup.');
    }
    return matches[0].trim();
};

export const sanitizeOllamaSvgDocument = (value: string, width: number, height: number): string => {
    const safeWidth = Math.max(64, Math.round(width));
    const safeHeight = Math.max(64, Math.round(height));
    const svg = extractOllamaSvgDocument(value)
        .replace(/<\?xml[\s\S]*?\?>/gi, '')
        .replace(/<!doctype[\s\S]*?>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/\s(?:href|xlink:href)\s*=\s*(['"])(?:https?:|data:|javascript:).*?\1/gi, '');

    const innerMarkup = svg
        .replace(/^<svg\b[^>]*>/i, '')
        .replace(/<\/svg>$/i, '')
        .trim();

    if (!innerMarkup) {
        throw new Error('Ollama returned an empty SVG document.');
    }

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}" role="img" aria-label="Generated illustration">`,
        innerMarkup,
        '</svg>',
    ].join('');
};

export const encodeSvgDataUrl = (svgMarkup: string): string => (
    `data:image/svg+xml;base64,${Buffer.from(svgMarkup, 'utf8').toString('base64')}`
);
