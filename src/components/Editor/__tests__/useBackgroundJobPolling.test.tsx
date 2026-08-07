import React, { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import { useBackgroundJobPolling } from '@/components/Editor/useBackgroundJobPolling';
import type { BackgroundJob } from '@/types';

const mockPersistAssetToLibrary = jest.fn(async () => ({ savedProviders: ['local'], warnings: [] }));

jest.mock('@/lib/assetPersistence', () => ({
    __esModule: true,
    persistAssetToLibrary: (...args: unknown[]) => mockPersistAssetToLibrary(...args),
}));

jest.mock('fabric', () => ({
    __esModule: true,
    FabricImage: {
        fromURL: jest.fn(),
    },
    Group: class {
        add() {}
    },
    Rect: class {},
    IText: class {},
}));

const mockRenderModelThumbnail = jest.fn();
jest.mock('@/lib/modelThumbnail', () => ({
    __esModule: true,
    renderModelThumbnail: (...args: unknown[]) => mockRenderModelThumbnail(...args),
}));

jest.mock('@/lib/canvas-placement', () => ({
    __esModule: true,
    placeAtViewportCenter: jest.fn(),
}));

type HarnessProps = {
    initialJobs: BackgroundJob[];
    user?: string;
    canvas?: Parameters<typeof useBackgroundJobPolling>[0]['canvas'];
};

function PollingHarness({ initialJobs, user = 'Polling Tester', canvas = null }: HarnessProps) {
    const [backgroundJobs, setBackgroundJobs] = useState(initialJobs);

    useBackgroundJobPolling({
        backgroundJobs,
        setBackgroundJobs,
        canvas,
        user,
    });

    return (
        <div>
            <div data-testid="job-status">{backgroundJobs[0]?.status ?? 'none'}</div>
            <div data-testid="job-result">{backgroundJobs[0]?.resultUrl ?? 'none'}</div>
        </div>
    );
}

describe('useBackgroundJobPolling', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    it('auto-saves a completed background 3D job to the shared asset library helper', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({
                status: 'SUCCEEDED',
                progress: 100,
                model_urls: { glb: 'https://cdn.example.com/generated-model.glb' },
                thumbnail_url: 'https://cdn.example.com/generated-model.png',
            }),
        });

        const initialJobs: BackgroundJob[] = [
            {
                id: 'meshy-job-1',
                type: 'image-to-3d',
                provider: 'meshy',
                status: 'IN_PROGRESS',
                progress: 20,
                createdAt: Date.now(),
                apiKey: 'meshy-key',
                prompt: 'Robot Hero',
            },
        ];

        render(<PollingHarness initialJobs={initialJobs} />);

        await act(async () => {
            jest.advanceTimersByTime(2000);
            await Promise.resolve();
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(mockPersistAssetToLibrary).toHaveBeenCalledWith({
                source: 'https://cdn.example.com/generated-model.glb',
                filename: 'Robot_Hero.glb',
                type: 'models',
                category: 'uploads',
                owner: 'Polling Tester',
            });
        });

        expect(screen.getByTestId('job-status')).toHaveTextContent('SUCCEEDED');
        expect(screen.getByTestId('job-result')).toHaveTextContent('https://cdn.example.com/generated-model.glb');
        expect(global.fetch).toHaveBeenCalledWith('/api/ai/meshy?endpoint=image-to-3d/meshy-job-1', {
            headers: { Authorization: 'Bearer meshy-key' },
        });
    });

    it('places a render of the returned model on canvas, not the "3D" placeholder', async () => {
        // Regression: completion used to add the provider's thumbnail (or a
        // blue box with the literal text "3D") instead of showing the model
        // that actually came back.
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({
                status: 'SUCCEEDED',
                progress: 100,
                model_urls: { glb: 'https://cdn.example.com/hero.glb' },
                thumbnail_url: 'https://cdn.example.com/hero.png',
            }),
        });
        mockRenderModelThumbnail.mockResolvedValue('data:image/png;base64,RENDERED');

        const placed: Record<string, unknown>[] = [];
        const fabricModule = jest.requireMock('fabric') as {
            FabricImage: { fromURL: jest.Mock };
        };
        fabricModule.FabricImage.fromURL.mockImplementation(async (url: string) => {
            const image: Record<string, unknown> = {
                sourceUrl: url,
                scaleToWidth: jest.fn(),
                set: jest.fn(),
            };
            return image;
        });

        const canvas = {
            add: jest.fn((object: Record<string, unknown>) => placed.push(object)),
            setActiveObject: jest.fn(),
            requestRenderAll: jest.fn(),
        } as unknown as Parameters<typeof useBackgroundJobPolling>[0]['canvas'];

        render(
            <PollingHarness
                canvas={canvas}
                initialJobs={[{
                    id: 'meshy-job-render',
                    type: 'image-to-3d',
                    provider: 'meshy',
                    status: 'IN_PROGRESS',
                    progress: 20,
                    createdAt: Date.now(),
                    apiKey: 'meshy-key',
                    prompt: 'Hero',
                }]}
            />,
        );

        await act(async () => {
            jest.advanceTimersByTime(2000);
            await Promise.resolve();
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(mockRenderModelThumbnail).toHaveBeenCalledWith(
                'https://cdn.example.com/hero.glb',
                'https://cdn.example.com/hero.glb',
                512,
            );
        });

        await waitFor(() => expect(placed).toHaveLength(1));
        // The placed object is the RENDER of the glb, and it carries the model
        // link so it stays a real 3D layer.
        expect(placed[0].sourceUrl).toBe('data:image/png;base64,RENDERED');
        expect(placed[0].is3DModel).toBe(true);
        expect(placed[0].modelUrl).toBe('https://cdn.example.com/hero.glb');
    });

    it('caps concurrent poll requests at the worker-pool size', async () => {
        // 6 running jobs, but the scheduler must act like a small worker pool:
        // no more than 3 status requests in flight at once.
        let inFlight = 0;
        let maxInFlight = 0;
        (global.fetch as jest.Mock).mockImplementation(async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 500));
            inFlight -= 1;
            return {
                ok: true,
                json: async () => ({ status: 'IN_PROGRESS', progress: 10 }),
            };
        });

        const jobs: BackgroundJob[] = Array.from({ length: 6 }, (_, index) => ({
            id: `meshy-parallel-${index}`,
            type: 'image-to-3d',
            provider: 'meshy',
            status: 'IN_PROGRESS',
            progress: 5,
            createdAt: Date.now(),
            apiKey: 'meshy-key',
            prompt: `Job ${index}`,
        }));

        render(<PollingHarness initialJobs={jobs} />);

        await act(async () => {
            // First wake fires the due checks; the 500ms fetch delay holds
            // requests in flight while the scheduler considers the rest.
            jest.advanceTimersByTime(100);
            await Promise.resolve();
            jest.advanceTimersByTime(3000);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(0);
        expect(maxInFlight).toBeLessThanOrEqual(3);
    });

    it('does not busy-spin the timer while polls are in flight', async () => {
        // Regression: in-flight jobs kept a due time in the past, so the
        // scheduler computed a negative delay, fired immediately, dispatched
        // nothing (pool full), and re-armed at 0ms — a tight CPU loop for the
        // whole poll cycle.
        (global.fetch as jest.Mock).mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return { ok: true, json: async () => ({ status: 'IN_PROGRESS', progress: 10 }) };
        });

        const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

        const jobs: BackgroundJob[] = Array.from({ length: 6 }, (_, index) => ({
            id: `meshy-spin-${index}`,
            type: 'image-to-3d',
            provider: 'meshy',
            status: 'IN_PROGRESS',
            progress: 5,
            createdAt: Date.now(),
            apiKey: 'meshy-key',
            prompt: `Job ${index}`,
        }));

        render(<PollingHarness initialJobs={jobs} />);

        await act(async () => {
            jest.advanceTimersByTime(50);
            await Promise.resolve();
        });

        const callsAfterDispatch = setTimeoutSpy.mock.calls.length;

        // Advance the clock while the 3 workers are still mid-request (their
        // fetch takes 5s). A spinning scheduler re-arms at 0ms every tick and
        // burns CPU without issuing any useful work; a correct one parks until
        // a worker frees up.
        await act(async () => {
            jest.advanceTimersByTime(1000);
            await Promise.resolve();
        });

        const zeroDelayRearms = setTimeoutSpy.mock.calls
            .slice(callsAfterDispatch)
            .filter((call) => (call[1] ?? 0) === 0).length;

        expect(zeroDelayRearms).toBeLessThan(10);
        setTimeoutSpy.mockRestore();
    });

    it('marks Meshy jobs cancelled when upstream reports a cancelled status', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({
                status: 'CANCELED',
                progress: 10,
            }),
        });

        const initialJobs: BackgroundJob[] = [
            {
                id: 'meshy-job-cancelled',
                type: 'text-to-3d',
                provider: 'meshy',
                status: 'IN_PROGRESS',
                progress: 10,
                createdAt: Date.now(),
                apiKey: 'meshy-key',
                prompt: 'Cancelled Robot',
            },
        ];

        render(<PollingHarness initialJobs={initialJobs} />);

        await act(async () => {
            jest.advanceTimersByTime(2000);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByTestId('job-status')).toHaveTextContent('CANCELLED');
        expect(screen.getByTestId('job-result')).toHaveTextContent('none');
        expect(mockPersistAssetToLibrary).not.toHaveBeenCalled();
    });
});