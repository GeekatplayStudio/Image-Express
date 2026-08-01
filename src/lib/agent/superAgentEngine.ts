import * as fabric from 'fabric';
import { BrandProfile } from '../brand/brandProfile';
import { runHeuristicBrandAudit, extractCanvasMetadata } from '../brand/brandAuditEngine';

export interface CustomAgentDefinition {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    role: string;
    defaultWidth: number;
    defaultHeight: number;
    preferredModel?: string;
    enabledTools: string[];
    isDefault?: boolean;
    updatedAt: string;
}

export const DEFAULT_SUPER_AGENT: CustomAgentDefinition = {
    id: 'default-super-agent',
    name: 'Super Agent Alpha',
    description: 'Autonomous design director capable of layout creation, multi-layer assembly, text styling, and brand enforcement.',
    systemPrompt: 'You are Super Agent Alpha, a creative director that designs professional graphics, banner layouts, and promotional media from natural language requests.',
    role: 'Creative Director & Designer',
    defaultWidth: 1080,
    defaultHeight: 1080,
    enabledTools: ['set_canvas_size', 'add_text', 'add_shape', 'set_background', 'brand_audit'],
    isDefault: true,
    updatedAt: new Date().toISOString(),
};

export const DEFAULT_SOCIAL_AGENT: CustomAgentDefinition = {
    id: 'social-media-agent',
    name: 'Social Banner Agent',
    description: 'Specialized sub-agent optimized for high-impact 1080x1350 & 1920x1080 social media posts with strong call-to-actions.',
    systemPrompt: 'You are Social Banner Agent, specialized in eye-catching typography, modern dark/light contrast cards, and high-conversion layouts.',
    role: 'Social Media Specialist',
    defaultWidth: 1080,
    defaultHeight: 1350,
    enabledTools: ['set_canvas_size', 'add_text', 'add_shape', 'set_background'],
    updatedAt: new Date().toISOString(),
};

export type AgentStepAction =
    | 'SET_CANVAS_SIZE'
    | 'SET_BACKGROUND_COLOR'
    | 'GENERATE_AI_BACKGROUND'
    | 'ADD_TEXT'
    | 'ADD_SHAPE'
    | 'RUN_BRAND_AUDIT';

export interface AgentStepPlanItem {
    id: string;
    action: AgentStepAction;
    description: string;
    params: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed';
    error?: string;
}

export interface AgentExecutionPlan {
    id: string;
    agentId: string;
    agentName: string;
    prompt: string;
    steps: AgentStepPlanItem[];
    status: 'planned' | 'executing' | 'completed' | 'failed';
    summary?: string;
}

const STORAGE_KEY_CUSTOM_AGENTS = 'image-express-custom-agents';

export function loadCustomAgents(): CustomAgentDefinition[] {
    if (typeof window === 'undefined') return [DEFAULT_SUPER_AGENT, DEFAULT_SOCIAL_AGENT];
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_AGENTS);
        if (!raw) return [DEFAULT_SUPER_AGENT, DEFAULT_SOCIAL_AGENT];
        const parsed = JSON.parse(raw) as CustomAgentDefinition[];
        if (!Array.isArray(parsed) || parsed.length === 0) return [DEFAULT_SUPER_AGENT, DEFAULT_SOCIAL_AGENT];
        return parsed;
    } catch {
        return [DEFAULT_SUPER_AGENT, DEFAULT_SOCIAL_AGENT];
    }
}

export function saveCustomAgents(agents: CustomAgentDefinition[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY_CUSTOM_AGENTS, JSON.stringify(agents));
    } catch {
        // ignore
    }
}

export function saveCustomAgent(agent: CustomAgentDefinition): CustomAgentDefinition[] {
    const agents = loadCustomAgents();
    const index = agents.findIndex((a) => a.id === agent.id);
    const updated = { ...agent, updatedAt: new Date().toISOString() };
    let next: CustomAgentDefinition[];
    if (index >= 0) {
        next = [...agents];
        next[index] = updated;
    } else {
        next = [...agents, updated];
    }
    saveCustomAgents(next);
    return next;
}

/** Hydrates agents from the server store shared with MCP; null when unreachable. */
export async function syncCustomAgentsFromServer(): Promise<CustomAgentDefinition[] | null> {
    try {
        const response = await fetch('/api/ai/super-agent/agents');
        if (!response.ok) return null;
        const data = await response.json() as { success?: boolean; agents?: CustomAgentDefinition[] };
        if (!data.success || !Array.isArray(data.agents) || data.agents.length === 0) return null;
        saveCustomAgents(data.agents);
        return data.agents;
    } catch {
        return null;
    }
}

