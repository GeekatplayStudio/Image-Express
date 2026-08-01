import { NextRequest, NextResponse } from 'next/server';
import { CustomAgentDefinition } from '@/lib/agent/superAgentEngine';
import {
    deleteCustomAgentServer,
    readCustomAgents,
    upsertCustomAgent,
} from '@/lib/server/brand-agent-store';

export async function GET() {
    try {
        const agents = await readCustomAgents();
        return NextResponse.json({ success: true, agents });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to load agents' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as { agent?: Partial<CustomAgentDefinition> };
        if (!payload.agent?.name) {
            return NextResponse.json({ success: false, message: 'Agent definition required' }, { status: 400 });
        }
        // MCP clients may send a partial definition — fill sane defaults.
        const agent: CustomAgentDefinition = {
            id: payload.agent.id || `custom-agent-${Date.now()}`,
            name: payload.agent.name,
            description: payload.agent.description || 'Custom user agent definition.',
            systemPrompt: payload.agent.systemPrompt || 'You are a specialized graphics agent.',
            role: payload.agent.role || 'Specialized Sub-Agent',
            defaultWidth: payload.agent.defaultWidth || 1080,
            defaultHeight: payload.agent.defaultHeight || 1080,
            preferredModel: payload.agent.preferredModel,
            enabledTools: payload.agent.enabledTools || ['set_canvas_size', 'add_text', 'add_shape', 'set_background', 'generate_ai_background'],
            updatedAt: new Date().toISOString(),
        };
        const agents = await upsertCustomAgent(agent);
        return NextResponse.json({
            success: true,
            agents,
            agent: agents.find((a) => a.id === agent.id),
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to save agent' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const id = request.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json({ success: false, message: 'Agent id required' }, { status: 400 });
        }
        const agents = await deleteCustomAgentServer(id);
        return NextResponse.json({ success: true, agents });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to delete agent' },
            { status: 500 }
        );
    }
}
