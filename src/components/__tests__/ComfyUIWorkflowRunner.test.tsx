import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ComfyUIWorkflowRunner } from '../ComfyUIWorkflowRunner';

const mockExecuteComfyTask = jest.fn();
const mockGetAllWorkflows = jest.fn();
const mockGetWorkflow = jest.fn();
const mockEnsureCatalog = jest.fn();

jest.mock('@/lib/comfyui/runner', () => ({
    executeComfyTask: (...args: unknown[]) => mockExecuteComfyTask(...args),
}));

jest.mock('@/lib/comfyui/registry', () => ({
    comfyWorkflowRegistry: {
        getAllWorkflows: () => mockGetAllWorkflows(),
        getWorkflow: (...args: unknown[]) => mockGetWorkflow(...args),
    },
}));

jest.mock('@/lib/comfyui/workflows/catalog', () => ({
    ensureComfyWorkflowCatalogRegistered: () => mockEnsureCatalog(),
}));

describe('ComfyUIWorkflowRunner', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetAllWorkflows.mockReturnValue([
            { id: 'workflow-alpha', task: 'generate' },
        ]);
        mockGetWorkflow.mockReturnValue({
            id: 'workflow-alpha',
            task: 'generate',
        });
    });

    it('ignores rapid repeated workflow launches while the first run is in flight', async () => {
        let resolveExecution: ((value: { result: { dataUrl: string } }) => void) | null = null;
        mockExecuteComfyTask.mockReturnValueOnce(new Promise((resolve) => {
            resolveExecution = resolve;
        }));

        render(<ComfyUIWorkflowRunner />);

        const runButton = screen.getByRole('button', { name: /Run Workflow/i });

        await act(async () => {
            runButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            runButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(mockExecuteComfyTask).toHaveBeenCalledTimes(1);

        resolveExecution?.({ result: { dataUrl: 'data:image/png;base64,runner' } });

        await waitFor(() => {
            expect(screen.getByAltText('ComfyUI result')).toBeInTheDocument();
        });
    });
});