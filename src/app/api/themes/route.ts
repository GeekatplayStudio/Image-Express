import { NextResponse } from 'next/server';
import { listInstalledThemes } from '@/lib/server/ui-theme-store';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const themes = await listInstalledThemes();
        return NextResponse.json({ success: true, themes });
    } catch (error) {
        console.error('List themes error:', error);
        return NextResponse.json({ success: false, error: 'Failed to list themes.' }, { status: 500 });
    }
}
