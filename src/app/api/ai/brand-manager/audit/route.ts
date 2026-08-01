import { NextRequest, NextResponse } from 'next/server';
import { BrandProfile } from '@/lib/brand/brandProfile';
import { getActiveBrandProfileServer } from '@/lib/server/brand-agent-store';
import {
    buildBrandAuditVlmPrompt,
    CanvasMetadataSummary,
    runHeuristicBrandAudit,
} from '@/lib/brand/brandAuditEngine';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';
import { normalizeOllamaBaseUrl } from '@/lib/ollama';
import { fetchOllamaWithFallback } from '@/lib/ollamaServer';
import { callExternalLlm, ExternalLlmProvider } from '@/lib/server/externalLlm';

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as {
            metadata?: CanvasMetadataSummary;
            brandProfile?: BrandProfile;
            baseUrl?: string;
            model?: string;
            imageDataUrl?: string;
            provider?: 'ollama' | ExternalLlmProvider;
            apiKey?: string;
        };

        const profile = payload.brandProfile || await getActiveBrandProfileServer();
        const metadata = payload.metadata || {
            canvasWidth: 800,
            canvasHeight: 600,
            layerCount: 0,
            layers: [],
        };

        // Deterministic audit calculation
        const fallbackReport = runHeuristicBrandAudit(metadata, profile);

        // Optional VLM enhancement if model & baseUrl provided
        const requestedBaseUrl = payload.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL;
        const requestedModel = payload.model?.trim() || DEFAULT_OLLAMA_MODEL;

        const parseVlmReport = (text: string): typeof fallbackReport | null => {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            try {
                const parsed = JSON.parse(jsonMatch[0]) as typeof fallbackReport;
                if (typeof parsed.overallScore === 'number' && Array.isArray(parsed.violations)) {
                    return {
                        ...parsed,
                        timestamp: new Date().toISOString(),
                        profileName: profile.name,
                    };
                }
            } catch {
                // fall through to heuristic report
            }
            return null;
        };

        if (payload.imageDataUrl) {
            const prompt = buildBrandAuditVlmPrompt(metadata, profile);
            const imageBase64 = payload.imageDataUrl.replace(/^data:image\/\w+;base64,/, '');

            // External VLM provider (OpenAI / Gemini) when configured
            if ((payload.provider === 'openai' || payload.provider === 'google') && payload.apiKey) {
                const text = await callExternalLlm({
                    provider: payload.provider,
                    apiKey: payload.apiKey,
                    model: payload.model,
                    prompt,
                    imageBase64,
                });
                const report = text ? parseVlmReport(text) : null;
                if (report) {
                    return NextResponse.json({ success: true, report, source: payload.provider });
                }
            } else if (requestedModel) {
                // Local Ollama VLM
                try {
                    const resolvedBaseUrl = normalizeOllamaBaseUrl(requestedBaseUrl);
                    const vlmResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/generate', {
                        method: 'POST',
                        body: JSON.stringify({
                            model: requestedModel,
                            prompt,
                            stream: false,
                            images: [imageBase64],
                        }),
                        timeoutMs: 30000,
                    });

                    if (vlmResult.ok && vlmResult.response) {
                        const data = await vlmResult.response.json() as { response?: string };
                        const report = data.response ? parseVlmReport(data.response) : null;
                        if (report) {
                            return NextResponse.json({ success: true, report, source: 'ollama' });
                        }
                    }
                } catch {
                    // Return heuristic report if VLM call fails
                }
            }
        }

        return NextResponse.json({
            success: true,
            report: fallbackReport,
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Brand audit failed' },
            { status: 500 }
        );
    }
}
