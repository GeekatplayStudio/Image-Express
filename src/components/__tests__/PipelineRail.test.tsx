import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import PipelineRail from '@/components/PipelineRail';
import { BACKGROUND_JOBS_CHANGED_EVENT } from '@/components/Editor/useBackgroundJobsStore';
import { UI_PREFERENCES_STORAGE_KEY } from '@/lib/ui-preferences';

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

const setLocalJobs = (jobs: unknown[]) => {
    window.localStorage.setItem('image-express-background-jobs', JSON.stringify(jobs));
};

const activeJob = (id: string) => ({
    id,
    type: 'image-to-3d',
    status: 'IN_PROGRESS',
    progress: 40,
    createdAt: Date.now(),
    provider: 'meshy',
    prompt: 'A small castle',
});

/**
 * Minimal EventSource stub: tests drive queue transitions by emitting the
 * same `snapshot`/`job` frames the server sends.
 */
class MockEventSource {
    static instances: MockEventSource[] = [];
    private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

    constructor(public url: string) {
        MockEventSource.instances.push(this);
    }

    addEventListener(type: string, handler: (event: MessageEvent) => void) {
        const existing = this.listeners.get(type) ?? [];
        this.listeners.set(type, [...existing, handler]);
    }

    removeEventListener(type: string, handler: (event: MessageEvent) => void) {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== handler));
    }

    close() { /* no-op */ }

    emit(type: string, data: unknown) {
        for (const handler of this.listeners.get(type) ?? []) {
            handler({ data: JSON.stringify(data) } as MessageEvent);
        }
    }
}

const queueJob = (overrides: Record<string, unknown> = {}) => ({
    id: 'qjob-1',
    kind: 'generate',
    lane: 'local-cpu',
    external: false,
    label: 'Generate (mock)',
    status: 'queued',
    stage: 'queue',
    progress: 0,
    payload: {},
    attempts: 0,
    maxAttempts: 1,
    priority: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
});

beforeAll(() => {
    Object.defineProperty(window, 'EventSource', { writable: true, value: MockEventSource });
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        })),
    });
});

describe('PipelineRail', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        window.localStorage.clear();
        toastMock.mockClear();
        MockEventSource.instances = [];
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('renders nothing when there are no jobs', async () => {
        render(<PipelineRail />);
        await act(async () => { jest.advanceTimersByTime(10); });
        expect(screen.queryByTestId('pipeline-rail')).toBeNull();
    });

    it('renders nothing when the preference is off, even with active jobs', async () => {
        window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({ pipelineRailMode: 'off' }));
        setLocalJobs([activeJob('job-1')]);
        render(<PipelineRail />);
        await act(async () => { jest.advanceTimersByTime(10); });
        expect(screen.queryByTestId('pipeline-rail')).toBeNull();
    });

    it('shows the rail with stage segments for an active background job', async () => {
        setLocalJobs([activeJob('job-1')]);
        render(<PipelineRail />);
        await act(async () => { jest.advanceTimersByTime(10); });

        const rail = screen.getByTestId('pipeline-rail');
        expect(rail).toBeInTheDocument();
        // One segment per pipeline stage.
        expect(rail.querySelectorAll('[title]')).toHaveLength(9);
    });

    it('toasts when an observed job transitions to a terminal state', async () => {
        setLocalJobs([activeJob('job-1')]);
        render(<PipelineRail />);
        await act(async () => { jest.advanceTimersByTime(10); });
        expect(toastMock).not.toHaveBeenCalled();

        setLocalJobs([{ ...activeJob('job-1'), status: 'SUCCEEDED' }]);
        await act(async () => {
            window.dispatchEvent(new Event(BACKGROUND_JOBS_CHANGED_EVENT));
        });

        expect(toastMock).toHaveBeenCalledTimes(1);
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
            title: 'queue.rail.toastDone',
            variant: 'success',
        }));
    });

    it('offers cancel for a queued server job and POSTs the cancel endpoint', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
        global.fetch = fetchMock as unknown as typeof fetch;

        render(<PipelineRail />);
        await act(async () => { jest.advanceTimersByTime(10); });
        await act(async () => {
            MockEventSource.instances[0].emit('snapshot', { jobs: [queueJob()] });
        });

        // Expand the drop-down to reach the row actions.
        fireEvent.mouseEnter(screen.getByTestId('pipeline-rail'));
        const cancelButton = await screen.findByLabelText(/queue\.rail\.cancelAria/);

        await act(async () => { fireEvent.click(cancelButton); });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith('/api/queue/qjob-1/cancel', { method: 'POST' });
        });
    });

    it('offers retry for a failed server job and surfaces its error text', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
        global.fetch = fetchMock as unknown as typeof fetch;

        render(<PipelineRail />);
        await act(async () => { jest.advanceTimersByTime(10); });
        await act(async () => {
            MockEventSource.instances[0].emit('snapshot', { jobs: [queueJob()] });
        });
        await act(async () => {
            MockEventSource.instances[0].emit('job', queueJob({
                status: 'failed',
                stage: 'ai',
                error: 'provider exploded',
            }));
        });

        fireEvent.mouseEnter(screen.getByTestId('pipeline-rail'));
        expect(screen.getByText(/provider exploded/)).toBeInTheDocument();

        const retryButton = await screen.findByLabelText(/queue\.rail\.retryAria/);
        await act(async () => { fireEvent.click(retryButton); });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith('/api/queue/qjob-1/retry', { method: 'POST' });
        });
    });

    it('toasts when a queue action is rejected by the server', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ message: 'Job is running and can no longer be cancelled.' }),
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        render(<PipelineRail />);
        await act(async () => { jest.advanceTimersByTime(10); });
        await act(async () => {
            MockEventSource.instances[0].emit('snapshot', { jobs: [queueJob()] });
        });

        fireEvent.mouseEnter(screen.getByTestId('pipeline-rail'));
        await act(async () => {
            fireEvent.click(await screen.findByLabelText(/queue\.rail\.cancelAria/));
        });

        await waitFor(() => {
            expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
                title: 'queue.rail.cancelFailed',
                variant: 'destructive',
            }));
        });
    });

    it('stays silent for jobs that were already terminal at mount', async () => {
        setLocalJobs([{ ...activeJob('job-1'), status: 'FAILED' }]);
        render(<PipelineRail />);
        await act(async () => { jest.advanceTimersByTime(10); });
        expect(toastMock).not.toHaveBeenCalled();
        // Already-terminal jobs do not linger either.
        expect(screen.queryByTestId('pipeline-rail')).toBeNull();
    });
});
