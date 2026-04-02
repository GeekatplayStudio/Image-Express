import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsModal, { getApiKey } from '../SettingsModal';

const mockConnectGoogleDrive = jest.fn();
const mockDisconnectGoogleDrive = jest.fn();
const mockLoadDriveConfig = jest.fn();
const mockUpdateDriveConfig = jest.fn();
const mockLoadAssetStorageSettings = jest.fn();
const mockSaveAssetStorageSettings = jest.fn();
const mockRequestOpenSetupWizard = jest.fn();
const mockUseEscapeKey = jest.fn();
const mockDialogConfirm = jest.fn();
const mockInspectComfyServerCatalog = jest.fn();

jest.mock('@/lib/googleDrive', () => ({
    connectGoogleDrive: (...args: unknown[]) => mockConnectGoogleDrive(...args),
    disconnectGoogleDrive: (...args: unknown[]) => mockDisconnectGoogleDrive(...args),
    loadDriveConfig: (...args: unknown[]) => mockLoadDriveConfig(...args),
    updateDriveConfig: (...args: unknown[]) => mockUpdateDriveConfig(...args),
}));

jest.mock('@/lib/assetStorageSettings', () => ({
    loadAssetStorageSettings: (...args: unknown[]) => mockLoadAssetStorageSettings(...args),
    saveAssetStorageSettings: (...args: unknown[]) => mockSaveAssetStorageSettings(...args),
}));

jest.mock('@/lib/setupWizard', () => ({
    requestOpenSetupWizard: (...args: unknown[]) => mockRequestOpenSetupWizard(...args),
}));

jest.mock('@/providers/DialogProvider', () => ({
    useDialog: () => ({
        confirm: (...args: unknown[]) => mockDialogConfirm(...args),
    }),
}));

jest.mock('@/lib/comfyui/runner', () => ({
    inspectComfyServerCatalog: (...args: unknown[]) => mockInspectComfyServerCatalog(...args),
}));

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseEscapeKey(...args),
}));

jest.mock('../HelpPopup', () => ({
    __esModule: true,
    default: ({ isOpen, type }: { isOpen: boolean; type: string }) => (
        isOpen ? <div data-testid="help-popup">{type}</div> : null
    ),
}));

