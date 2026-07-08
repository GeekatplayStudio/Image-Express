/** @jest-environment node */

import { POST } from '@/app/api/runtime/installer/run/route';
import { runInstallerWorkflow } from '@/lib/server/installerRun';

jest.mock('@/lib/server/installerRun', () => ({
    isInstallerRunValidationError: (error: unknown) => (
        typeof (error as { statusCode?: unknown })?.statusCode === 'number'
    ),
    runInstallerWorkflow: jest.fn(),
}));

describe('POST /api/runtime/installer/run', () => {
    it('returns installer workflow result payload', async () => {
        const runInstallerWorkflowMock = runInstallerWorkflow as jest.MockedFunction<typeof runInstallerWorkflow>;
        runInstallerWorkflowMock.mockResolvedValueOnce({
            success: true,
            startedAt: '2026-04-03T10:00:00.000Z',
            finishedAt: '2026-04-03T10:00:01.000Z',
            durationMs: 1000,
            continueOnError: false,
            dryRun: true,
            steps: [],
            summary: {
                completedSteps: 0,
                failedSteps: 0,
            },
        });

        const request = new Request('http://localhost:3000/api/runtime/installer/run', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                dryRun: true,
                installComfy: true,
            }),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.summary).toEqual({
            completedSteps: 0,
            failedSteps: 0,
        });
    });

    it('returns validation error details on bad payload', async () => {
        const runInstallerWorkflowMock = runInstallerWorkflow as jest.MockedFunction<typeof runInstallerWorkflow>;
        runInstallerWorkflowMock.mockRejectedValueOnce({
            statusCode: 400,
            message: 'Select at least one installer or QA step.',
        });

        const request = new Request('http://localhost:3000/api/runtime/installer/run', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.message).toContain('Select at least one installer');
    });
});
