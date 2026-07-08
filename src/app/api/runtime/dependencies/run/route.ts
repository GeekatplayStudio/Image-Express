import { NextResponse } from 'next/server';
import {
    isDependencyMaintenanceValidationError,
    runDependencyMaintenance,
} from '@/lib/server/dependencyMaintenance';

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const payload = await request.json().catch(() => ({}));
        const result = await runDependencyMaintenance(payload);
        return NextResponse.json(result, {
            headers: {
                'cache-control': 'no-store',
            },
        });
    } catch (error) {
        if (isDependencyMaintenanceValidationError(error)) {
            return NextResponse.json({ message: error.message }, {
                status: error.statusCode,
                headers: {
                    'cache-control': 'no-store',
                },
            });
        }

        const message = error instanceof Error ? error.message : 'Failed to run dependency maintenance.';
        return NextResponse.json({ message }, {
            status: 500,
            headers: {
                'cache-control': 'no-store',
            },
        });
    }
}