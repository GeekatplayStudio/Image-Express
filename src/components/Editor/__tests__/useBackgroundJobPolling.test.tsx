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
    Group: class {},
    Rect: class {},
    IText: class {},
}));

type HarnessProps = {
    initialJobs: BackgroundJob[];
    user?: string;
};

function PollingHarness({ initialJobs, user = 'Polling Tester' }: HarnessProps) {
    const [backgroundJobs, setBackgroundJobs] = useState(initialJobs);

    useBackgroundJobPolling({
        backgroundJobs,
        setBackgroundJobs,
        canvas: null,
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
});