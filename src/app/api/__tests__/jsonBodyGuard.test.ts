/**
 * @jest-environment node
 */

import { enforceJsonBody } from '@/lib/server/apiContract';

/**
 * Routes that read the body themselves each have their own error shape and
 * their own `catch`. A *thrown* validation error surfaced as whatever that
 * catch returned — usually a 500, which is the wrong answer for a 415 or a 413
 * and hides the real cause from the caller. This guard returns the response
 * instead of throwing, so the status stays correct wherever it is used.
 */

const request = (headers: Record<string, string>) =>
    new Request('http://localhost/api/anything', { method: 'POST', headers });

describe('enforceJsonBody', () => {
    it('passes a well-formed JSON request through', () => {
        expect(enforceJsonBody(request({ 'content-type': 'application/json' }), 1024)).toBeNull();
    });

    it('answers 415 for a non-JSON content type', async () => {
        const response = enforceJsonBody(request({ 'content-type': 'text/plain' }), 1024);
        expect(response?.status).toBe(415);
        await expect(response!.json()).resolves.toMatchObject({ success: false });
    });

    it('answers 415 when the content type is missing', () => {
        expect(enforceJsonBody(request({}), 1024)?.status).toBe(415);
    });

    it('answers 413 for an oversized body', () => {
        const response = enforceJsonBody(request({
            'content-type': 'application/json',
            'content-length': '4096',
        }), 1024);
        expect(response?.status).toBe(413);
    });

    it('answers 400 for a nonsense content length', () => {
        expect(enforceJsonBody(request({
            'content-type': 'application/json',
            'content-length': 'not-a-number',
        }), 1024)?.status).toBe(400);
    });

    it('checks the content type before the size', () => {
        // A caller sending the wrong type AND too much should learn about the
        // type: fixing the size alone would not make the request work.
        const response = enforceJsonBody(request({
            'content-type': 'text/plain',
            'content-length': '999999',
        }), 1024);
        expect(response?.status).toBe(415);
    });

    it('allows a request that declares no length', () => {
        // Chunked uploads omit content-length; parseJsonRequest re-checks the
        // real byte count after reading, so nothing is unbounded.
        expect(enforceJsonBody(request({ 'content-type': 'application/json' }), 1024)).toBeNull();
    });
});
