import { NextRequest, NextResponse } from 'next/server';
import { BrandProfile } from '@/lib/brand/brandProfile';
import {
    deleteBrandProfileServer,
    readBrandProfiles,
    setActiveBrandProfileServer,
    upsertBrandProfile,
} from '@/lib/server/brand-agent-store';

export async function GET() {
    try {
        const { activeProfileId, profiles } = await readBrandProfiles();
        const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
        return NextResponse.json({ success: true, profiles, activeProfile });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to load brand profiles' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as {
            profile?: BrandProfile;
            activeProfileId?: string;
        };

        // Switching the active profile without saving a profile body
        if (!payload.profile && payload.activeProfileId) {
            const next = await setActiveBrandProfileServer(payload.activeProfileId);
            return NextResponse.json({ success: true, ...next });
        }

        if (!payload.profile?.id) {
            return NextResponse.json({ success: false, message: 'Profile payload required' }, { status: 400 });
        }

        const next = await upsertBrandProfile(payload.profile);
        return NextResponse.json({
            success: true,
            ...next,
            profile: next.profiles.find((p) => p.id === payload.profile?.id),
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to save brand profile' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const id = request.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json({ success: false, message: 'Profile id required' }, { status: 400 });
        }
        const next = await deleteBrandProfileServer(id);
        return NextResponse.json({ success: true, ...next });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to delete brand profile' },
            { status: 500 }
        );
    }
}
