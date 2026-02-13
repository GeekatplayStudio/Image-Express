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
        expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    it('renders succeeded and failed jobs and clears completed entries', () => {
        const onClear = jest.fn();
        render(
            <JobStatusFooter
                jobs={[
                    makeJob({ id: 'job-ok', status: 'SUCCEEDED', prompt: 'tree model' }),
                    makeJob({ id: 'job-fail', status: 'FAILED', type: 'image-to-3d', error: 'Quota exceeded' }),
                ]}
                onClear={onClear}
            />
        );

        expect(screen.getByText('Saved to server & added.')).toBeInTheDocument();
        expect(screen.getByText('Image to 3D')).toBeInTheDocument();
        expect(screen.getByText('Quota exceeded')).toBeInTheDocument();

        const clearButtons = screen.getAllByRole('button').filter((button) => button.title === '');
        fireEvent.click(clearButtons[0]);
        fireEvent.click(clearButtons[1]);

        expect(onClear).toHaveBeenNthCalledWith(1, 'job-ok');
        expect(onClear).toHaveBeenNthCalledWith(2, 'job-fail');
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
