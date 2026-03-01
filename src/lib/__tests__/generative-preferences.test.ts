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
            defaultProvider: 'stability',
            defaultWorkflow: 'stability-inpaint',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            autoStartInpaintMasking: true,
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
            autoStartInpaintMasking: false,
            showInpaintPromptDock: false,
        });

        expect(next).toEqual({
            defaultProvider: 'comfy',
            defaultWorkflow: 'zone',
            comfyServerUrl: 'http://localhost:9999',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
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
            defaultProvider: 'stability',
            defaultWorkflow: 'stability-inpaint',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            autoStartInpaintMasking: true,
            showInpaintPromptDock: true,
        });
    });

    it('resolves stability workflow launch when provider is available', () => {
        const launch = resolveGenerativeLaunchState({
            defaultProvider: 'openai',
            defaultWorkflow: 'stability-outpaint',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
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
            autoStartInpaintMasking: true,
            showInpaintPromptDock: true,
        }, ['comfy', 'openai']);

        expect(launch.mode).toBe('zone');
        expect(launch.provider).toBe('comfy');
    });

    it('falls back to a ready provider when default provider is coming soon', () => {
        const launch = resolveGenerativeLaunchState({
            defaultProvider: 'google',
            defaultWorkflow: 'zone',
            comfyServerUrl: 'http://localhost:8188',
            comfyConnectionMode: 'auto',
            comfyCloudUrl: 'https://cloud.comfy.org',
            autoStartInpaintMasking: true,
            showInpaintPromptDock: true,
        }, ['google', 'openai']);

        expect(launch.mode).toBe('zone');
        expect(launch.provider).toBe('openai');
    });

    it('resolves unsupported workflow to provider-compatible fallback', () => {
        expect(resolveCompatibleWorkflowForProvider('openai', 'stability-inpaint')).toBe('zone');
    });
});
