import {
    GenerateJobIdSchema,
    GenerateJobStatusSchema,
    isGenerateJobId,
} from '../agenticEditJob';

describe('agentic edit job contracts', () => {
    it('accepts generated UUID job identifiers and rejects path-like values', () => {
        expect(isGenerateJobId('job_12345678-1234-1234-1234-123456789abc')).toBe(true);
        expect(isGenerateJobId('../../outside')).toBe(false);
        expect(GenerateJobIdSchema.safeParse('job_not-a-uuid').success).toBe(false);
    });

    it('rejects impossible job progress values', () => {
        const result = GenerateJobStatusSchema.safeParse({
            id: 'job_12345678-1234-1234-1234-123456789abc',
            status: 'running',
            progress: 2,
            message: 'Working',
            createdAt: '2026-07-23T00:00:00.000Z',
            updatedAt: '2026-07-23T00:00:01.000Z',
        });
        expect(result.success).toBe(false);
    });
});
