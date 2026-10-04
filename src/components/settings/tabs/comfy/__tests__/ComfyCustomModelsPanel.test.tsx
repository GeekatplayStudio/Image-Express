import { fireEvent, render, screen } from '@testing-library/react';

import ComfyCustomModelsPanel from '@/components/settings/tabs/comfy/ComfyCustomModelsPanel';
import { loadComfyCustomModels } from '@/lib/comfyui/customModels';
import { comfyWorkflowRegistry } from '@/lib/comfyui/registry';
import { syncComfyCustomModels } from '@/lib/comfyui/workflows/catalog';

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

const fill = (name: string, file: string) => {
    fireEvent.change(screen.getByPlaceholderText('comfyCustom.namePlaceholder'), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText('myModel.safetensors'), { target: { value: file } });
    fireEvent.click(screen.getByText('comfyCustom.add'));
};

describe('ComfyCustomModelsPanel', () => {
    beforeEach(() => {
        window.localStorage.clear();
        syncComfyCustomModels();
    });

    it('registers a model: stored, listed, and selectable in the registry', () => {
        render(<ComfyCustomModelsPanel availableCheckpoints={['juggernautXL.safetensors']} />);
        fill('Juggernaut XL', 'juggernautXL.safetensors');

        expect(screen.getByText('Juggernaut XL')).toBeTruthy();
        expect(loadComfyCustomModels().map((model) => model.checkpointFile)).toEqual(['juggernautXL.safetensors']);
        expect(comfyWorkflowRegistry.getModelPresetsForWorkflow('generate-basic').map((preset) => preset.id))
            .toContain('custom:juggernautxl');
        // The form is ready for the next one.
        expect((screen.getByPlaceholderText('myModel.safetensors') as HTMLInputElement).value).toBe('');
    });

    it('blocks a file the server does not have, and says what to do', () => {
        render(<ComfyCustomModelsPanel availableCheckpoints={['other.safetensors']} />);
        fill('Mine', 'mine.safetensors');

        expect(screen.getByRole('alert').textContent).toContain('comfyCustom.issue.fileNotOnServer');
        expect(loadComfyCustomModels()).toEqual([]);
    });

    it('accepts a well-formed file when the server has not been checked, and says so', () => {
        render(<ComfyCustomModelsPanel availableCheckpoints={null} />);
        expect(screen.getByText('comfyCustom.unverified')).toBeTruthy();
        fill('Mine', 'mine.safetensors');
        expect(loadComfyCustomModels()).toHaveLength(1);
    });

    it('blocks a path and a non-model file', () => {
        render(<ComfyCustomModelsPanel availableCheckpoints={null} />);
        fill('Mine', '../mine.safetensors');
        expect(screen.getByRole('alert').textContent).toContain('comfyCustom.issue.fileIsPath');
        fill('Mine', 'readme.txt');
        expect(screen.getByRole('alert').textContent).toContain('comfyCustom.issue.fileExtension');
        expect(loadComfyCustomModels()).toEqual([]);
    });

    it('removes a model from storage and from the registry', () => {
        render(<ComfyCustomModelsPanel availableCheckpoints={null} />);
        fill('Mine', 'mine.safetensors');
        fireEvent.click(screen.getByTitle('comfyCustom.remove'));

        expect(screen.getByText('comfyCustom.empty')).toBeTruthy();
        expect(loadComfyCustomModels()).toEqual([]);
        expect(comfyWorkflowRegistry.getModelPresetsForWorkflow('generate-basic').map((preset) => preset.id))
            .not.toContain('custom:mine');
    });

    it('shows models registered in an earlier session', () => {
        window.localStorage.setItem('image-express-comfy-custom-models', JSON.stringify([
            { id: 'custom:kept', name: 'Kept', checkpointFile: 'kept.safetensors', createdAt: '2026-10-01T00:00:00.000Z' },
        ]));
        render(<ComfyCustomModelsPanel availableCheckpoints={null} />);
        expect(screen.getByText('Kept')).toBeTruthy();
    });
});
