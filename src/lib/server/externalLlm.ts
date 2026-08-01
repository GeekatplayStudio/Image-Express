/**
 * Minimal server-side helpers for calling external LLM/VLM providers
 * (OpenAI, Google Gemini) for text-and-vision prompts. Used by the Brand
 * Manager audit and Super Agent planning routes as an alternative to local
 * Ollama. Returns the raw text response; callers parse JSON out of it.
 */

export type ExternalLlmProvider = 'openai' | 'google';

export interface ExternalLlmRequest {
    provider: ExternalLlmProvider;
    apiKey: string;
    model?: string;
    prompt: string;
    /** Raw base64 image payload (no data: prefix) for vision requests. */
    imageBase64?: string;
    timeoutMs?: number;
}

const DEFAULT_MODELS: Record<ExternalLlmProvider, string> = {
    openai: 'gpt-4o-mini',
    google: 'gemini-2.0-flash',
};

async function callOpenAi(request: ExternalLlmRequest, signal: AbortSignal): Promise<string | null> {
    const model = request.model || DEFAULT_MODELS.openai;
    const content: unknown[] = [{ type: 'text', text: request.prompt }];
    if (request.imageBase64) {
        content.push({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${request.imageBase64}` },
        });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
            temperature: 0.2,
        }),
        signal,
    });

    if (!response.ok) return null;
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || null;
}

async function callGemini(request: ExternalLlmRequest, signal: AbortSignal): Promise<string | null> {
    const model = request.model || DEFAULT_MODELS.google;
    const parts: unknown[] = [{ text: request.prompt }];
    if (request.imageBase64) {
        parts.push({ inline_data: { mime_type: 'image/png', data: request.imageBase64 } });
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { temperature: 0.2 },
            }),
            signal,
        }
    );

    if (!response.ok) return null;
    const data = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || null;
}

/**
 * Calls the requested external provider and returns its text response, or
 * null on any failure (bad key, network, provider error) so callers can fall
 * back to local Ollama or heuristics.
 */
export async function callExternalLlm(request: ExternalLlmRequest): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 45000);
    try {
        if (request.provider === 'openai') return await callOpenAi(request, controller.signal);
        if (request.provider === 'google') return await callGemini(request, controller.signal);
        return null;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
