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

export interface AgentStepPlanItem {
    id: string;
    action: 'SET_CANVAS_SIZE' | 'SET_BACKGROUND_COLOR' | 'ADD_TEXT' | 'ADD_SHAPE' | 'RUN_BRAND_AUDIT';
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

export function deleteCustomAgent(id: string): CustomAgentDefinition[] {
    const agents = loadCustomAgents();
    const filtered = agents.filter((a) => a.id !== id);
    const result = filtered.length > 0 ? filtered : [DEFAULT_SUPER_AGENT];
    saveCustomAgents(result);
    return result;
}

/**
 * Generates an execution step plan based on a prompt and brand profile rules.
 */
export function generateSuperAgentPlan(
    userPrompt: string,
    agent: CustomAgentDefinition,
    brandProfile?: BrandProfile
): AgentExecutionPlan {
    const width = agent.defaultWidth || 1080;
    const height = agent.defaultHeight || 1080;
    const primaryColor = brandProfile?.palette.primary || '#2563eb';
    const secondaryColor = brandProfile?.palette.secondary || '#0f172a';
    const font = brandProfile?.typography.primaryFont || 'Inter';
    const accentFont = brandProfile?.typography.accentFont || 'Outfit';

    const steps: AgentStepPlanItem[] = [
        {
            id: 'step-1-size',
            action: 'SET_CANVAS_SIZE',
            description: `Set canvas artboard to ${width}x${height}px`,
            params: { width, height },
            status: 'pending',
        },
        {
            id: 'step-2-bg',
            action: 'SET_BACKGROUND_COLOR',
            description: `Apply background color (${secondaryColor})`,
            params: { color: secondaryColor },
            status: 'pending',
        },
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
                text: userPrompt.length > 30 ? userPrompt.slice(0, 30) + '...' : userPrompt,
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
