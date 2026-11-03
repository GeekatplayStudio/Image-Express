/**
 * @jest-environment node
 */

/**
 * Contract tests for the cloud-provider proxies (R-11).
 *
 * Each proxy forwards a caller's key and body to one provider and hands the
 * answer back. What they must all get right, and what had no test before:
 * refuse without a key *before* calling upstream, forward the key exactly,
 * keep the provider's status on an error instead of folding it into a 500,
 * and never write the key to the log.
 */

const fetchMock = jest.fn();
const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

const resolveHitem3dAuth = jest.fn(async (_raw: string, forceRefresh = false) => ({
    authorization: forceRefresh ? 'Bearer refreshed-token' : 'Bearer first-token',
    source: 'basic',
}));
jest.mock('@/lib/hitem3dAuth', () => ({
    resolveHitem3dAuth: (raw: string, force?: boolean) => resolveHitem3dAuth(raw, force),
    isExpiredTokenResponse: (status: number) => status === 401,
}));

import { NextRequest } from 'next/server';
import * as meshy from '@/app/api/ai/meshy/route';
import * as tripo from '@/app/api/ai/tripo/route';
import * as tripoTask from '@/app/api/ai/tripo/[id]/route';
import * as tripoUpload from '@/app/api/ai/tripo/upload/route';
import * as hitemsTask from '@/app/api/ai/hitems/[id]/route';
import * as stabilityGenerate from '@/app/api/ai/stability/generate/route';
import * as stabilityPoll from '@/app/api/ai/stability/upscale/poll/route';

const KEY = 'Bearer sk-provider-secret-key-0001';

const upstream = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(headers),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
});

