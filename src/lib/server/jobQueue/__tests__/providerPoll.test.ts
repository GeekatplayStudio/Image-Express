/**
 * @jest-environment node
 */

import {
    isTerminalPollStatus,
    nextPollDelayMs,
    normalizeProviderPoll,
    providerPollPath,
} from '@/lib/server/jobQueue/providerPoll';

const ctx = (over: Partial<Parameters<typeof normalizeProviderPoll>[2]> = {}) => ({
    previousProgress: 0,
    ...over,
});

describe('providerPollPath', () => {
    it('routes each provider to its own status endpoint', () => {
        expect(providerPollPath('stability', 'abc')).toBe('/api/ai/stability/upscale/poll?id=abc');
        expect(providerPollPath('tripo', 'abc')).toBe('/api/ai/tripo/abc');
        expect(providerPollPath('meshy', 'abc', 'image-to-3d')).toBe('/api/ai/meshy?endpoint=image-to-3d/abc');
        expect(providerPollPath('meshy', 'abc', 'text-to-3d')).toBe('/api/ai/meshy?endpoint=text-to-3d/abc');
    });

    it('routes hitems by job type', () => {
        expect(providerPollPath('hitems', 'x')).toBe('/api/ai/hitems/x');
        expect(providerPollPath('hitems', 'x', 'hitems-relief')).toBe('/api/ai/hitems/depth/x');
        expect(providerPollPath('hitems', 'x', 'hitems-split')).toBe('/api/ai/hitems/split/x');
    });

    it('encodes ids so a hostile task id cannot escape the path', () => {
        expect(providerPollPath('tripo', '../../secret')).toBe('/api/ai/tripo/..%2F..%2Fsecret');
    });
});

describe('normalizeProviderPoll — stability', () => {
    it('returns the image as a data url on success', () => {
        const r = normalizeProviderPoll('stability', { status: 'SUCCEEDED', image: 'AAA' }, ctx());
        expect(r.status).toBe('SUCCEEDED');
        expect(r.progress).toBe(100);
        expect(r.resultUrl).toBe('data:image/png;base64,AAA');
    });

    it('holds the previous progress while in progress', () => {
        const r = normalizeProviderPoll('stability', { status: 'IN_PROGRESS' }, ctx({ previousProgress: 40 }));
        expect(r).toMatchObject({ status: 'IN_PROGRESS', progress: 40 });
    });

    it('treats any other status as failure', () => {
        expect(normalizeProviderPoll('stability', { status: 'weird' }, ctx()).status).toBe('FAILED');
    });
});

describe('normalizeProviderPoll — tripo', () => {
    it('maps success and prefers the plain model url', () => {
        const r = normalizeProviderPoll('tripo', {
            data: { status: 'success', progress: 100, output: { model: 'm.glb', pbr_model: 'p.glb', rendered_image: 't.png' } },
        }, ctx());
        expect(r).toMatchObject({ status: 'SUCCEEDED', progress: 100, resultUrl: 'm.glb', thumbnailUrl: 't.png' });
    });

    it('falls back through pbr_model then base_model', () => {
        expect(normalizeProviderPoll('tripo', {
            data: { status: 'success', output: { base_model: 'b.glb' } },
        }, ctx()).resultUrl).toBe('b.glb');
    });

    it('distinguishes cancelled from failed', () => {
        expect(normalizeProviderPoll('tripo', { data: { status: 'cancelled' } }, ctx()).status).toBe('CANCELLED');
        expect(normalizeProviderPoll('tripo', { data: { status: 'failed' } }, ctx()).status).toBe('FAILED');
    });

    it('fails on a non-zero error code with no data', () => {
        const r = normalizeProviderPoll('tripo', { code: 2004 }, ctx());
        expect(r.status).toBe('FAILED');
        expect(r.error).toContain('2004');
    });

    it('keeps polling on an unknown running state', () => {
        expect(normalizeProviderPoll('tripo', { data: { status: 'running', progress: 30 } }, ctx()))
            .toMatchObject({ status: 'IN_PROGRESS', progress: 30 });
    });
});

