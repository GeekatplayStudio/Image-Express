import { runAgenticEditJob } from '../agenticEditJobClient';
import type { OperationState } from '@/shared/application/operationState';
import type { GenerateJobResult } from '../../contracts/agenticEditJob';

const jsonResponse = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
}) as Response;

describe('runAgenticEditJob', () => {
    it('queues, polls, and returns a validated result', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ job_id: 'job_12345678-1234-1234-1234-123456789abc' }))
            .mockResolvedValueOnce(jsonResponse({
                id: 'job_12345678-1234-1234-1234-123456789abc',
                status: 'running',
                progress: 0.5,
                message: 'Working',
                createdAt: '2026-07-23T00:00:00.000Z',
                updatedAt: '2026-07-23T00:00:01.000Z',
            }))
            .mockResolvedValueOnce(jsonResponse({
                id: 'job_12345678-1234-1234-1234-123456789abc',
                status: 'succeeded',
                progress: 1,
                message: 'Done',
                createdAt: '2026-07-23T00:00:00.000Z',
                updatedAt: '2026-07-23T00:00:02.000Z',
            }))
            .mockResolvedValueOnce(jsonResponse({
                imageUrl: '/api/assets/serve/generated/images/output.png',
                meta: { provider: 'test' },
            }));
        const states: Array<OperationState<GenerateJobResult>> = [];

        const result = await runAgenticEditJob(new FormData(), {
            signal: new AbortController().signal,
            fetchImpl: fetchImpl as typeof fetch,
            wait: async () => undefined,
            now: jest.fn()
                .mockReturnValueOnce(0)
                .mockReturnValueOnce(1)
                .mockReturnValueOnce(2),
            maxWaitMs: 100,
            onState: (state) => states.push(state),
        });

        expect(result.imageUrl).toContain('output.png');
        expect(states.map((state) => state.status)).toEqual([
            'validating',
            'running',
            'running',
            'running',
            'succeeded',
        ]);
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it('emits a failed state for a public API error', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
            error: {
                code: 'queue_failed',
                message: 'Queue is unavailable.',
                retryable: true,
                requestId: 'request-123',
            },
            message: 'Queue is unavailable.',
        }, 503));
        const states: Array<OperationState<GenerateJobResult>> = [];

        await expect(runAgenticEditJob(new FormData(), {
            signal: new AbortController().signal,
            fetchImpl: fetchImpl as typeof fetch,
            onState: (state) => states.push(state),
        })).rejects.toThrow('Queue is unavailable.');

        expect(states.at(-1)).toMatchObject({
            status: 'failed',
            error: {
                code: 'queue_failed',
                retryable: true,
                requestId: 'request-123',
            },
        });
    });

    it('emits cancelled when aborted before queueing', async () => {
        const controller = new AbortController();
        controller.abort();
        const states: Array<OperationState<GenerateJobResult>> = [];

        await expect(runAgenticEditJob(new FormData(), {
            signal: controller.signal,
            fetchImpl: jest.fn() as unknown as typeof fetch,
            onState: (state) => states.push(state),
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(states.at(-1)).toEqual({ status: 'cancelled' });
    });
});