const jsonRequest = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
    new NextRequest(url, {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(() => { global.fetch = fetchMock as unknown as typeof fetch; });
beforeEach(() => { fetchMock.mockReset(); logSpy.mockClear(); errorSpy.mockClear(); resolveHitem3dAuth.mockClear(); });

const loggedText = () => [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join('\n');

describe('Meshy proxy', () => {
    it('needs an endpoint and a key, and asks nothing upstream without them', async () => {
        expect((await meshy.GET(jsonRequest('http://localhost/api/ai/meshy', 'GET'))).status).toBe(400);
        expect((await meshy.GET(jsonRequest('http://localhost/api/ai/meshy?endpoint=text-to-3d/1', 'GET'))).status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('routes image-to-3d to v1 and everything else to v2, forwarding the key unchanged', async () => {
        fetchMock.mockResolvedValue(upstream(200, { id: 't1' }));
        await meshy.GET(jsonRequest('http://localhost/api/ai/meshy?endpoint=image-to-3d/t1', 'GET', undefined, { authorization: KEY }));
        await meshy.GET(jsonRequest('http://localhost/api/ai/meshy?endpoint=text-to-3d/t1', 'GET', undefined, { authorization: KEY }));
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            'https://api.meshy.ai/openapi/v1/image-to-3d/t1',
            'https://api.meshy.ai/openapi/v2/text-to-3d/t1',
        ]);
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(KEY);
    });

    it('forwards a POST body and keeps the provider’s status and payload on an error', async () => {
        fetchMock.mockResolvedValue(upstream(402, { message: 'Insufficient credits' }));
        const response = await meshy.POST(jsonRequest('http://localhost/api/ai/meshy?endpoint=text-to-3d', 'POST', { prompt: 'a chair' }, { authorization: KEY }));
        expect(response.status).toBe(402);
        await expect(response.json()).resolves.toEqual({ message: 'Insufficient credits' });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ prompt: 'a chair' });
    });

    it('bounds a POST body by content type rather than shaping it', async () => {
        const response = await meshy.POST(new NextRequest('http://localhost/api/ai/meshy?endpoint=text-to-3d', {
            method: 'POST', headers: { authorization: KEY, 'content-type': 'text/plain' }, body: 'prompt=chair',
        }));
        expect([400, 413, 415]).toContain(response.status);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('Tripo proxies', () => {
    it('creates a task with the key forwarded, and never logs the key', async () => {
        fetchMock.mockResolvedValue(upstream(200, { code: 0, data: { task_id: 'tsk_1' } }));
        const response = await tripo.POST(jsonRequest('http://localhost/api/ai/tripo', 'POST', { type: 'text_to_model' }, { authorization: KEY }));
        expect(response.status).toBe(200);
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.tripo3d.ai/v2/openapi/task');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(KEY);
        expect(loggedText()).not.toContain('sk-provider');
        expect(loggedText()).not.toContain('Bearer sk');
    });

    it('polls by an encoded id and keeps a non-JSON provider error’s status', async () => {
        fetchMock.mockResolvedValue(upstream(502, '<html>Bad gateway</html>'));
        const response = await tripoTask.GET(jsonRequest('http://localhost/api/ai/tripo/x', 'GET', undefined, { authorization: KEY }), params('tsk/../../1'));
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.tripo3d.ai/v2/openapi/task/tsk%2F..%2F..%2F1');
        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({ detail: '<html>Bad gateway</html>' });
    });

    it('refuses an upload without a key, then without a file, before calling upstream', async () => {
        const form = new FormData();
        expect((await tripoUpload.POST(new NextRequest('http://localhost/api/ai/tripo/upload', { method: 'POST', body: form }))).status).toBe(401);
        expect((await tripoUpload.POST(new NextRequest('http://localhost/api/ai/tripo/upload', { method: 'POST', body: form, headers: { authorization: KEY } }))).status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(loggedText()).not.toContain('sk-provider');
    });
});

describe('Hitem3D task proxy', () => {
    it('refuses without a key and passes the App ID through', async () => {
        expect((await hitemsTask.GET(jsonRequest('http://localhost/api/ai/hitems/1', 'GET'), params('1'))).status).toBe(401);
        fetchMock.mockResolvedValue(upstream(200, { code: 0, data: { status: 'done' } }));
        await hitemsTask.GET(jsonRequest('http://localhost/api/ai/hitems/1', 'GET', undefined, { authorization: KEY, appid: 'app_1' }), params('t 1'));
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.hitem3d.ai/open-api/v1/query-task?task_id=t%201');
        expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer first-token', Appid: 'app_1' });
    });

    it('refreshes a basic-auth token once when the provider says it expired', async () => {
        fetchMock
            .mockResolvedValueOnce(upstream(401, { msg: 'token expired' }))
            .mockResolvedValueOnce(upstream(200, { code: 0, data: { status: 'running' } }));
        const response = await hitemsTask.GET(jsonRequest('http://localhost/api/ai/hitems/1', 'GET', undefined, { authorization: 'Basic ak:sk' }), params('1'));
        expect(response.status).toBe(200);
        expect(resolveHitem3dAuth).toHaveBeenLastCalledWith('Basic ak:sk', true);
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer refreshed-token');
    });
});

describe('Stability proxies', () => {
    it('generate needs a key and a prompt, forwards the form, and reshapes the answer', async () => {
        const form = new FormData();
        expect((await stabilityGenerate.POST(new Request('http://localhost/api/ai/stability/generate', { method: 'POST', body: form }))).status).toBe(401);
        expect((await stabilityGenerate.POST(new Request('http://localhost/api/ai/stability/generate', { method: 'POST', body: form, headers: { Authorization: KEY } }))).status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();

        form.append('prompt', 'a chair');
        form.append('aspect_ratio', '16:9');
        fetchMock.mockResolvedValue(upstream(200, { image: 'base64', seed: 7, finish_reason: 'SUCCESS' }));
        const response = await stabilityGenerate.POST(new Request('http://localhost/api/ai/stability/generate', { method: 'POST', body: form, headers: { Authorization: KEY } }));
        await expect(response.json()).resolves.toEqual({ success: true, image: 'base64', seed: 7, finishReason: 'SUCCESS' });
        const sent = fetchMock.mock.calls[0][1];
        expect(sent.headers.Authorization).toBe(KEY);
        expect(Object.fromEntries((sent.body as FormData).entries())).toEqual({ prompt: 'a chair', aspect_ratio: '16:9', output_format: 'png' });
    });

    it('generate keeps the provider’s status on an error', async () => {
        const form = new FormData();
        form.append('prompt', 'x');
        fetchMock.mockResolvedValue(upstream(429, 'rate limited'));
        const response = await stabilityGenerate.POST(new Request('http://localhost/api/ai/stability/generate', { method: 'POST', body: form, headers: { Authorization: KEY } }));
        expect(response.status).toBe(429);
    });

    it('upscale poll answers GET and POST alike, and reads a 202 as still running', async () => {
        fetchMock.mockResolvedValue(upstream(202, ''));
        for (const handler of [stabilityPoll.GET, stabilityPoll.POST]) {
            const response = await handler(new Request('http://localhost/api/ai/stability/upscale/poll?id=job1', { headers: { Authorization: KEY } }));
            await expect(response.json()).resolves.toEqual({ success: true, status: 'IN_PROGRESS' });
        }
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.stability.ai/v2beta/stable-image/upscale/creative/result/job1');
        expect((await stabilityPoll.GET(new Request('http://localhost/api/ai/stability/upscale/poll', { headers: { Authorization: KEY } }))).status).toBe(400);
    });
});
