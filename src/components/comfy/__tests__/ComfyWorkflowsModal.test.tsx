import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ComfyWorkflowsModal from '../ComfyWorkflowsModal';

jest.mock('@/lib/comfyui/connection', () => {
    const actual = jest.requireActual('@/lib/comfyui/connection');
    return {
        ...actual,
        verifyAvailableComfyConnection: jest.fn().mockResolvedValue({
            ok: true,
            message: 'Connected to ComfyUI at http://localhost:8188.',
        }),
        loadComfyCloudApiKey: jest.fn().mockReturnValue(''),
    };
});

jest.mock('@/lib/comfyui/runner', () => ({
    executeComfyTask: jest.fn(),
}));

const librarySnapshot = {
    success: true,
    snapshot: {
        customNodesPath: '',
        workflowLibraryPath: 'D:/workflows',
        installPath: '',
        serverTemplates: [
            {
                id: 'official-template-1',
                source: 'server-template',
                name: 'Official Flux Template',
                description: 'An official template from the ComfyUI server.',
                task: 'generate',
                runnable: true,
                category: 'Flux',
                nodeTypes: ['KSampler'],
                registration: {
                    id: 'official-template-1',
                    task: 'generate',
                    name: 'Official Flux Template',
                    description: 'An official template from the ComfyUI server.',
                    blueprint: { '1': { class_type: 'KSampler', inputs: {} } },
                    inputBindings: [],
                    outputNodeIds: ['1'],
                    modelPresetIds: ['default'],
                },
            },
        ],
        customFolderWorkflows: [
            {
                id: 'my-portrait-workflow',
                source: 'custom-folder',
                name: 'My Portrait Workflow',
                description: 'Personal workflow from the configured folder.',
                task: 'img2img',
                runnable: true,
                category: 'Personal',
                location: 'D:/workflows/portrait.json',
                nodeTypes: ['LoadImage'],
                registration: {
                    id: 'my-portrait-workflow',
                    task: 'img2img',
                    name: 'My Portrait Workflow',
                    description: 'Personal workflow from the configured folder.',
                    blueprint: { '1': { class_type: 'LoadImage', inputs: {} } },
                    inputBindings: [{ source: 'image', nodeId: '1', inputName: 'image' }],
                    outputNodeIds: ['1'],
                    modelPresetIds: ['default'],
                },
            },
        ],
        nodeRepos: [],
        warnings: [],
    },
};

describe('ComfyWorkflowsModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => librarySnapshot,
        });
    });

    it('renders connection status, built-in workflows, and scanned library groups', async () => {
        render(<ComfyWorkflowsModal canvas={null} onClose={jest.fn()} />);

        expect(screen.getByText('ComfyUI Workflows')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Connected to ComfyUI at http://localhost:8188.')).toBeInTheDocument();
        });

        expect(screen.getByText(/Built-in Workflows/)).toBeInTheDocument();
        expect(screen.getByText('Basic Text To Image')).toBeInTheDocument();
        expect(screen.getByText('SDXL Inpaint')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Official ComfyUI Templates (1)')).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /Official Flux Template/ })).toBeInTheDocument();
        expect(screen.getByText('My Workflows (1)')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /My Portrait Workflow/ })).toBeInTheDocument();
    });

    it('filters workflows by search query and task chip', async () => {
        render(<ComfyWorkflowsModal canvas={null} onClose={jest.fn()} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /My Portrait Workflow/ })).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText('Search workflows'), { target: { value: 'portrait' } });
        expect(screen.getByRole('button', { name: /My Portrait Workflow/ })).toBeInTheDocument();
        expect(screen.queryByText('Basic Text To Image')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Search workflows'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Inpaint' }));
        expect(screen.getByText('SDXL Inpaint')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /My Portrait Workflow/ })).not.toBeInTheDocument();
    });

    it('shows the source picker for image tasks and validates the prompt before running', async () => {
        render(<ComfyWorkflowsModal canvas={null} onClose={jest.fn()} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /My Portrait Workflow/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /My Portrait Workflow/ }));

        expect(screen.getByText('Source image')).toBeInTheDocument();
        expect(screen.getByText('Whole canvas')).toBeInTheDocument();
        expect(screen.getByLabelText('Workflow prompt')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Run Workflow/ }));
        expect(screen.getByText('Enter a prompt before running this workflow.')).toBeInTheDocument();
    });

    it('shows mask controls for inpaint tasks and guards mask painting without a source', async () => {
        render(<ComfyWorkflowsModal canvas={null} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /SDXL Inpaint/ }));

        expect(screen.getByText('No mask yet — the whole source area will be regenerated.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Paint Mask' }));
        expect(screen.getByText('Select one or more layers on the canvas first, then paint the mask.')).toBeInTheDocument();
        expect(screen.queryByText('Paint Inpaint Mask')).not.toBeInTheDocument();
    });

    it('shows per-side padding controls for outpaint tasks', async () => {
        render(<ComfyWorkflowsModal canvas={null} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /SDXL Outpaint/ }));

        expect(screen.getByLabelText('Outpaint top padding')).toBeInTheDocument();
        expect(screen.getByLabelText('Outpaint right padding')).toBeInTheDocument();
        expect(screen.getByLabelText('Outpaint bottom padding')).toBeInTheDocument();
        expect(screen.getByLabelText('Outpaint left padding')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Outpaint left padding'), { target: { value: '256' } });
        expect(screen.getByLabelText('Outpaint left padding')).toHaveValue(256);
    });

    it('closes via the header button', async () => {
        const onClose = jest.fn();
        render(<ComfyWorkflowsModal canvas={null} onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'Close ComfyUI workflows' }));
        expect(onClose).toHaveBeenCalled();

        await waitFor(() => {
            expect((global as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalledWith(
                '/api/ai/comfy/library',
                expect.objectContaining({ method: 'POST' }),
            );
        });
    });
});
