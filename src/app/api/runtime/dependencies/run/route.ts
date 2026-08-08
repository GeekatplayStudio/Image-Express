import { NextResponse } from 'next/server';
import { enforceJsonBody } from '@/lib/server/apiContract';
import {
    isDependencyMaintenanceValidationError,
    runDependencyMaintenance,
} from '@/lib/server/dependencyMaintenance';
import { authorizeLocalRuntimeCapability } from '@/lib/server/runtimeProfile';

export async function POST(request: Request): Promise<NextResponse> {
    const unauthorized = authorizeLocalRuntimeCapability(request, 'dependencies:manage');
    if (unauthorized) return unauthorized;
    try {
// The maintenance routine validates the shape; this bounds the size.
const badBody = enforceJsonBody(request, 1024 * 1024);
if (badBody) return badBody;
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
