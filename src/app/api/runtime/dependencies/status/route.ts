import { NextResponse } from 'next/server';
import { getDependencyRuntimeStatus } from '@/lib/server/dependencyMaintenance';
import { authorizeLocalRuntimeCapability } from '@/lib/server/runtimeProfile';

export async function GET(request: Request): Promise<NextResponse> {
    const unauthorized = authorizeLocalRuntimeCapability(request, 'dependencies:manage');
    if (unauthorized) return unauthorized;
    try {
        const status = await getDependencyRuntimeStatus();
        return NextResponse.json(status, {
            headers: {
                'cache-control': 'no-store',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read dependency maintenance status.';
        return NextResponse.json({ message }, {
            status: 500,
            headers: {
                'cache-control': 'no-store',
            },
        });
    }
}
