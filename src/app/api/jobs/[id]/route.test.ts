/** @jest-environment node */

import { GET as getJobStatus } from './route';
import { GET as getJobResult } from './result/route';

const mockReadGenerateJob = jest.fn();
const mockCleanupGenerateJobArtifacts = jest.fn();

jest.mock('@/lib/agentic-edit/jobs', () => ({
    readGenerateJob: (...args: unknown[]) => mockReadGenerateJob(...args),
    cleanupGenerateJobArtifacts: (...args: unknown[]) => mockCleanupGenerateJobArtifacts(...args),
}));

const request = () => new Request('http://localhost/api/jobs/test', {
    headers: { 'x-request-id': 'request-test-123' },
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('generation job API contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects path-like identifiers before reading persistence', async () => {
        const response = await getJobStatus(request(), context('../../outside'));
        expect(response.status).toBe(400);
        expect(mockReadGenerateJob).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: 'invalid_job_id',
                requestId: 'request-test-123',
            },
        });
    });

    it('returns a typed status payload for a valid job', async () => {
        mockReadGenerateJob.mockResolvedValueOnce({
            state: {
                id: 'job_12345678-1234-1234-1234-123456789abc',
                status: 'running',
                progress: 0.5,
                message: 'Working',
                createdAt: '2026-07-23T00:00:00.000Z',
                updatedAt: '2026-07-23T00:00:01.000Z',
            },
        });
        const response = await getJobStatus(
            request(),
            context('job_12345678-1234-1234-1234-123456789abc'),
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            status: 'running',
            progress: 0.5,
        });
    });

    it('returns and cleans up a completed result', async () => {
        mockReadGenerateJob.mockResolvedValueOnce({
            state: {
                id: 'job_12345678-1234-1234-1234-123456789abc',
                status: 'succeeded',
            },
            output: {
                imageUrl: '/api/assets/serve/generated/images/output.png',
                meta: { provider: 'test' },
            },
        });
        const response = await getJobResult(
            request(),
            context('job_12345678-1234-1234-1234-123456789abc'),
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            imageUrl: '/api/assets/serve/generated/images/output.png',
            meta: { provider: 'test' },
        });
        expect(mockCleanupGenerateJobArtifacts).toHaveBeenCalledWith(
            'job_12345678-1234-1234-1234-123456789abc',
            { removeJobRecord: true, removeUploads: true },
        );
    });
});
