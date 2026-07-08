const GOOGLE_IMAGE_MODEL = process.env.GOOGLE_IMAGE_MODEL || 'gemini-2.5-flash-image';

const SUPPORTED_ASPECT_RATIOS = [
    { id: '1:1', ratio: 1 },
    { id: '2:3', ratio: 2 / 3 },
    { id: '3:2', ratio: 3 / 2 },
    { id: '3:4', ratio: 3 / 4 },
    { id: '4:3', ratio: 4 / 3 },
    { id: '4:5', ratio: 4 / 5 },
    { id: '5:4', ratio: 5 / 4 },
    { id: '9:16', ratio: 9 / 16 },
    { id: '16:9', ratio: 16 / 9 },
    { id: '21:9', ratio: 21 / 9 },
] as const;

type GoogleGenerateContentResponse = {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
                inlineData?: {
                    mimeType?: string;
                    data?: string;
                };
                inline_data?: {
                    mime_type?: string;
                    data?: string;
                };
            }>;
        };
    }>;
    error?: {
        message?: string;
    };
};

const asFiniteNumber = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const resolveGoogleAspectRatio = (width: number, height: number): string => {
    const safeWidth = Math.max(1, asFiniteNumber(width, 1));
    const safeHeight = Math.max(1, asFiniteNumber(height, 1));
    const targetRatio = safeWidth / safeHeight;

    return SUPPORTED_ASPECT_RATIOS.reduce((best, option) => {
        const bestDiff = Math.abs(best.ratio - targetRatio);
        const nextDiff = Math.abs(option.ratio - targetRatio);
        return nextDiff < bestDiff ? option : best;
    }).id;
};

const encodeInlineImageData = (mimeType: string, data: string): string => (
    `data:${mimeType};base64,${data}`
);

export async function requestGoogleImageGeneration(params: {
    apiKey: string;
    prompt: string;
    width?: number;
    height?: number;
}): Promise<{ imageUrl: string; model: string; aspectRatio: string; textResponse?: string }> {
    const apiKey = params.apiKey.trim();
    if (!apiKey) {
        throw new Error('Google API Key is required for Gemini image generation.');
    }

    const aspectRatio = resolveGoogleAspectRatio(params.width ?? 1024, params.height ?? 1024);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GOOGLE_IMAGE_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: params.prompt },
                    ],
                },
            ],
            generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    aspectRatio,
                },
            },
        }),
    });

    const payload = await response.json() as GoogleGenerateContentResponse;
    if (!response.ok) {
        throw new Error(payload.error?.message || `Google image generation failed (${response.status}).`);
    }

    const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const textPart = parts.find((part) => typeof part.text === 'string' && part.text.trim().length > 0);

    if (!imagePart) {
        throw new Error(textPart?.text || 'Google image generation did not return an image.');
    }

    const inlineData = imagePart.inlineData || imagePart.inline_data;
    const normalizedInlineData = inlineData
        ? (() => {
            if ('mimeType' in inlineData) {
                const typedInlineData = inlineData as { mimeType?: string; data?: string };
                return {
                    mimeType: typedInlineData.mimeType,
                    data: typedInlineData.data,
                };
            }

            const typedInlineData = inlineData as { mime_type?: string; data?: string };
            return {
                mimeType: typedInlineData.mime_type,
                data: typedInlineData.data,
            };
        })()
        : null;
    const mimeType = normalizedInlineData?.mimeType || 'image/png';
    const data = normalizedInlineData?.data;

    if (!data) {
        throw new Error('Google image generation returned an empty image payload.');
    }

    return {
        imageUrl: encodeInlineImageData(mimeType, data),
        model: GOOGLE_IMAGE_MODEL,
        aspectRatio,
        textResponse: textPart?.text,
    };
}