/** Pushes an agent definition to the server store; best-effort. */
export function pushCustomAgentToServer(agent: CustomAgentDefinition): void {
    try {
        void fetch('/api/ai/super-agent/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent }),
        }).catch(() => undefined);
    } catch {
        // offline
    }
}

export function deleteCustomAgent(id: string): CustomAgentDefinition[] {
    const agents = loadCustomAgents();
    const filtered = agents.filter((a) => a.id !== id);
    const result = filtered.length > 0 ? filtered : [DEFAULT_SUPER_AGENT];
    saveCustomAgents(result);
    return result;
}

export interface PromptDesignHints {
    width?: number;
    height?: number;
    backgroundColor?: string;
    accentColor?: string;
    title?: string;
    wantsAiBackground: boolean;
}

const COLOR_KEYWORDS: Record<string, { background: string; accent: string }> = {
    blue: { background: '#0f172a', accent: '#2563eb' },
    navy: { background: '#0b1220', accent: '#1d4ed8' },
    brown: { background: '#2b1d12', accent: '#92400e' },
    coffee: { background: '#2b1d12', accent: '#92400e' },
    green: { background: '#052e16', accent: '#16a34a' },
    red: { background: '#450a0a', accent: '#dc2626' },
    orange: { background: '#431407', accent: '#ea580c' },
    purple: { background: '#2e1065', accent: '#7c3aed' },
    pink: { background: '#500724', accent: '#db2777' },
    yellow: { background: '#422006', accent: '#eab308' },
    teal: { background: '#042f2e', accent: '#0d9488' },
    black: { background: '#09090b', accent: '#fafafa' },
    'dark-mode': { background: '#09090b', accent: '#38bdf8' },
    dark: { background: '#09090b', accent: '#38bdf8' },
    white: { background: '#ffffff', accent: '#0f172a' },
    light: { background: '#f8fafc', accent: '#0f172a' },
};

/**
 * Extracts concrete design directives from a natural-language prompt so the
 * offline fallback planner still honors requested sizes and palettes.
 */
export function parsePromptDesignHints(prompt: string): PromptDesignHints {
    const hints: PromptDesignHints = { wantsAiBackground: false };
    const lower = prompt.toLowerCase();

    const dimensionMatch = lower.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})/);
    if (dimensionMatch) {
        const w = parseInt(dimensionMatch[1], 10);
        const h = parseInt(dimensionMatch[2], 10);
        if (w >= 16 && h >= 16 && w <= 8192 && h <= 8192) {
            hints.width = w;
            hints.height = h;
        }
    }

    for (const [keyword, colors] of Object.entries(COLOR_KEYWORDS)) {
        if (lower.includes(keyword)) {
            hints.backgroundColor = colors.background;
            hints.accentColor = colors.accent;
            break;
        }
    }

    hints.wantsAiBackground = /\b(photo|photograph|image of|scene|landscape|realistic|illustration|generate .*background|ai background)\b/.test(lower);

    const quotedTitle = prompt.match(/["“”']([^"“”']{2,80})["“”']/);
    if (quotedTitle) hints.title = quotedTitle[1];

    return hints;
}

/**
 * Generates an execution step plan based on a prompt and brand profile rules.
 */
