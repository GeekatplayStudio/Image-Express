import { NextRequest, NextResponse } from 'next/server';
import {
    buildSuperAgentPlanLlmPrompt,
    DEFAULT_SUPER_AGENT,
    generateSuperAgentPlan,
    parseLlmPlanResponse,
} from '@/lib/agent/superAgentEngine';
import { DEFAULT_BRAND_PROFILE } from '@/lib/brand/brandProfile';
import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';
import { normalizeOllamaBaseUrl } from '@/lib/ollama';
import { fetchOllamaWithFallback } from '@/lib/ollamaServer';
import { callExternalLlm, ExternalLlmProvider } from '@/lib/server/externalLlm';

/** Text-capable model used for planning when the caller does not specify one. */
const DEFAULT_PLANNING_MODEL = 'llama3.2';

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as {
            prompt?: string;
            agent?: typeof DEFAULT_SUPER_AGENT;
            brandProfile?: typeof DEFAULT_BRAND_PROFILE;
            baseUrl?: string;
            model?: string;
            provider?: 'ollama' | ExternalLlmProvider;
            apiKey?: string;
        };

        const prompt = payload.prompt?.trim() || 'Create a product promo banner';
        const agent = payload.agent || DEFAULT_SUPER_AGENT;
        const brandProfile = payload.brandProfile || DEFAULT_BRAND_PROFILE;

        // 1a. External LLM provider (OpenAI / Gemini) when configured.
        if ((payload.provider === 'openai' || payload.provider === 'google') && payload.apiKey) {
            const llmPrompt = buildSuperAgentPlanLlmPrompt(prompt, agent, brandProfile);
            const text = await callExternalLlm({
                provider: payload.provider,
                apiKey: payload.apiKey,
                model: payload.model,
                prompt: llmPrompt,
            });
            if (text) {
                const llmPlan = parseLlmPlanResponse(text, prompt, agent);
                if (llmPlan) {
                    return NextResponse.json({ success: true, plan: llmPlan, source: payload.provider });
                }
            }
        }

        // 1b. Ask the local LLM (Ollama) to plan the steps.
        try {
            const baseUrl = normalizeOllamaBaseUrl(payload.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL);
            const model = payload.model?.trim() || agent.preferredModel || DEFAULT_PLANNING_MODEL;
            const llmPrompt = buildSuperAgentPlanLlmPrompt(prompt, agent, brandProfile);

            const result = await fetchOllamaWithFallback(baseUrl, '/api/generate', {
                method: 'POST',
                body: JSON.stringify({ model, prompt: llmPrompt, stream: false }),
                timeoutMs: 45000,
            });

            if (result.ok && result.response) {
                const data = await result.response.json() as { response?: string };
                if (data.response) {
                    const llmPlan = parseLlmPlanResponse(data.response, prompt, agent);
                    if (llmPlan) {
                        return NextResponse.json({ success: true, plan: llmPlan, source: 'llm' });
                    }
                }
            }
        } catch {
            // LLM unavailable — fall through to the deterministic planner
        }

        // 2. Deterministic fallback (still honors sizes/colors parsed from the prompt).
        const plan = generateSuperAgentPlan(prompt, agent, brandProfile);
        return NextResponse.json({ success: true, plan, source: 'heuristic' });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Super agent planning failed' },
            { status: 500 }
        );
    }
}
