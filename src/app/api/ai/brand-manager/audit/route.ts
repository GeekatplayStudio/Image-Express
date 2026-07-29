import { NextRequest, NextResponse } from 'next/server';
import { BrandProfile, DEFAULT_BRAND_PROFILE } from '@/lib/brand/brandProfile';
import {
    buildBrandAuditVlmPrompt,
    CanvasMetadataSummary,
    runHeuristicBrandAudit,
} from '@/lib/brand/brandAuditEngine';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';
import { normalizeOllamaBaseUrl } from '@/lib/ollama';
import { fetchOllamaWithFallback } from '@/lib/ollamaServer';

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as {
            metadata?: CanvasMetadataSummary;
            brandProfile?: BrandProfile;
            baseUrl?: string;
            model?: string;
            imageDataUrl?: string;
        };

        const profile = payload.brandProfile || DEFAULT_BRAND_PROFILE;
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

        if (payload.imageDataUrl && requestedModel) {
            try {
                const resolvedBaseUrl = normalizeOllamaBaseUrl(requestedBaseUrl);
                const prompt = buildBrandAuditVlmPrompt(metadata, profile);

                const vlmResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/generate', {
                    method: 'POST',
                    body: JSON.stringify({
                        model: requestedModel,
                        prompt,
                        stream: false,
                        images: [payload.imageDataUrl.replace(/^data:image\/\w+;base64,/, '')],
                    }),
                    timeoutMs: 30000,
                });

                if (vlmResult.ok && vlmResult.response) {
                    const data = await vlmResult.response.json() as { response?: string };
                    if (data.response) {
                        const jsonMatch = data.response.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            try {
                                const parsed = JSON.parse(jsonMatch[0]) as typeof fallbackReport;
                                if (typeof parsed.overallScore === 'number' && Array.isArray(parsed.violations)) {
                                    return NextResponse.json({
                                        success: true,
                                        report: {
                                            ...parsed,
                                            timestamp: new Date().toISOString(),
                                            profileName: profile.name,
                                        },
                                    });
                                }
                            } catch {
                                // Fall back to heuristic report if JSON parse fails
                            }
                        }
                    }
                }
            } catch {
                // Return heuristic report if VLM call fails
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
