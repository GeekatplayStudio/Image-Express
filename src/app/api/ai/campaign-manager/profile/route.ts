import { NextRequest, NextResponse } from 'next/server';
import { enforceJsonBody } from '@/lib/server/apiContract';
import type { CampaignProfile } from '@/lib/campaign/campaignProfile';
import {
    deleteCampaignServer,
    readCampaigns,
    setActiveCampaignServer,
    upsertCampaign,
} from '@/lib/server/campaign-store';

export async function GET() {
    try {
        const { activeCampaignId, campaigns } = await readCampaigns();
        const activeCampaign = campaigns.find((c) => c.id === activeCampaignId) || campaigns[0] || null;
        return NextResponse.json({ success: true, campaigns, activeCampaign });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to load campaigns' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        // Campaigns embed data-URL assets and reference images, so the cap is roomy.
        const badBody = enforceJsonBody(request, 32 * 1024 * 1024);
        if (badBody) return badBody;
        const payload = await request.json() as {
            campaign?: CampaignProfile;
            activeCampaignId?: string;
        };

        if (!payload.campaign && payload.activeCampaignId) {
            const next = await setActiveCampaignServer(payload.activeCampaignId);
            return NextResponse.json({ success: true, ...next });
        }

        if (!payload.campaign?.id || typeof payload.campaign.name !== 'string') {
            return NextResponse.json({ success: false, message: 'Campaign payload required' }, { status: 400 });
        }

        const next = await upsertCampaign(payload.campaign);
        return NextResponse.json({
            success: true,
            ...next,
            campaign: next.campaigns.find((c) => c.id === payload.campaign?.id),
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to save campaign' },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const id = request.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json({ success: false, message: 'Campaign id required' }, { status: 400 });
        }
        const next = await deleteCampaignServer(id);
        return NextResponse.json({ success: true, ...next });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Failed to delete campaign' },
            { status: 500 },
        );
    }
}
