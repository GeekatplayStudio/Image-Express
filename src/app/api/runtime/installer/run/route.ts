import { NextResponse } from 'next/server';
import {
    isInstallerRunValidationError,
    runInstallerWorkflow,
} from '@/lib/server/installerRun';
import { authorizeLocalRuntimeCapability } from '@/lib/server/runtimeProfile';

export async function POST(request: Request): Promise<NextResponse> {
    const unauthorized = authorizeLocalRuntimeCapability(request, 'runtime:install');
    if (unauthorized) return unauthorized;
    try {
        const payload = await request.json().catch(() => ({}));
        const result = await runInstallerWorkflow(payload);
        return NextResponse.json(result, {
            headers: {
                'cache-control': 'no-store',
            },
        });
    } catch (error) {
        if (isInstallerRunValidationError(error)) {
            return NextResponse.json({
                message: error.message,
            }, {
                status: error.statusCode,
                headers: {
                    'cache-control': 'no-store',
                },
            });
        }

        const message = error instanceof Error ? error.message : 'Failed to run installer workflow.';
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
