import { createLocalComfyTransport } from '@/lib/comfyui/transport';
import {
    cancelComfyPromptOnTransport,
    formatComfyPromptError,
    uniqueComfyUploadName,
} from '@/lib/comfyui/promptControl';

describe('cancelComfyPromptOnTransport', () => {
    const transport = createLocalComfyTransport('http://127.0.0.1:8188');
    const fetchMock = jest.fn();
    const originalFetch = global.fetch;

    const queueIs = (queue: { queue_running?: unknown[]; queue_pending?: unknown[] }) => {
        fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => (
            init?.method === 'POST'
                ? { ok: true, json: async () => ({}) }
                : { ok: true, json: async () => queue }
        ));
    };

    const posts = () => fetchMock.mock.calls
        .filter(([, init]) => init?.method === 'POST')
        .map(([url, init]) => ({ url: decodeURIComponent(String(url)), body: JSON.parse(String(init.body)) }));

    beforeEach(() => {
        fetchMock.mockReset();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('interrupts a prompt that is running', async () => {
        queueIs({ queue_running: [[3, 'abc', {}]], queue_pending: [] });
        await expect(cancelComfyPromptOnTransport(transport, 'abc')).resolves.toBe('interrupted');
        expect(posts()).toEqual([{ url: expect.stringContaining('/interrupt'), body: { prompt_id: 'abc' } }]);
    });

    it('removes a waiting prompt from the queue without interrupting the running one', async () => {
        queueIs({ queue_running: [[3, 'other', {}]], queue_pending: [[4, 'abc', {}]] });
        await expect(cancelComfyPromptOnTransport(transport, 'abc')).resolves.toBe('dequeued');
        expect(posts()).toEqual([{ url: expect.stringContaining('/queue'), body: { delete: ['abc'] } }]);
    });

    it('leaves the server alone when the prompt is not there', async () => {
        queueIs({ queue_running: [[3, 'other', {}]], queue_pending: [] });
        await expect(cancelComfyPromptOnTransport(transport, 'abc')).resolves.toBe('not-queued');
        expect(posts()).toEqual([]);
    });
});

describe('uniqueComfyUploadName', () => {
    it('gives different images different names', () => {
        const a = uniqueComfyUploadName('data:image/png;base64,AAAA', 'image-express-input.png');
        const b = uniqueComfyUploadName('data:image/png;base64,AAAB', 'image-express-input.png');
        expect(a).not.toBe(b);
        expect(a).toMatch(/^image-express-input-[0-9a-f]{16}\.png$/);
    });

    it('gives the same image the same name, so it is reused', () => {
        const dataUrl = 'data:image/png;base64,AAAA';
        expect(uniqueComfyUploadName(dataUrl, 'mask.png')).toBe(uniqueComfyUploadName(dataUrl, 'mask.png'));
    });
});

describe('formatComfyPromptError', () => {
    it('names the node and input ComfyUI rejected', () => {
        const body = JSON.stringify({
            error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation' },
            node_errors: {
                4: {
                    class_type: 'CheckpointLoaderSimple',
                    errors: [{ message: 'Value not in list', details: "ckpt_name: 'missing.safetensors' not in []" }],
                },
            },
        });
        expect(formatComfyPromptError(400, 'Bad Request', body)).toBe(
            'ComfyUI refused the workflow: Prompt outputs failed validation\n'
            + "CheckpointLoaderSimple: Value not in list (ckpt_name: 'missing.safetensors' not in [])",
        );
    });

    it('keeps node errors that a character cut-off would have lost', () => {
        const node_errors = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
            String(index),
            { class_type: `Node${index}`, errors: [{ message: 'bad', details: 'x'.repeat(200) }] },
        ]));
        const message = formatComfyPromptError(400, 'Bad Request', JSON.stringify({ error: { message: 'failed' }, node_errors }));
        expect(message).toContain('Node7: bad');
        expect(message).toContain('…and 4 more');
    });

    it('explains an upload that is too large', () => {
        expect(formatComfyPromptError(413, 'Payload Too Large', '')).toContain('--max-upload-size');
    });

    it('falls back to the raw reply when it is not JSON', () => {
        expect(formatComfyPromptError(500, 'Server Error', 'boom'))
            .toBe('ComfyUI refused the workflow: 500 Server Error (boom)');
    });
});
