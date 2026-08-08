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
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Image Express' }),
        });
        const result = await parseJsonRequest(
            request,
            z.object({ name: z.string().min(1) }),
            1024,
        );
        expect(result).toEqual({ name: 'Image Express' });
    });

    // Requiring a JSON content type is this app's CSRF defence, not a
    // formality: a cross-origin POST carrying text/plain is a *simple* request
    // that browsers deliver without a preflight, and nothing here checked the
    // type, so a JSON body inside one parsed and took effect.
    describe('content type enforcement', () => {
        const send = (contentType?: string) => new Request('http://localhost/api/test', {
            method: 'POST',
            headers: contentType ? { 'content-type': contentType } : {},
            body: JSON.stringify({ name: 'Image Express' }),
        });
        const schema = z.object({ name: z.string().min(1) });

        it.each([
            'text/plain',
            'application/x-www-form-urlencoded',
            'multipart/form-data',
        ])('rejects %s, the types that avoid a preflight', async (type) => {
            await expect(parseJsonRequest(send(type), schema, 1024)).rejects.toMatchObject({
                code: 'unsupported_media_type',
                status: 415,
            });
        });

        it('rejects a missing content type', async () => {
            await expect(parseJsonRequest(send(), schema, 1024)).rejects.toMatchObject({ status: 415 });
        });

        it('accepts a charset parameter', async () => {
            await expect(parseJsonRequest(send('application/json; charset=utf-8'), schema, 1024))
                .resolves.toEqual({ name: 'Image Express' });
        });

        it('is case-insensitive', async () => {
            await expect(parseJsonRequest(send('Application/JSON'), schema, 1024))
                .resolves.toEqual({ name: 'Image Express' });
        });

        it('accepts structured-suffix JSON types', async () => {
            await expect(parseJsonRequest(send('application/merge-patch+json'), schema, 1024))
                .resolves.toEqual({ name: 'Image Express' });
        });
    });
});
