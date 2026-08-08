/** @jest-environment node */

import { POST } from '@/app/api/runtime/dependencies/run/route';
import { DependencyMaintenanceValidationError } from '@/lib/server/dependencyMaintenance';

const mockRunDependencyMaintenance = jest.fn();

jest.mock('@/lib/server/dependencyMaintenance', () => {
    const actual = jest.requireActual('@/lib/server/dependencyMaintenance');
    return {
        ...actual,
        runDependencyMaintenance: (...args: unknown[]) => mockRunDependencyMaintenance(...args),
    };
});

describe('POST /api/runtime/dependencies/run', () => {
    it('returns dependency maintenance results', async () => {
        mockRunDependencyMaintenance.mockResolvedValueOnce({
            success: true,
            startedAt: '2026-05-17T18:00:00.000Z',
            finishedAt: '2026-05-17T18:01:00.000Z',
            durationMs: 60000,
            strategy: 'latest',
            runBuild: true,
            updatedPackages: [],
            steps: [],
            summary: {
                outdatedCount: 0,
                updatedCount: 0,
                failedSteps: 0,
            },
        });

        const response = await POST(new Request('http://localhost:3000/api/runtime/dependencies/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ strategy: 'latest', runBuild: true }),
        }));

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.strategy).toBe('latest');
    });

    it('returns validation errors with the provided status code', async () => {
        mockRunDependencyMaintenance.mockRejectedValueOnce(
            new DependencyMaintenanceValidationError('Blocked', 403),
        );

        const response = await POST(new Request('http://localhost:3000/api/runtime/dependencies/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ strategy: 'latest', runBuild: true }),
        }));

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.message).toBe('Blocked');
    });
});