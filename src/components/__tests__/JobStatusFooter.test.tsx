import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JobStatusFooter from '../JobStatusFooter';
import type { BackgroundJob } from '@/types';

describe('JobStatusFooter', () => {
    const writeTextMock = jest.fn();
    const originalClipboard = navigator.clipboard;
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const makeJob = (partial: Partial<BackgroundJob>): BackgroundJob => ({
        id: 'job-1',
        type: 'text-to-3d',
        status: 'PENDING',
        createdAt: Date.now(),
        ...partial,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: writeTextMock },
            configurable: true,
        });
    });

    afterAll(() => {
        Object.defineProperty(navigator, 'clipboard', {
            value: originalClipboard,
            configurable: true,
        });
        consoleErrorSpy.mockRestore();
    });

    it('returns null when no jobs exist', () => {
        const { container } = render(<JobStatusFooter jobs={[]} onClear={jest.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders processing job state with progress and no clear button', () => {
        render(
            <JobStatusFooter
                jobs={[makeJob({ id: 'job-processing', status: 'IN_PROGRESS', progress: 42, prompt: 'spaceship' })]}
                onClear={jest.fn()}
            />
        );

        expect(screen.getByText('Gen: spaceship')).toBeInTheDocument();
        expect(screen.getByText('Processing... 42%')).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
        expect(screen.getByText('Background Jobs')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear finished jobs' })).not.toBeInTheDocument();
    });

    it('renders succeeded and failed jobs and clears completed entries', () => {
        const onClear = jest.fn();
        render(
            <JobStatusFooter
                jobs={[
                    makeJob({ id: 'job-ok', status: 'SUCCEEDED', prompt: 'tree model', resultUrl: 'https://cdn.example.com/tree-model.glb' }),
                    makeJob({ id: 'job-fail', status: 'FAILED', type: 'image-to-3d', error: 'Quota exceeded' }),
                ]}
                onClear={onClear}
            />
        );

        expect(screen.getByText('Saved to server & added.')).toBeInTheDocument();
        expect(screen.getByText('Image to 3D')).toBeInTheDocument();
        expect(screen.getByText('Quota exceeded')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open result for job job-ok' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Clear job job-ok' }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear job job-fail' }));

        expect(onClear).toHaveBeenNthCalledWith(1, 'job-ok');
        expect(onClear).toHaveBeenNthCalledWith(2, 'job-fail');
    });

    it('opens completed job results when available', () => {
        const onOpenResult = jest.fn();
        const completedJob = makeJob({
            id: 'job-open',
            status: 'SUCCEEDED',
            prompt: 'tree model',
            resultUrl: 'https://cdn.example.com/tree-model.glb',
        });

        render(
            <JobStatusFooter
                jobs={[completedJob]}
                onClear={jest.fn()}
                onOpenResult={onOpenResult}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Open result for job job-open' }));

        expect(onOpenResult).toHaveBeenCalledWith(completedJob);
    });

    it('filters jobs by status and can bulk-clear finished jobs', () => {
        const onClear = jest.fn();
        render(
            <JobStatusFooter
                jobs={[
                    makeJob({ id: 'job-processing', status: 'IN_PROGRESS', progress: 20, prompt: 'spaceship' }),
                    makeJob({ id: 'job-ok', status: 'SUCCEEDED', prompt: 'tree model' }),
                    makeJob({ id: 'job-fail', status: 'FAILED', type: 'image-to-3d', error: 'Quota exceeded' }),
                ]}
                onClear={onClear}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Failed jobs' }));
        expect(screen.queryByText('Gen: spaceship')).not.toBeInTheDocument();
        expect(screen.queryByText('Saved to server & added.')).not.toBeInTheDocument();
        expect(screen.getByText('Quota exceeded')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Finished jobs' }));
        expect(screen.getByText('Saved to server & added.')).toBeInTheDocument();
        expect(screen.getByText('Quota exceeded')).toBeInTheDocument();
        expect(screen.queryByText('Gen: spaceship')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Clear finished jobs' }));
        expect(onClear).toHaveBeenNthCalledWith(1, 'job-ok');
        expect(onClear).toHaveBeenNthCalledWith(2, 'job-fail');
    });

    it('filters jobs by provider and type', () => {
        render(
            <JobStatusFooter
                jobs={[
                    makeJob({ id: 'job-meshy', status: 'SUCCEEDED', provider: 'meshy', prompt: 'spaceship', resultUrl: 'https://cdn.example.com/spaceship.glb' }),
                    makeJob({ id: 'job-tripo', status: 'FAILED', provider: 'tripo', type: 'image-to-3d', error: 'Tripo failed' }),
                    makeJob({ id: 'job-stability', status: 'SUCCEEDED', provider: 'stability', type: 'stability-upscale', resultUrl: 'data:image/png;base64,abc' }),
                ]}
                onClear={jest.fn()}
            />
        );

        fireEvent.change(screen.getByRole('combobox', { name: 'Filter jobs by provider' }), {
            target: { value: 'tripo' },
        });

        expect(screen.getByText('Image to 3D')).toBeInTheDocument();
        expect(screen.getByText('Tripo failed')).toBeInTheDocument();
        expect(screen.queryByText('Gen: spaceship')).not.toBeInTheDocument();
        expect(screen.queryByText('Stability Upscale')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Reset provider and type filters' }));
        fireEvent.change(screen.getByRole('combobox', { name: 'Filter jobs by type' }), {
            target: { value: 'stability-upscale' },
        });

        expect(screen.getByText('Stability Upscale')).toBeInTheDocument();
        expect(screen.queryByText('Gen: spaceship')).not.toBeInTheDocument();
        expect(screen.queryByText('Tripo failed')).not.toBeInTheDocument();
    });

    it('surfaces retry and stop actions when callbacks are provided', () => {
        const onRetry = jest.fn();
        const onCancel = jest.fn();

        render(
            <JobStatusFooter
                jobs={[
                    makeJob({ id: 'job-active', status: 'IN_PROGRESS', progress: 20, provider: 'meshy', prompt: 'spaceship' }),
                    makeJob({
                        id: 'job-failed',
                        status: 'FAILED',
                        provider: 'meshy',
                        prompt: 'dragon',
                        request: { provider: 'meshy', mode: 'text', prompt: 'dragon' },
                        error: 'Meshy failed',
                    }),
                ]}
                onClear={jest.fn()}
                onRetry={onRetry}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Stop tracking job job-active' }));
        fireEvent.click(screen.getByRole('button', { name: 'Retry job job-failed' }));

        expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-active' }));
        expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-failed' }));
    });

    it('copies job id to clipboard', async () => {
        writeTextMock.mockResolvedValue(undefined);
        render(
            <JobStatusFooter
                jobs={[makeJob({ id: 'job-copy', status: 'PENDING', prompt: 'copy me' })]}
                onClear={jest.fn()}
            />
        );

        fireEvent.click(screen.getByTitle('Copy Job ID'));
        await waitFor(() => {
            expect(writeTextMock).toHaveBeenCalledWith('job-copy');
        });
    });

    it('logs clipboard copy failures without throwing', async () => {
        writeTextMock.mockRejectedValue(new Error('copy denied'));
        render(
            <JobStatusFooter
                jobs={[makeJob({ id: 'job-copy-fail', status: 'PENDING', prompt: 'copy me' })]}
                onClear={jest.fn()}
            />
        );

        fireEvent.click(screen.getByTitle('Copy Job ID'));

        await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to copy job id', expect.any(Error));
        });
    });
});