export function generateSuperAgentPlan(
    userPrompt: string,
    agent: CustomAgentDefinition,
    brandProfile?: BrandProfile
): AgentExecutionPlan {
    const hints = parsePromptDesignHints(userPrompt);
    const width = hints.width || agent.defaultWidth || 1080;
    const height = hints.height || agent.defaultHeight || 1080;
    const primaryColor = hints.accentColor || brandProfile?.palette.primary || '#2563eb';
    const secondaryColor = hints.backgroundColor || brandProfile?.palette.secondary || '#0f172a';
    const font = brandProfile?.typography.primaryFont || 'Inter';
    const accentFont = brandProfile?.typography.accentFont || 'Outfit';
    const title = hints.title || (userPrompt.length > 40 ? userPrompt.slice(0, 40) + '...' : userPrompt);

    const backgroundStep: AgentStepPlanItem = hints.wantsAiBackground
        ? {
            id: 'step-2-bg',
            action: 'GENERATE_AI_BACKGROUND',
            description: 'Generate AI background image from prompt',
            params: { prompt: userPrompt, width, height, fallbackColor: secondaryColor },
            status: 'pending',
        }
        : {
            id: 'step-2-bg',
            action: 'SET_BACKGROUND_COLOR',
            description: `Apply background color (${secondaryColor})`,
            params: { color: secondaryColor },
            status: 'pending',
        };

    const steps: AgentStepPlanItem[] = [
        {
            id: 'step-1-size',
            action: 'SET_CANVAS_SIZE',
            description: `Set canvas artboard to ${width}x${height}px`,
            params: { width, height },
            status: 'pending',
        },
        backgroundStep,
        {
            id: 'step-3-accent-shape',
            action: 'ADD_SHAPE',
            description: `Add accent card backdrop (${primaryColor})`,
            params: {
                shapeType: 'rect',
                left: Math.round(width * 0.08),
                top: Math.round(height * 0.12),
                width: Math.round(width * 0.84),
                height: Math.round(height * 0.76),
                fill: primaryColor,
                rx: 16,
                ry: 16,
            },
            status: 'pending',
        },
        {
            id: 'step-4-title-text',
            action: 'ADD_TEXT',
            description: `Add main title heading`,
            params: {
                text: title,
                fontSize: Math.round(width * 0.05),
                fontFamily: accentFont,
                fill: '#ffffff',
                left: Math.round(width * 0.15),
                top: Math.round(height * 0.25),
            },
            status: 'pending',
        },
        {
            id: 'step-5-subtitle-text',
            action: 'ADD_TEXT',
            description: `Add subtitle callout`,
            params: {
                text: 'Created by ' + agent.name,
                fontSize: Math.round(width * 0.028),
                fontFamily: font,
                fill: '#f8fafc',
                left: Math.round(width * 0.15),
                top: Math.round(height * 0.45),
            },
            status: 'pending',
        },
        {
            id: 'step-6-audit',
            action: 'RUN_BRAND_AUDIT',
            description: `Delegate to AI Brand Manager for compliance audit`,
            params: { profileId: brandProfile?.id },
            status: 'pending',
        },
    ];

    return {
        id: `plan-${Date.now()}`,
        agentId: agent.id,
        agentName: agent.name,
        prompt: userPrompt,
        steps,
        status: 'planned',
        summary: `Plan generated for "${userPrompt}" with ${steps.length} sequential execution steps.`,
    };
}

const VALID_STEP_ACTIONS: AgentStepAction[] = [
    'SET_CANVAS_SIZE',
    'SET_BACKGROUND_COLOR',
    'GENERATE_AI_BACKGROUND',
    'ADD_TEXT',
    'ADD_SHAPE',
    'RUN_BRAND_AUDIT',
];

/**
 * Builds the planning prompt sent to the local/external LLM. The model plans
 * the concrete step list; the heuristic template is only the offline fallback.
 */
export function buildSuperAgentPlanLlmPrompt(
    userPrompt: string,
    agent: CustomAgentDefinition,
    brandProfile?: BrandProfile
): string {
    const brand = brandProfile
        ? `BRAND KIT "${brandProfile.name}": primary ${brandProfile.palette.primary}, secondary ${brandProfile.palette.secondary}, accent ${brandProfile.palette.accent}, fonts ${brandProfile.typography.allowedFonts.join(', ')} (primary "${brandProfile.typography.primaryFont}"), min margin ${brandProfile.layout.minMargin}px.`
        : 'No brand kit active — use tasteful modern defaults.';

    return `${agent.systemPrompt}

You plan design tasks as an ordered JSON list of canvas operations.
${brand}
Default canvas: ${agent.defaultWidth}x${agent.defaultHeight}px (override if the user asks for a size).

Allowed actions and params:
- SET_CANVAS_SIZE {width, height}
- SET_BACKGROUND_COLOR {color}
- GENERATE_AI_BACKGROUND {prompt, width, height, fallbackColor}
- ADD_TEXT {text, fontSize, fontFamily, fill, left, top}
- ADD_SHAPE {shapeType:"rect", left, top, width, height, fill, rx, ry}
- RUN_BRAND_AUDIT {}

Rules: first step must be SET_CANVAS_SIZE; last step must be RUN_BRAND_AUDIT; use brand fonts/colors; keep all elements inside margins; 4-10 steps total.

USER REQUEST: ${userPrompt}

Return ONLY a JSON array like:
[{"action":"SET_CANVAS_SIZE","description":"...","params":{"width":1080,"height":1080}}, ...]`;
}

/**
 * Parses and validates an LLM planning response into an execution plan.
 * Returns null when the response has no usable step list.
 */
export function parseLlmPlanResponse(
    responseText: string,
    userPrompt: string,
    agent: CustomAgentDefinition
): AgentExecutionPlan | null {
    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(arrayMatch[0]);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const steps: AgentStepPlanItem[] = [];
    for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const candidate = item as { action?: string; description?: string; params?: Record<string, unknown> };
        const action = String(candidate.action || '').toUpperCase() as AgentStepAction;
        if (!VALID_STEP_ACTIONS.includes(action)) continue;
        steps.push({
            id: `step-${steps.length + 1}-${action.toLowerCase()}`,
            action,
            description: String(candidate.description || action),
            params: candidate.params && typeof candidate.params === 'object' ? candidate.params : {},
            status: 'pending',
        });
    }

    if (steps.length < 2) return null;
    if (!steps.some((s) => s.action === 'RUN_BRAND_AUDIT')) {
        steps.push({
            id: `step-${steps.length + 1}-run_brand_audit`,
            action: 'RUN_BRAND_AUDIT',
            description: 'Delegate to AI Brand Manager for compliance audit',
            params: {},
            status: 'pending',
        });
    }

    return {
        id: `plan-${Date.now()}`,
        agentId: agent.id,
        agentName: agent.name,
        prompt: userPrompt,
        steps,
        status: 'planned',
        summary: `LLM plan generated for "${userPrompt}" with ${steps.length} steps.`,
    };
}

