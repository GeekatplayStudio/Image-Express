/** @jest-environment node */

import { isImageDataUrl, pollUpscaleTask, runUpscaleJob } from '@/lib/server/upscaleProxy';

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`;

const jobFor = (provider: string) => ({
    provider,
    image: PNG_DATA_URL,
    scale: 2,
    creativity: 0.5,
    sourceWidth: 100,
    sourceHeight: 50,
});

describe('isImageDataUrl', () => {
    it('accepts base64 image data URLs and rejects everything else', () => {
        expect(isImageDataUrl(PNG_DATA_URL)).toBe(true);
        expect(isImageDataUrl('data:image/webp;base64,AAAA')).toBe(true);
        expect(isImageDataUrl('https://example.com/cat.png')).toBe(false);
        expect(isImageDataUrl('data:text/html;base64,AAAA')).toBe(false);
        expect(isImageDataUrl(42)).toBe(false);
    });
});

describe('runUpscaleJob', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('rejects unknown providers without any network call', async () => {
        const fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        const result = await runUpscaleJob(jobFor('made-up'), 'key');
        expect(result).toEqual({ kind: 'error', statusCode: 400, message: expect.stringContaining('made-up') });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('runs Fal end to end: submit, then fetch the result URL as a data URL', async () => {
        const resultBytes = Buffer.from('upscaled-bytes');
        const fetchMock = jest.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ image: { url: 'https://cdn.fal.example/out.png' } }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(new Uint8Array(resultBytes), {
                status: 200,
                headers: { 'content-type': 'image/png' },
            }));
        global.fetch = fetchMock as unknown as typeof fetch;

        const result = await runUpscaleJob(jobFor('fal'), 'fal-key');
        expect(result).toEqual({
            kind: 'image',
            image: `data:image/png;base64,${resultBytes.toString('base64')}`,
        });

        const [submitUrl, submitInit] = fetchMock.mock.calls[0];
        expect(submitUrl).toBe('https://fal.run/fal-ai/clarity-upscaler');
        expect((submitInit.headers as Record<string, string>).Authorization).toBe('Key fal-key');
        const body = JSON.parse(submitInit.body as string);
        expect(body.upscale_factor).toBe(2);
        expect(body.image_url).toBe(PNG_DATA_URL);
    });

    it('surfaces upstream error messages with the provider label', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(new Response(
            JSON.stringify({ message: 'Invalid API key' }),
            { status: 401 },
        )) as unknown as typeof fetch;

        const result = await runUpscaleJob(jobFor('fal'), 'bad');
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
            expect(result.statusCode).toBe(401);
            expect(result.message).toContain('Fal.ai');
            expect(result.message).toContain('Invalid API key');
        }
    });

    it('returns a task id from Freepik and completes through polling', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(new Response(
            JSON.stringify({ data: { task_id: 'task-1', status: 'IN_PROGRESS' } }),
            { status: 200 },
        )) as unknown as typeof fetch;
        const submitted = await runUpscaleJob(jobFor('freepik'), 'fp-key');
        expect(submitted).toEqual({ kind: 'task', taskId: 'task-1' });

        const resultBytes = Buffer.from('magnific-bytes');
        global.fetch = jest.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: { status: 'COMPLETED', generated: ['https://cdn.freepik.example/out.png'] },
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(new Uint8Array(resultBytes), {
                status: 200,
                headers: { 'content-type': 'image/png' },
            })) as unknown as typeof fetch;
        const polled = await pollUpscaleTask('freepik', 'task-1', 'fp-key');
        expect(polled).toEqual({
            kind: 'image',
            image: `data:image/png;base64,${resultBytes.toString('base64')}`,
        });
    });

    it('refuses a Topaz job without source dimensions', async () => {
        const job = { ...jobFor('topaz'), sourceWidth: undefined, sourceHeight: undefined };
        const result = await runUpscaleJob(job, 'tz-key');
        expect(result).toEqual({ kind: 'error', statusCode: 400, message: expect.stringContaining('dimensions') });
    });

    it('rejects provider result URLs that point into private networks', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(new Response(
            JSON.stringify({ image: { url: 'http://169.254.169.254/latest/meta-data' } }),
            { status: 200 },
        )) as unknown as typeof fetch;

        const result = await runUpscaleJob(jobFor('fal'), 'fal-key');
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
            expect(result.statusCode).toBe(502);
            expect(result.message).toContain('unfetchable');
        }
    });
});
