import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SUPER_AGENT, generateSuperAgentPlan } from '@/lib/agent/superAgentEngine';
import { DEFAULT_BRAND_PROFILE } from '@/lib/brand/brandProfile';

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as {
            prompt?: string;
            agent?: typeof DEFAULT_SUPER_AGENT;
            brandProfile?: typeof DEFAULT_BRAND_PROFILE;
        };

        const prompt = payload.prompt?.trim() || 'Create a product promo banner';
        const agent = payload.agent || DEFAULT_SUPER_AGENT;
        const brandProfile = payload.brandProfile || DEFAULT_BRAND_PROFILE;

        const plan = generateSuperAgentPlan(prompt, agent, brandProfile);

        return NextResponse.json({
            success: true,
            plan,
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Super agent planning failed' },
            { status: 500 }
        );
    }
}