/**
 * Executes a single step action on a Fabric.js canvas instance.
 */
export async function executeAgentStepOnCanvas(
    step: AgentStepPlanItem,
    canvas: fabric.Canvas,
    brandProfile?: BrandProfile
): Promise<void> {
    switch (step.action) {
        case 'SET_CANVAS_SIZE': {
            const w = Number(step.params.width) || 1080;
            const h = Number(step.params.height) || 1080;
            if (typeof canvas.setDimensions === 'function') {
                canvas.setDimensions({ width: w, height: h });
            }
            (canvas as unknown as { artboard?: { width: number; height: number } }).artboard = { width: w, height: h };
            canvas.requestRenderAll();
            break;
        }

        case 'SET_BACKGROUND_COLOR': {
            const color = String(step.params.color || '#ffffff');
            canvas.backgroundColor = color;
            canvas.requestRenderAll();
            break;
        }

        case 'ADD_SHAPE': {
            const left = Number(step.params.left) || 50;
            const top = Number(step.params.top) || 50;
            const width = Number(step.params.width) || 200;
            const height = Number(step.params.height) || 200;
            const fill = String(step.params.fill || '#2563eb');
            const rx = Number(step.params.rx) || 0;
            const ry = Number(step.params.ry) || 0;

            const rect = new fabric.Rect({
                left,
                top,
                width,
                height,
                fill,
                rx,
                ry,
            });
            canvas.add(rect);
            canvas.requestRenderAll();
            break;
        }

        case 'ADD_TEXT': {
            const textStr = String(step.params.text || 'Sample Text');
            const left = Number(step.params.left) || 100;
            const top = Number(step.params.top) || 100;
            const fontSize = Number(step.params.fontSize) || 32;
            const fontFamily = String(step.params.fontFamily || 'Inter');
            const fill = String(step.params.fill || '#000000');

            const textObj = new fabric.Textbox(textStr, {
                left,
                top,
                fontSize,
                fontFamily,
                fill,
                width: Math.min(600, (canvas.getWidth() || 800) * 0.7),
            });
            canvas.add(textObj);
            canvas.requestRenderAll();
            break;
        }

        case 'GENERATE_AI_BACKGROUND': {
            const prompt = String(step.params.prompt || 'abstract background');
            const width = Number(step.params.width) || canvas.getWidth() || 1080;
            const height = Number(step.params.height) || canvas.getHeight() || 1080;
            const fallbackColor = String(step.params.fallbackColor || '#0f172a');

            let imageUrl: string | null = null;
            try {
                const prefs = typeof window !== 'undefined'
                    ? JSON.parse(localStorage.getItem('image-express-local-ai-preferences') || '{}') as {
                        ollamaBaseUrl?: string;
                        ollamaModel?: string;
                    }
                    : {};
                const response = await fetch('/api/ai/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt,
                        width,
                        height,
                        provider: 'remote',
                        specificProvider: String(step.params.specificProvider || 'ollama'),
                        localAiBaseUrl: prefs.ollamaBaseUrl,
                        localAiModel: prefs.ollamaModel,
                    }),
                });
                const data = await response.json() as { success?: boolean; imageUrl?: string };
                if (response.ok && data.success && data.imageUrl) {
                    imageUrl = data.imageUrl;
                }
            } catch {
                // generation unavailable — fall back to a solid brand background
            }

            if (imageUrl) {
                const img = await fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });
                const scale = Math.max(width / (img.width || width), height / (img.height || height));
                img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale, selectable: false, evented: false });
                img.set('id', '__super_agent_background__');
                canvas.add(img);
                canvas.sendObjectToBack(img);
            } else {
                canvas.backgroundColor = fallbackColor;
            }
            canvas.requestRenderAll();
            break;
        }

        case 'RUN_BRAND_AUDIT': {
            if (brandProfile) {
                const metadata = extractCanvasMetadata(canvas);
                runHeuristicBrandAudit(metadata, brandProfile);
            }
            break;
        }

        default:
            throw new Error(`Unsupported step action: ${step.action}`);
    }
}
