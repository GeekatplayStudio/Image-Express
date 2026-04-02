import {
    GENERATIVE_PREFERENCES_CHANGED_EVENT,
    GENERATIVE_PREFERENCES_STORAGE_KEY,
    loadGenerativePreferences,
    resolveCompatibleWorkflowForProvider,
    resolveGenerativeLaunchState,
    saveGenerativePreferences,
} from '@/lib/generative-preferences';

describe('generative-preferences', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('loads defaults when no settings exist', () => {
        expect(loadGenerativePreferences()).toEqual({
            defaultProvider: 'comfy',
            defaultWorkflow: 'zone',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            comfyInstallPath: '',
            comfyCustomNodesPath: '',
            comfyWorkflowLibraryPath: '',
            autoStartInpaintMasking: false,
            showInpaintPromptDock: true,
        });
    });

    it('saves and dispatches updates', () => {
        const listener = jest.fn();
        window.addEventListener(GENERATIVE_PREFERENCES_CHANGED_EVENT, listener);

        const next = saveGenerativePreferences({
            defaultProvider: 'comfy',
            defaultWorkflow: 'zone',
            comfyServerUrl: 'http://localhost:9999',
            comfyInstallPath: 'D:\\ComfyUI',
            comfyCustomNodesPath: 'D:\\ComfyUI\\custom_nodes',
            comfyWorkflowLibraryPath: 'D:\\ComfyUI\\user\\default\\workflows',
            autoStartInpaintMasking: false,
            showInpaintPromptDock: false,
        });

        expect(next).toEqual({
            defaultProvider: 'comfy',
            defaultWorkflow: 'zone',
            comfyServerUrl: 'http://localhost:9999',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            comfyInstallPath: 'D:\\ComfyUI',
            comfyCustomNodesPath: 'D:\\ComfyUI\\custom_nodes',
            comfyWorkflowLibraryPath: 'D:\\ComfyUI\\user\\default\\workflows',
            autoStartInpaintMasking: false,
            showInpaintPromptDock: false,
        });
        expect(loadGenerativePreferences()).toEqual(next);
        expect(listener).toHaveBeenCalledTimes(1);

        window.removeEventListener(GENERATIVE_PREFERENCES_CHANGED_EVENT, listener);
    });

    it('falls back to legacy keys', () => {
        window.localStorage.setItem('image-express-gen-provider', 'openai');
        window.localStorage.setItem('image-express-comfy-url', 'http://127.0.0.1:8288');

        const loaded = loadGenerativePreferences();
        expect(loaded.defaultProvider).toBe('openai');
        expect(loaded.comfyServerUrl).toBe('http://127.0.0.1:8288');
    });

    it('normalizes the legacy default comfy URL to localhost', () => {
        window.localStorage.setItem(
            GENERATIVE_PREFERENCES_STORAGE_KEY,
            JSON.stringify({
                comfyServerUrl: 'http://127.0.0.1:8188',
            })
        );

        expect(loadGenerativePreferences().comfyServerUrl).toBe('http://localhost:8188');
    });

    it('handles malformed storage values gracefully', () => {
        window.localStorage.setItem(GENERATIVE_PREFERENCES_STORAGE_KEY, '{bad');

        expect(loadGenerativePreferences()).toEqual({
            defaultProvider: 'comfy',
            defaultWorkflow: 'zone',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            comfyInstallPath: '',
            comfyCustomNodesPath: '',
            comfyWorkflowLibraryPath: '',
            autoStartInpaintMasking: false,
            showInpaintPromptDock: true,
        });
    });

    it('resolves stability workflow launch when provider is available', () => {
        const launch = resolveGenerativeLaunchState({
            defaultProvider: 'stability',
            defaultWorkflow: 'stability-outpaint',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            comfyInstallPath: '',
            comfyCustomNodesPath: '',
            comfyWorkflowLibraryPath: '',
            autoStartInpaintMasking: true,
            showInpaintPromptDock: true,
        }, ['comfy', 'stability', 'openai']);

        expect(launch).toEqual({
            provider: 'stability',
            mode: 'stability',
            stabilityTab: 'outpaint',
        });
    });

    it('falls back to zone launch when stability is unavailable', () => {
        const launch = resolveGenerativeLaunchState({
            defaultProvider: 'stability',
            defaultWorkflow: 'stability-inpaint',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            comfyInstallPath: '',
            comfyCustomNodesPath: '',
            comfyWorkflowLibraryPath: '',
            autoStartInpaintMasking: true,
            showInpaintPromptDock: true,
        }, ['comfy', 'openai']);

        expect(launch.mode).toBe('zone');
        expect(launch.provider).toBe('comfy');
    });

    it('keeps Google as the launch provider now that it is ready', () => {
        const launch = resolveGenerativeLaunchState({
            defaultProvider: 'google',
            defaultWorkflow: 'zone',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            comfyInstallPath: '',
            comfyCustomNodesPath: '',
            comfyWorkflowLibraryPath: '',
            autoStartInpaintMasking: true,
            showInpaintPromptDock: true,
        }, ['google', 'openai']);

        expect(launch.mode).toBe('zone');
        expect(launch.provider).toBe('google');
    });

    it('keeps Ollama as the launch provider for zone workflows when available', () => {
        const launch = resolveGenerativeLaunchState({
            defaultProvider: 'ollama',
            defaultWorkflow: 'zone',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            comfyInstallPath: '',
            comfyCustomNodesPath: '',
            comfyWorkflowLibraryPath: '',
            autoStartInpaintMasking: false,
            showInpaintPromptDock: true,
        }, ['comfy', 'ollama']);

        expect(launch).toEqual({
            provider: 'ollama',
            mode: 'zone',
            stabilityTab: 'generate',
        });
    });

    it('resolves unsupported workflow to provider-compatible fallback', () => {
        expect(resolveCompatibleWorkflowForProvider('openai', 'stability-inpaint')).toBe('zone');
    });
});
