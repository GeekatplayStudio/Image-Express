import { NextResponse } from 'next/server';
import { getInstallerRuntimeStatus } from '@/lib/server/installerRuntimeStatus';

export async function GET(): Promise<NextResponse> {
    try {
        const status = await getInstallerRuntimeStatus();
        return NextResponse.json(status, {
            headers: {
                'cache-control': 'no-store',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read installer runtime status.';
        return NextResponse.json({
            message,
        }, {
            status: 500,
            headers: {
                'cache-control': 'no-store',
            },
        });
    }
}
