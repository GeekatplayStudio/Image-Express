import { NextResponse } from 'next/server';
import { listInstalledAmbience } from '@/lib/server/ambience-store';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const packs = await listInstalledAmbience();
        return NextResponse.json({ success: true, packs });
    } catch (error) {
        console.error('List ambience error:', error);
        return NextResponse.json({ success: false, error: 'Failed to list ambience packs.' }, { status: 500 });
    }
}
