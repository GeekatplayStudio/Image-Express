import { NextResponse } from 'next/server';
import { getInstallerRuntimeStatus } from '@/lib/server/installerRuntimeStatus';
import { authorizeLocalRuntimeCapability } from '@/lib/server/runtimeProfile';

export async function GET(request: Request): Promise<NextResponse> {
    const unauthorized = authorizeLocalRuntimeCapability(request, 'runtime:install');
    if (unauthorized) return unauthorized;
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