describe('SettingsModal', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        process.env = { ...originalEnv };
        delete process.env.NEXT_PUBLIC_MESHY_API_KEY;
        Object.defineProperty(window, 'desktop', {
            value: undefined,
            configurable: true,
            writable: true,
        });

        mockLoadDriveConfig.mockReturnValue({ enabled: false, clientId: '' });
        mockUpdateDriveConfig.mockReturnValue({ enabled: false, clientId: '' });
        mockLoadAssetStorageSettings.mockReturnValue({
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: true,
        });
        mockConnectGoogleDrive.mockResolvedValue({ enabled: true, clientId: 'client-1', folderName: 'Backups' });
        mockDisconnectGoogleDrive.mockResolvedValue(undefined);
        mockDialogConfirm.mockResolvedValue(true);
        mockInspectComfyServerCatalog.mockResolvedValue({
            serverUrl: 'http://localhost:8188',
            transportKind: 'local',
            detectedVersion: '0.8.2',
            workflowCount: 1,
            compatibleWorkflowCount: 1,
            records: [],
        });

        const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.startsWith('/api/user/keys?')) {
                return {
                    ok: true,
                    json: async () => ({
                        keys: {
                            meshy: 'srv-meshy',
                            openai: 'srv-openai',
                        },
                    }),
                } as Response;
            }
            if (url === '/api/user/keys' && init?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({ success: true }),
                } as Response;
            }
            if (url.startsWith('/api/user/admin/users?')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        users: [
                            {
                                id: 'usr-1',
                                email: 'member@example.com',
                                displayName: 'Member',
                                status: 'pending',
                                roles: ['creator'],
                                rights: ['assets:own'],
                            },
                        ],
                    }),
                } as Response;
            }
            if (url === '/api/user/admin/users' && init?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({ success: true }),
                } as Response;
            }
            if (url === '/api/logs/login') {
                return {
                    ok: true,
                    text: async () => 'login-entry-1',
                } as Response;
            }
            if (url.startsWith('/api/ai/ollama/status?')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        requestedModel: 'qwen2.5:7b',
                        modelFound: true,
                        count: 1,
                        models: ['qwen2.5:7b'],
                    }),
                } as Response;
            }
            if (url === '/api/ai/comfy/library' && init?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        message: 'Comfy library refreshed.',
                        snapshot: {
                            installPath: 'D:\\ComfyUI',
                            customNodesPath: 'D:\\ComfyUI\\custom_nodes',
                            workflowLibraryPath: 'D:\\ComfyUI\\user\\default\\workflows',
                            serverTemplates: [
                                {
                                    id: 'server-upscale',
                                    source: 'server-template',
                                    name: 'Server Upscale',
                                    description: 'Upscale template',
                                    task: 'upscale',
                                    runnable: true,
                                    category: 'Server Templates',
                                    nodeTypes: ['LoadImage', 'SaveImage'],
                                },
                            ],
                            customFolderWorkflows: [],
                            nodeRepos: [
                                {
                                    name: 'custom-upscaler',
                                    path: 'D:\\ComfyUI\\custom_nodes\\custom-upscaler',
                                    repoKind: 'custom-nodes',
                                    gitManaged: true,
                                    workflowHintCount: 2,
                                    requirementsFile: true,
                                },
                            ],
                            warnings: [],
                        },
                    }),
                } as Response;
            }
            return {
                ok: true,
                json: async () => ({}),
                text: async () => '',
            } as Response;
        });
        (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('does not render when closed', () => {
        render(<SettingsModal isOpen={false} onClose={jest.fn()} />);
        expect(screen.queryByText('API Configurations')).toBeNull();
    });

    it('loads keys/settings and saves local + server configuration', async () => {
        render(
            <SettingsModal
                isOpen={true}
                onClose={jest.fn()}
                userId="owner@example.com"
                userRoles={['creator']}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Synced with Account')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText('Enter Meshy API Key'), {
            target: { value: 'new-meshy' },
        });
        fireEvent.change(screen.getByPlaceholderText('http://127.0.0.1:11434'), {
            target: { value: 'http://localhost:11434' },
        });
        fireEvent.change(screen.getByPlaceholderText('qwen2.5:7b'), {
            target: { value: 'llava:7b' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Check Ollama/i }));
        await waitFor(() => {
            expect(screen.getByText(/Ollama is reachable/i)).toBeInTheDocument();
        });
        fireEvent.change(screen.getByDisplayValue('Hybrid (local + optional cloud per upload)'), {
            target: { value: 'cloud' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Save Configurations/i }));

        await waitFor(() => {
            expect(window.localStorage.getItem('meshy_api_key')).toBe('new-meshy');
        });
        expect(window.localStorage.getItem('image-express-local-ai-preferences')).toContain('http://localhost:11434');
        expect(window.localStorage.getItem('image-express-local-ai-preferences')).toContain('llava:7b');
        expect(mockSaveAssetStorageSettings).toHaveBeenCalledWith({
            mode: 'cloud',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: true,
        });

        const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/user/keys',
            expect.objectContaining({
                method: 'POST',
            })
        );
    });

    it('handles drive connect flow and launches setup wizard', async () => {
        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        fireEvent.click(screen.getByRole('button', { name: /^Connect$/i }));
        expect(screen.getByText('Add a Google OAuth client ID before connecting.')).toBeInTheDocument();

        const clientIdInput = screen.getByPlaceholderText('1234567890-abcdef.apps.googleusercontent.com');
        fireEvent.change(clientIdInput, { target: { value: 'client-1' } });
        expect(mockUpdateDriveConfig).toHaveBeenCalledWith({ clientId: 'client-1' });

        fireEvent.click(screen.getByRole('button', { name: /^Connect$/i }));
        await waitFor(() => {
            expect(mockConnectGoogleDrive).toHaveBeenCalledWith('client-1');
        });

        fireEvent.click(screen.getByRole('button', { name: /Launch Setup Wizard/i }));
        expect(mockRequestOpenSetupWizard).toHaveBeenCalledTimes(1);
    });

    it('shows the Comfy workflow manager and installs a repo through the library route', async () => {
        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        await waitFor(() => {
            expect(screen.getByText('Comfy Workflow Manager')).toBeInTheDocument();
            expect(screen.getByText('custom-upscaler')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
            target: { value: 'https://github.com/example/custom-upscaler' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Install Repo/i }));

        await waitFor(() => {
            const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/ai/comfy/library',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('install-repo'),
                })
            );
        });
    });

    it('prompts to install missing Comfy requirements and runs the install action', async () => {
        mockInspectComfyServerCatalog.mockResolvedValueOnce({
            serverUrl: 'http://localhost:8188',
            transportKind: 'local',
            detectedVersion: '0.8.2',
            workflowCount: 1,
            compatibleWorkflowCount: 0,
            records: [
                {
                    workflowId: 'image_flux2_klein_image_edit_4b_base',
                    workflowName: 'FLUX 2 Klein Image Edit (4B Template)',
                    task: 'img2img',
                    requiredNodeTypes: ['UNETLoader'],
                    missingNodeTypes: ['Flux2Scheduler'],
                    missingModels: [
                        {
                            name: 'flux2-vae.safetensors',
                            directory: 'vae',
                            downloadUrl: 'https://example.com/flux2-vae.safetensors',
                        },
                    ],
                    compatible: false,
                    canAutoUpdateInstall: true,
                },
            ],
        });

        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        fireEvent.click(screen.getByRole('button', { name: /Verify Comfy Connection/i }));

        await waitFor(() => {
            expect(screen.getByText('Missing Comfy requirements detected')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Install Missing Requirements/i })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Install Missing Requirements/i }));

        await waitFor(() => {
            expect(mockDialogConfirm).toHaveBeenCalled();
            const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/ai/comfy/library',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('install-requirements'),
                })
            );
        });
    });

    it('supports desktop updates, admin actions, log view, and disconnect', async () => {
        const desktopApi = {
            isDesktop: true,
            onUpdateStatus: (listener: (payload: { status: string; message: string }) => void) => {
                listener({ status: 'ready', message: 'Update ready' });
                return () => undefined;
            },
            checkForUpdates: jest.fn().mockResolvedValue({ status: 'ready', message: 'New version found' }),
            installUpdate: jest.fn().mockResolvedValue(undefined),
        };
        Object.defineProperty(window, 'desktop', {
            value: desktopApi,
            configurable: true,
        });

        mockLoadDriveConfig.mockReturnValue({ enabled: true, clientId: 'client-1', folderName: 'Backups' });

        render(
            <SettingsModal
                isOpen={true}
                onClose={jest.fn()}
                userId="admin@example.com"
                userRoles={['admin']}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('User Management')).toBeInTheDocument();
            expect(screen.getByText('member@example.com')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Check Now/i }));
        await waitFor(() => {
            expect(desktopApi.checkForUpdates).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Restart & Install Update/i }));
        await waitFor(() => {
            expect(desktopApi.installUpdate).toHaveBeenCalled();
        });

        fireEvent.change(screen.getByPlaceholderText('admin, creator'), {
            target: { value: 'admin, creator' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Save Roles/i }));
        await waitFor(() => {
            const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/user/admin/users',
                expect.objectContaining({ method: 'POST' })
            );
        });

        fireEvent.click(screen.getByRole('button', { name: /View Login Activity Log/i }));
        await waitFor(() => {
            expect(screen.getByText('login-entry-1')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }));
        await waitFor(() => {
            expect(mockDisconnectGoogleDrive).toHaveBeenCalledTimes(1);
        });
    });
});

describe('getApiKey', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        window.localStorage.clear();
        process.env = { ...originalEnv };
        delete process.env.NEXT_PUBLIC_MESHY_API_KEY;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('returns local values when set and falls back to meshy env key', () => {
        window.localStorage.setItem('meshy_api_key', 'local-meshy');
        window.localStorage.setItem('tripo_api_key', 'local-tripo');
        window.localStorage.setItem('hitems_api_key', 'local-hitems');

        expect(getApiKey('meshy')).toBe('local-meshy');
        expect(getApiKey('tripo')).toBe('local-tripo');
        expect(getApiKey('hitems')).toBe('local-hitems');

        window.localStorage.removeItem('meshy_api_key');
        process.env.NEXT_PUBLIC_MESHY_API_KEY = 'env-meshy';
        expect(getApiKey('meshy')).toBe('env-meshy');
    });
});