describe('normalizeProviderPoll — meshy', () => {
    it('flags that a finished text-to-3d preview still needs refinement', () => {
        const r = normalizeProviderPoll('meshy', {
            status: 'SUCCEEDED', model_urls: { glb: 'a.glb' },
        }, ctx({ jobType: 'text-to-3d', stage: 'preview' }));
        expect(r.status).toBe('SUCCEEDED');
        expect(r.needsMeshyRefine).toBe(true);
    });

    it('does not ask for refinement once refining', () => {
        const r = normalizeProviderPoll('meshy', {
            status: 'SUCCEEDED', model_urls: { glb: 'a.glb' },
        }, ctx({ jobType: 'text-to-3d', stage: 'refining' }));
        expect(r.needsMeshyRefine).toBeFalsy();
    });

    it('does not ask for refinement for image-to-3d', () => {
        const r = normalizeProviderPoll('meshy', {
            status: 'SUCCEEDED', model_urls: { glb: 'a.glb' },
        }, ctx({ jobType: 'image-to-3d' }));
        expect(r.needsMeshyRefine).toBeFalsy();
    });

    it('accepts both spellings of cancelled', () => {
        expect(normalizeProviderPoll('meshy', { status: 'CANCELED' }, ctx()).status).toBe('CANCELLED');
        expect(normalizeProviderPoll('meshy', { status: 'CANCELLED' }, ctx()).status).toBe('CANCELLED');
    });

    it('treats an expired task as failed', () => {
        expect(normalizeProviderPoll('meshy', { status: 'EXPIRED' }, ctx()).status).toBe('FAILED');
    });
});

describe('normalizeProviderPoll — hitems', () => {
    it('maps task_status 4 to success', () => {
        const r = normalizeProviderPoll('hitems', {
            code: 200, data: { task_status: 4, task_result: { model_url: 'm.glb', render_url: 'r.png' } },
        }, ctx());
        expect(r).toMatchObject({ status: 'SUCCEEDED', progress: 100, resultUrl: 'm.glb', thumbnailUrl: 'r.png' });
    });

    it('treats a model url as completion even when the status field lags', () => {
        const r = normalizeProviderPoll('hitems', {
            code: 200, data: { state: 'processing', model_url: 'm.glb' },
        }, ctx());
        expect(r.status).toBe('SUCCEEDED');
    });

    it('maps task_status -1 to failure and keeps the provider message', () => {
        const r = normalizeProviderPoll('hitems', {
            code: 200, data: { task_status: -1, task_msg: 'out of credits' },
        }, ctx());
        expect(r.status).toBe('FAILED');
        expect(r.error).toBe('out of credits');
    });

    it('adds the ak:sk hint when the token has expired', () => {
        const r = normalizeProviderPoll('hitems', {
            code: 200, data: { task_status: -1, task_msg: 'login expired' },
        }, ctx());
        expect(r.error).toContain('ak:sk');
    });

    it('synthesises coarse progress from the state when none is reported', () => {
        expect(normalizeProviderPoll('hitems', { code: 200, data: { state: 'created' } }, ctx()).progress).toBe(5);
        expect(normalizeProviderPoll('hitems', { code: 200, data: { state: 'queueing' } }, ctx()).progress).toBe(15);
        expect(normalizeProviderPoll('hitems', { code: 200, data: { state: 'processing' } }, ctx()).progress).toBe(30);
    });

    it('never moves progress backwards', () => {
        const r = normalizeProviderPoll('hitems', { code: 200, data: { state: 'created' } }, ctx({ previousProgress: 60 }));
        expect(r.progress).toBe(60);
    });

    it('reads a fractional progress scale as a percentage', () => {
        expect(normalizeProviderPoll('hitems', { code: 200, data: { state: 'processing', process_pct: 0.42 } }, ctx()).progress).toBe(42);
        expect(normalizeProviderPoll('hitems', { code: 200, data: { state: 'processing', process_pct: 42 } }, ctx()).progress).toBe(42);
    });

    it('fails on a non-ok response code', () => {
        const r = normalizeProviderPoll('hitems', { code: 401, data: {} }, ctx());
        expect(r.status).toBe('FAILED');
    });
});

describe('nextPollDelayMs', () => {
    const noJitter = () => 0.5; // factor 1.0

    it('drops back to the floor when the job actually progressed', () => {
        expect(nextPollDelayMs(15_000, true, { jitter: noJitter })).toBe(2000);
    });

    it('backs off when nothing changed', () => {
        expect(nextPollDelayMs(2000, false, { jitter: noJitter })).toBe(3000);
    });

    it('never exceeds the ceiling', () => {
        expect(nextPollDelayMs(15_000, false, { jitter: noJitter })).toBe(15_000);
    });

    it('stays within bounds across the whole jitter range', () => {
        for (const j of [0, 0.25, 0.5, 0.75, 0.999]) {
            const delay = nextPollDelayMs(9000, false, { jitter: () => j });
            expect(delay).toBeGreaterThanOrEqual(2000);
            expect(delay).toBeLessThanOrEqual(15_000);
        }
    });
});

describe('isTerminalPollStatus', () => {
    it('treats cancelled as terminal so a cancelled job stops polling', () => {
        expect(isTerminalPollStatus('CANCELLED')).toBe(true);
        expect(isTerminalPollStatus('SUCCEEDED')).toBe(true);
        expect(isTerminalPollStatus('FAILED')).toBe(true);
        expect(isTerminalPollStatus('IN_PROGRESS')).toBe(false);
    });
});
