import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SOCIAL_AGENT, DEFAULT_SUPER_AGENT } from '@/lib/agent/superAgentEngine';

export async function GET() {
    return NextResponse.json({
        success: true,
        agents: [DEFAULT_SUPER_AGENT, DEFAULT_SOCIAL_AGENT],
    });
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as { agent?: typeof DEFAULT_SUPER_AGENT };
        if (!payload.agent) {
            return NextResponse.json({ success: false, message: 'Agent definition required' }, { status: 400 });
        }
        return NextResponse.json({
            success: true,
            agent: {
                ...payload.agent,
                updatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to save agent' },
            { status: 500 }
        );
    }
}
