import { NextResponse } from 'next/server';
import {
    isInstallerRunValidationError,
    runInstallerWorkflow,
} from '@/lib/server/installerRun';

export async function POST(request: Request): Promise<NextResponse> {
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
