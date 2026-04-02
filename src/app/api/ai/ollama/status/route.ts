import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';

const OLLAMA_STATUS_TIMEOUT_MS = 5000;

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

export async function GET(request: NextRequest) {
    const requestedBaseUrl = request.nextUrl.searchParams.get('baseUrl')?.trim() || DEFAULT_OLLAMA_BASE_URL;
    const requestedModel = request.nextUrl.searchParams.get('model')?.trim() || DEFAULT_OLLAMA_MODEL;

    let resolvedBaseUrl: string;
    try {
        const parsed = new URL(requestedBaseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return NextResponse.json({ success: false, message: 'Ollama URL must use http or https.' }, { status: 400 });
        }
        resolvedBaseUrl = normalizeBaseUrl(parsed.toString());
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid Ollama URL.' }, { status: 400 });
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), OLLAMA_STATUS_TIMEOUT_MS);

    try {
        const response = await fetch(`${resolvedBaseUrl}/api/tags`, {
            method: 'GET',
            cache: 'no-store',
            signal: abortController.signal,
        });

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                message: `Ollama responded with ${response.status} ${response.statusText}.`,
            }, { status: 502 });
        }

        const payload = await response.json() as {
            models?: Array<{ name?: string; model?: string }>;
        };
        const models = Array.isArray(payload.models)
            ? payload.models
                .map((entry) => entry.name || entry.model || '')
                .filter((entry) => entry.trim().length > 0)
            : [];

        return NextResponse.json({
            success: true,
            baseUrl: resolvedBaseUrl,
            requestedModel,
            modelFound: models.includes(requestedModel),
            models,
            count: models.length,
        });
    } catch (error) {
        const isAbortError = error instanceof DOMException && error.name === 'AbortError';
        return NextResponse.json({
            success: false,
            message: isAbortError
                ? `Timed out contacting Ollama after ${Math.round(OLLAMA_STATUS_TIMEOUT_MS / 1000)} seconds.`
                : (error instanceof Error ? error.message : 'Failed to contact Ollama.'),
        }, { status: 502 });
    } finally {
        clearTimeout(timeoutId);
    }
}
