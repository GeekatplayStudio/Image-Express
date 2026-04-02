const resolveDefaultBananaModel = (): string => process.env.BANANA_MODEL || 'nanobanana-2';

const resolveDefaultBananaGenerateUrl = (): string => process.env.BANANA_GENERATE_URL || process.env.BANANA_API_URL || '';

const resolveDefaultBananaEditUrl = (): string => process.env.BANANA_EDIT_URL || resolveDefaultBananaGenerateUrl();

type BananaMode = 'generate' | 'edit';

type BananaGenerationParams = {
    apiKey: string;
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    model?: string;
    endpoint?: string;
    mode?: BananaMode;
    imageDataUrl?: string;
    maskDataUrl?: string;
    notesOverlayDataUrl?: string;
    poseHintDataUrl?: string;
    references?: Array<{ role: string; imageDataUrl: string }>;
    params?: Record<string, unknown>;
};

type BananaOutput = {
    imageUrl: string;
    endpoint: string;
    model: string;
    meta: Record<string, unknown>;
};

type BananaPayload = Record<string, unknown>;

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null
);

const asFiniteNumber = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const isLikelyBase64 = (value: string): boolean => {
    const normalized = value.trim().replace(/\s+/g, '');
    return normalized.length > 32 && /^[A-Za-z0-9+/=]+$/.test(normalized);
};

const toImageUrl = (candidate: string, mimeType = 'image/png'): string | null => {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('data:image/')) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (isLikelyBase64(trimmed)) {
        return `data:${mimeType};base64,${trimmed}`;
    }
    return null;
};

const normalizeImageCandidate = (value: unknown): string | null => {
    if (typeof value === 'string') {
        return toImageUrl(value);
    }

    if (Array.isArray(value)) {
        for (const entry of value) {
            const normalized = normalizeImageCandidate(entry);
            if (normalized) return normalized;
        }
        return null;
    }

    const record = asRecord(value);
    if (!record) return null;

    const mimeType = typeof record.mimeType === 'string'
        ? record.mimeType
        : typeof record.mime_type === 'string'
            ? record.mime_type
            : 'image/png';

    for (const key of ['imageUrl', 'outputImageUrl', 'url', 'image', 'outputImage', 'base64', 'data']) {
        if (!(key in record)) continue;
        const candidate = record[key];
        if (typeof candidate === 'string') {
            const normalized = toImageUrl(candidate, mimeType);
            if (normalized) return normalized;
        }
    }

    for (const key of ['output', 'result', 'payload', 'response', 'outputs']) {
        if (!(key in record)) continue;
        const normalized = normalizeImageCandidate(record[key]);
        if (normalized) return normalized;
    }

    return null;
};

const resolveEndpoint = (mode: BananaMode, endpointOverride?: string): string => {
    const explicit = endpointOverride?.trim();
    if (explicit) return explicit;

    const candidate = mode === 'edit' ? resolveDefaultBananaEditUrl() : resolveDefaultBananaGenerateUrl();
    if (!candidate.trim()) {
        throw new Error(
            mode === 'edit'
                ? 'Banana edit endpoint is not configured. Set BANANA_EDIT_URL or BANANA_GENERATE_URL on the server.'
                : 'Banana generation endpoint is not configured. Set BANANA_GENERATE_URL on the server.'
        );
    }

    return candidate.trim();
};

export async function requestBananaImageGeneration(params: BananaGenerationParams): Promise<BananaOutput> {
    const apiKey = params.apiKey.trim();
    if (!apiKey) {
        throw new Error('Banana API key is required.');
    }

    const mode = params.mode || 'generate';
    const endpoint = resolveEndpoint(mode, params.endpoint);
    const defaultModel = resolveDefaultBananaModel();
    const model = (params.model || defaultModel).trim() || defaultModel;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'X-Banana-Api-Key': apiKey,
            'X-Image-Express-Provider': 'banana',
        },
        body: JSON.stringify({
            model,
            mode,
            prompt: params.prompt,
            negativePrompt: params.negativePrompt,
            width: Math.max(64, asFiniteNumber(params.width, 1024)),
            height: Math.max(64, asFiniteNumber(params.height, 1024)),
            image: params.imageDataUrl,
            mask: params.maskDataUrl,
            notesOverlay: params.notesOverlayDataUrl,
            poseHint: params.poseHintDataUrl,
            references: params.references || [],
            params: params.params || {},
        }),
    });

    const payload = await response.json() as BananaPayload;
    if (!response.ok) {
        const message = typeof payload.error === 'string'
            ? payload.error
            : typeof payload.message === 'string'
                ? payload.message
                : `Banana generation failed (${response.status}).`;
        throw new Error(message);
    }

    const imageUrl = normalizeImageCandidate(payload);
    if (!imageUrl) {
        throw new Error('Banana generation completed without returning an image payload.');
    }

    return {
        imageUrl,
        endpoint,
        model,
        meta: payload,
    };
}

export async function resolveBananaOutputBuffer(imageUrl: string): Promise<Buffer> {
    if (imageUrl.startsWith('data:')) {
        const splitIndex = imageUrl.indexOf(',');
        if (splitIndex < 0) {
            throw new Error('Invalid Banana data URL response.');
        }

        return Buffer.from(imageUrl.slice(splitIndex + 1), 'base64');
    }

    const response = await fetch(imageUrl, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to download Banana output image (${response.status}).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
