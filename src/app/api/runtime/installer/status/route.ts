import { NextResponse } from 'next/server';
import { getInstallerRuntimeStatus } from '@/lib/server/installerRuntimeStatus';

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const requestUrl = new URL(request.url);
        const comfyDir = requestUrl.searchParams.get('comfyDir') || '';
        const status = await getInstallerRuntimeStatus(comfyDir);
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
