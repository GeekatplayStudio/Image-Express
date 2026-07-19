import { NextRequest, NextResponse } from 'next/server';
import { AmbienceInstallError, uninstallAmbience } from '@/lib/server/ambience-store';

export const dynamic = 'force-dynamic';

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await uninstallAmbience(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof AmbienceInstallError) {
            return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        console.error('Uninstall ambience error:', error);
        return NextResponse.json({ success: false, error: 'Failed to remove the pack.' }, { status: 500 });
    }
}
