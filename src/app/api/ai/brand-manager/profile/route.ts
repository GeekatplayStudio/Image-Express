import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_BRAND_PROFILE } from '@/lib/brand/brandProfile';

export async function GET() {
    return NextResponse.json({
        success: true,
        profiles: [DEFAULT_BRAND_PROFILE],
        activeProfile: DEFAULT_BRAND_PROFILE,
    });
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as { profile?: typeof DEFAULT_BRAND_PROFILE };
        if (!payload.profile) {
            return NextResponse.json({ success: false, message: 'Profile payload required' }, { status: 400 });
        }
        return NextResponse.json({
            success: true,
            profile: {
                ...payload.profile,
                updatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to save brand profile' },
            { status: 500 }
        );
    }
}
