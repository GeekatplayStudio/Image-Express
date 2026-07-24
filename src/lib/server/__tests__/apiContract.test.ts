/** @jest-environment node */

import { z } from 'zod';
import {
    ApiRequestError,
    apiError,
    assertRequestContentLength,
    parseJsonRequest,
} from '../apiContract';

describe('apiContract', () => {
    it('returns a stable public error and request id', async () => {
        const request = new Request('http://localhost/api/test', {
            headers: { 'x-request-id': 'request-123' },
        });
        const response = apiError(request, {
            code: 'not_found',
            message: 'Not found.',
            status: 404,
        });

        expect(response.status).toBe(404);
        expect(response.headers.get('x-request-id')).toBe('request-123');
        await expect(response.json()).resolves.toEqual({
            error: {
                code: 'not_found',
                message: 'Not found.',
                retryable: false,
                requestId: 'request-123',
            },
            message: 'Not found.',
        });
    });

    it('rejects oversized requests before parsing', () => {
        const request = new Request('http://localhost/api/test', {
            headers: { 'content-length': '2048' },
        });
        expect(() => assertRequestContentLength(request, 1024)).toThrow(ApiRequestError);
    });

    it('validates bounded JSON requests', async () => {
        const request = new Request('http://localhost/api/test', {
            method: 'POST',
            body: JSON.stringify({ name: 'Image Express' }),
        });
        const result = await parseJsonRequest(
            request,
            z.object({ name: z.string().min(1) }),
            1024,
        );
        expect(result).toEqual({ name: 'Image Express' });
    });
});
