import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useEditorBackgroundJobControls } from '@/components/Editor/useEditorBackgroundJobControls';
import type { BackgroundJob } from '@/types';

const mockHandleOpenThreeDEditor = jest.fn();
const mockHandleAssetSelect = jest.fn();
const mockToast = jest.fn();

function createMockFetchResponse(body: string, options?: { ok?: boolean; status?: number; statusText?: string }) {
    return {
        ok: options?.ok ?? true,
        status: options?.status ?? 200,
        statusText: options?.statusText ?? '',
        text: async () => body,
    } as Response;
}

type HarnessProps = {
    initialJobs: BackgroundJob[];
};

function upsertJobs(prev: BackgroundJob[], jobData: Partial<BackgroundJob>) {
    const id = typeof jobData.id === 'string' ? jobData.id.trim() : '';
    if (!id) {
        return prev;
    }

    const existing = prev.find((job) => job.id === id);
    const normalized = {
        ...(existing || {}),
        ...jobData,
        id,
    } as BackgroundJob;

    if (!existing) {
        return [...prev, normalized];
    }

    return prev.map((job) => (job.id === id ? normalized : job));
}

function Harness({ initialJobs }: HarnessProps) {
    const [jobs, setJobs] = useState(initialJobs);

    const controls = useEditorBackgroundJobControls({
        backgroundJobs: jobs,
        setBackgroundJobs: setJobs,
        upsertBackgroundJob: (jobData) => {
            setJobs((prev) => upsertJobs(prev, jobData));
        },
        handleOpenThreeDEditor: mockHandleOpenThreeDEditor,
        handleAssetSelect: mockHandleAssetSelect,
        toast: mockToast,
    });

    return (
        <div>
            <button type="button" onClick={() => controls.onOpenResult?.(jobs[0])}>
                Open First
            </button>
            <button type="button" onClick={() => void controls.onCancel?.(jobs[0])}>
                Cancel First
            </button>
            <button type="button" onClick={() => void controls.onRetry?.(jobs[0])}>
                Retry First
            </button>
            <pre data-testid="jobs-state">{JSON.stringify(jobs)}</pre>
        </div>
    );
}

describe('useEditorBackgroundJobControls', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
        window.localStorage.clear();
    });

    it('opens 3D results in the 3D editor flow', () => {
        render(
            <Harness
                initialJobs={[
                    {
                        id: 'job-3d',
                        type: 'text-to-3d',
                        status: 'SUCCEEDED',
                        resultUrl: 'https://cdn.example.com/model.glb',
                        createdAt: Date.now(),
                        provider: 'meshy',
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Open First' }));

        expect(mockHandleOpenThreeDEditor).toHaveBeenCalledWith('https://cdn.example.com/model.glb');
        expect(mockHandleAssetSelect).not.toHaveBeenCalled();
    });

    it('cancels Meshy jobs remotely when supported', async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            createMockFetchResponse('', { ok: true, status: 204, statusText: 'No Content' })
        );

        render(
            <Harness
                initialJobs={[
                    {
                        id: 'job-active',
                        type: 'text-to-3d',
                        status: 'IN_PROGRESS',
                        progress: 25,
                        createdAt: Date.now(),
                        provider: 'meshy',
                        apiKey: 'meshy-key',
                        request: { provider: 'meshy', mode: 'text', prompt: 'spaceship' },
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Cancel First' }));

        await waitFor(() => {
            expect(screen.getByTestId('jobs-state')).toHaveTextContent('CANCELLED');
        });
        expect(global.fetch).toHaveBeenCalledWith('/api/ai/meshy?endpoint=text-to-3d/job-active', {
            method: 'DELETE',
            headers: { Authorization: 'Bearer meshy-key' },
        });
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Job cancelled' }));
    });

    it('stops tracking unsupported provider jobs locally', async () => {
        render(
            <Harness
                initialJobs={[
                    {
                        id: 'job-tripo',
                        type: 'text-to-3d',
                        status: 'IN_PROGRESS',
                        progress: 25,
                        createdAt: Date.now(),
                        provider: 'tripo',
                        apiKey: 'tripo-key',
                        request: { provider: 'tripo', mode: 'text', prompt: 'spaceship' },
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Cancel First' }));

        await waitFor(() => {
            expect(screen.getByTestId('jobs-state')).toHaveTextContent('CANCELLED');
        });

        expect(global.fetch).not.toHaveBeenCalled();
        expect(screen.getByTestId('jobs-state')).toHaveTextContent('Tracking stopped by user.');
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tracking stopped' }));
    });

    it('falls back to local stop-tracking when Meshy remote cancel fails', async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            createMockFetchResponse(JSON.stringify({ message: 'Meshy unavailable' }), {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            })
        );

        render(
            <Harness
                initialJobs={[
                    {
                        id: 'job-meshy-fail',
                        type: 'text-to-3d',
                        status: 'IN_PROGRESS',
                        progress: 40,
                        createdAt: Date.now(),
                        provider: 'meshy',
                        apiKey: 'meshy-key',
                        request: { provider: 'meshy', mode: 'text', prompt: 'spaceship' },
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Cancel First' }));

        await waitFor(() => {
            expect(screen.getByTestId('jobs-state')).toHaveTextContent('CANCELLED');
        });

        expect(screen.getByTestId('jobs-state')).toHaveTextContent('Tracking stopped locally after remote cancel failed: Meshy unavailable');
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Remote cancel failed',
            variant: 'destructive',
        }));
    });

    it('retries retryable failed jobs and replaces the old entry', async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            createMockFetchResponse(JSON.stringify({ result: 'meshy-retry-2' }), {
                ok: true,
                status: 200,
                statusText: 'OK',
            })
        );

        render(
            <Harness
                initialJobs={[
                    {
                        id: 'meshy-job-1',
                        type: 'text-to-3d',
                        status: 'FAILED',
                        createdAt: Date.now(),
                        provider: 'meshy',
                        apiKey: 'meshy-key',
                        prompt: 'dragon',
                        request: { provider: 'meshy', mode: 'text', prompt: 'dragon' },
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Retry First' }));

        await waitFor(() => {
            expect(screen.getByTestId('jobs-state')).toHaveTextContent('meshy-retry-2');
        });
        expect(screen.getByTestId('jobs-state')).not.toHaveTextContent('meshy-job-1');
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Retry started' }));
    });
});