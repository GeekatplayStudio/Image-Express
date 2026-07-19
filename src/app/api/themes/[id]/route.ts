import { NextRequest, NextResponse } from 'next/server';
import { ThemeInstallError, uninstallTheme } from '@/lib/server/ui-theme-store';

export const dynamic = 'force-dynamic';

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await uninstallTheme(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof ThemeInstallError) {
            return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        console.error('Uninstall theme error:', error);
        return NextResponse.json({ success: false, error: 'Failed to remove the theme.' }, { status: 500 });
    }
}
