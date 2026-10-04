import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import ActivityPanel from '@/components/ActivityPanel';
import { OPEN_ACTIVITY_PANEL_EVENT } from '@/lib/activityJobs';

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) => (
            params ? `${key}:${JSON.stringify(params)}` : key
        ),
    }),
}));

const toastMock = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({
    useToast: () => ({ toast: toastMock, dismiss: jest.fn() }),
}));

// The shell is a draggable, portaled window; its behaviour is tested on its
// own. Here it only needs to show its children when open.
jest.mock('@/components/ui/ModalShell', () => ({
    __esModule: true,
    default: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: React.ReactNode }) => (
        isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null
    ),
}));

/** The same `snapshot`/`job` frames the server sends. */
class MockEventSource {
    static instances: MockEventSource[] = [];
    closed = false;
    private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

    constructor(public url: string) {
        MockEventSource.instances.push(this);
    }

    addEventListener(type: string, handler: (event: MessageEvent) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
    }

    removeEventListener() { /* not needed */ }

    close() { this.closed = true; }

    emit(type: string, data: unknown) {
        (this.listeners.get(type) ?? []).forEach((handler) => handler({ data: JSON.stringify(data) } as MessageEvent));
    }
}

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, seconds)).toISOString();

const job = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    kind: 'generate',
    lane: 'local-gpu',
    external: false,
    label: `Job ${id}`,
    status: 'queued',
    stage: 'queue',
    progress: 0,
    payload: {},
    attempts: 0,
    maxAttempts: 1,
    priority: 0,
    createdAt: at(0),
    updatedAt: at(0),
    ...over,
});

const SNAPSHOT = [
    job('run', { status: 'running', stage: 'ai', startedAt: at(1), createdAt: at(1) }),
    job('first', { createdAt: at(2) }),
    job('second', { createdAt: at(3) }),
    job('bad', { status: 'failed', error: 'Provider rejected the request', finishedAt: at(30) }),
    job('ok', { status: 'succeeded', finishedAt: at(40) }),
];

const fetchMock = jest.fn();

const open = async (snapshot = SNAPSHOT) => {
    render(<ActivityPanel />);
    act(() => { window.dispatchEvent(new Event(OPEN_ACTIVITY_PANEL_EVENT)); });
    const source = await waitFor(() => {
        const latest = MockEventSource.instances.at(-1);
        if (!latest) throw new Error('no stream yet');
        return latest;
    });
    act(() => source.emit('snapshot', { jobs: snapshot }));
    return source;
};

const rowFor = (label: string) => screen.getByText(label).closest('li') as HTMLElement;

describe('ActivityPanel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        MockEventSource.instances = [];
        (globalThis as unknown as { EventSource: unknown }).EventSource = MockEventSource;
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    it('stays closed, and holds no connection, until asked to open', () => {
        render(<ActivityPanel />);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(MockEventSource.instances).toHaveLength(0);
    });

    it('lists running, then waiting in run order, then history newest first', async () => {
        await open();
        const labels = screen.getAllByRole('listitem').map((item) => within(item).getByText(/^Job /).textContent);
        expect(labels).toEqual(['Job run', 'Job first', 'Job second', 'Job ok', 'Job bad']);
    });

    it('shows why a job failed', async () => {
        await open();
        expect(within(rowFor('Job bad')).getByText(/Provider rejected the request/)).toBeTruthy();
    });

    it('offers each job only the actions that apply to it', async () => {
        await open();
        const names = (label: string) => within(rowFor(label)).queryAllByRole('button').map((button) => button.getAttribute('title'));
        expect(names('Job run')).toEqual(['queue.rail.cancel']);
        // First in line already: no "run next".
        expect(names('Job first')).toEqual(['queue.rail.cancel']);
        expect(names('Job second')).toEqual(['activity.runNext', 'queue.rail.cancel']);
        expect(names('Job bad')).toEqual(['queue.rail.retry']);
        expect(names('Job ok')).toEqual([]);
    });

    it('calls the queue API for run next, cancel and retry', async () => {
        await open();
        fireEvent.click(within(rowFor('Job second')).getByTitle('activity.runNext'));
        fireEvent.click(within(rowFor('Job run')).getByTitle('queue.rail.cancel'));
        fireEvent.click(within(rowFor('Job bad')).getByTitle('queue.rail.retry'));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        expect(fetchMock.mock.calls.map((call) => `${call[1].method} ${call[0]}`)).toEqual([
            'POST /api/queue/second/prioritize',
            'POST /api/queue/run/cancel',
            'POST /api/queue/bad/retry',
        ]);
    });

    it('follows live job events', async () => {
        const source = await open();
        act(() => source.emit('job', job('first', { createdAt: at(2), status: 'running', stage: 'worker', startedAt: at(50) })));
        expect(within(rowFor('Job first')).getByText(/activity\.status\.running/)).toBeTruthy();
    });

    it('filters to what the user asked for', async () => {
        await open();
        fireEvent.click(screen.getByRole('tab', { name: 'activity.filter.failed' }));
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
        expect(screen.getByText('Job bad')).toBeTruthy();

        fireEvent.click(screen.getByRole('tab', { name: 'activity.filter.active' }));
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('clears history through the API and reflects the resync', async () => {
        const source = await open();
        fireEvent.click(screen.getByText('activity.clearFinished'));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/queue', { method: 'DELETE' }));

        // The server answers a clear with a fresh snapshot.
        act(() => source.emit('snapshot', { jobs: SNAPSHOT.filter((entry) => entry.status === 'queued' || entry.status === 'running') }));
        expect(screen.queryByText('Job ok')).toBeNull();
        expect(screen.queryByText('Job bad')).toBeNull();
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('disables "clear finished" when there is no history, and says so when empty', async () => {
        await open([]);
        expect((screen.getByText('activity.clearFinished').closest('button') as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('activity.empty')).toBeTruthy();
    });

    it('reports a refused action instead of failing silently', async () => {
        fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: 'Job is running; only a waiting job can be moved up.' }) });
        await open();
        fireEvent.click(within(rowFor('Job second')).getByTitle('activity.runNext'));
        await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
            title: 'activity.actionFailed',
            description: 'Job is running; only a waiting job can be moved up.',
            variant: 'destructive',
        })));
    });
});
