/** @jest-environment node */

import { GET } from '@/app/api/runtime/dependencies/status/route';

const mockGetDependencyRuntimeStatus = jest.fn();

jest.mock('@/lib/server/dependencyMaintenance', () => ({
    getDependencyRuntimeStatus: (...args: unknown[]) => mockGetDependencyRuntimeStatus(...args),
}));

describe('GET /api/runtime/dependencies/status', () => {
    it('returns dependency maintenance status', async () => {
        mockGetDependencyRuntimeStatus.mockResolvedValueOnce({
            enabled: true,
            checkedAt: '2026-05-17T18:00:00.000Z',
            projectName: 'creative-flow',
            projectVersion: '0.1.0',
            packageManager: 'npm',
            packageLockPresent: true,
            outdated: [],
            summary: {
                outdatedCount: 0,
                dependencyCount: 10,
                devDependencyCount: 5,
            },
        });

        const response = await GET(new Request('http://localhost:3000/api/runtime/dependencies/status'));
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.enabled).toBe(true);
        expect(data.packageManager).toBe('npm');
        expect(Array.isArray(data.outdated)).toBe(true);
        expect(typeof data.summary?.outdatedCount).toBe('number');
    });
});
