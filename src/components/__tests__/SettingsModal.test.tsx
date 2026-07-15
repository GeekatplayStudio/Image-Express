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
    ASSET_CLOUD_PROVIDER_OPTIONS: [
        { id: 'google-drive', label: 'Google Drive', availability: 'available', description: 'Google Drive ready.' },
        { id: 'dropbox', label: 'Dropbox', availability: 'planned', description: 'Dropbox planned.' },
        { id: 'onedrive', label: 'OneDrive', availability: 'planned', description: 'OneDrive planned.' },
        { id: 's3-compatible', label: 'S3-compatible', availability: 'planned', description: 'S3 planned.' },
    ],
    getAssetCloudProviderLabel: (provider: string) => ({
                    workflowName: 'Z Image Turbo / FLUX 2 Klein Image Edit (4B Template)',
        dropbox: 'Dropbox',
        onedrive: 'OneDrive',
        's3-compatible': 'S3-compatible',
    }[provider] || 'Cloud'),
    isImplementedAssetCloudProvider: (provider: string) => provider === 'google-drive',
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
    const openTab = async (name: RegExp) => {
        fireEvent.click(screen.getByRole('tab', { name }));
        await waitFor(() => {
            expect(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
        });
    };

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
            if (url.startsWith('/api/runtime/installer/status')) {
                return {
                    ok: true,
                    json: async () => ({
                        configFile: '/tmp/sources.json',
                        comfyDirectory: {
                            path: 'D:\\ComfyUI',
                            exists: true,
                            gitRepo: true,
                        },
                        paths: {
                            customNodesPath: 'D:\\ComfyUI\\custom_nodes',
                            modelsPath: 'D:\\ComfyUI\\models',
                            workflowLibraryPaths: ['D:\\ComfyUI\\user\\default\\workflows'],
                            statuses: [
                                {
                                    label: 'Install Folder',
                                    path: 'D:\\ComfyUI',
                                    exists: true,
                                    note: 'Expected ComfyUI root folder.',
                                },
                                {
                                    label: 'Custom Nodes Folder',
                                    path: 'D:\\ComfyUI\\custom_nodes',
                                    exists: true,
                                    note: 'Expected standard custom_nodes folder under the install root.',
                                },
                                {
                                    label: 'Models Folder',
                                    path: 'D:\\ComfyUI\\models',
                                    exists: true,
                                    note: 'Expected standard models folder under the install root.',
                                },
                                {
                                    label: 'Workflow Folder',
                                    path: 'D:\\ComfyUI\\user\\default\\workflows',
                                    exists: true,
                                    note: 'Expected standard workflow folder under user/default/workflows.',
                                },
                            ],
                        },
                        customBundles: [
                            {
                                name: 'image-express-custom-nodes',
                                bundleType: 'custom-node',
                                targetPath: 'custom_nodes/image-express-custom-nodes',
                                exists: false,
                            },
                        ],
                        comfyModels: [],
                        localWorkspace: {
                            path: 'D:\\Adobe-Express-Remake\\ComfyUI workflows',
                            exists: true,
                            installTargetPath: 'D:\\ComfyUI',
                            workflowFileCount: 1,
                            syncedDirectories: ['custom_nodes', 'user', 'models'],
                        },
                        ollama: {
                            cliAvailable: true,
                            configuredModels: [],
                        },
                        summary: {
                            ready: false,
                            missing: ['Bundle missing: image-express-custom-nodes'],
                        },
                    }),
                } as Response;
            }
            if (url === '/api/runtime/dependencies/status') {
                return {
                    ok: true,
                    json: async () => ({
                        enabled: true,
                        checkedAt: '2026-05-17T18:00:00.000Z',
                        projectName: 'creative-flow',
                        projectVersion: '0.1.0',
                        packageManager: 'npm',
                        packageLockPresent: true,
                        outdated: [
                            {
                                name: 'next',
                                section: 'dependencies',
                                range: '16.1.4',
                                current: '16.1.4',
                                wanted: '16.1.4',
                                latest: '16.2.6',
                                target: '16.2.6',
                            },
                            {
                                name: 'react',
                                section: 'dependencies',
                                range: '19.2.3',
                                current: '19.2.3',
                                wanted: '19.2.3',
                                latest: '19.2.6',
                                target: '19.2.6',
                            },
                        ],
                        summary: {
                            outdatedCount: 2,
                            dependencyCount: 20,
                            devDependencyCount: 15,
                        },
                    }),
                } as Response;
            }
            if (url === '/api/runtime/dependencies/run' && init?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        startedAt: '2026-05-17T18:00:00.000Z',
                        finishedAt: '2026-05-17T18:03:00.000Z',
                        durationMs: 180000,
                        strategy: 'latest',
                        runBuild: true,
                        updatedPackages: [
                            {
                                name: 'next',
                                section: 'dependencies',
                                range: '16.1.4',
                                current: '16.1.4',
                                wanted: '16.1.4',
                                latest: '16.2.6',
                                target: '16.2.6',
                            },
                        ],
                        steps: [
                            {
                                id: 'build',
                                label: 'Build application',
                                command: 'npm.cmd',
                                args: ['run', 'build'],
                                exitCode: 0,
                                success: true,
                                durationMs: 90000,
                                stdout: 'build ok',
                                stderr: '',
                            },
                        ],
                        summary: {
                            outdatedCount: 2,
                            updatedCount: 1,
                            failedSteps: 0,
                        },
                    }),
                } as Response;
            }
            if (url === '/api/runtime/installer/run' && init?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        startedAt: '2026-04-03T10:00:00.000Z',
                        finishedAt: '2026-04-03T10:00:01.000Z',
                        durationMs: 1000,
                        continueOnError: false,
                        dryRun: true,
                        steps: [
                            {
                                id: 'install-comfy',
                                label: 'ComfyUI install/update',
                                command: 'node',
                                args: ['scripts/installers/comfy/install-comfy.mjs'],
                                exitCode: 0,
                                success: true,
                                durationMs: 120,
                                stdout: 'ok',
                                stderr: '',
                            },
                        ],
                        summary: {
                            completedSteps: 1,
                            failedSteps: 0,
                        },
                    }),
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
                const body = typeof init.body === 'string' ? init.body : '';
                if (body.includes('inspect-config')) {
                    return {
                        ok: true,
                        json: async () => ({
                            success: true,
                            diagnostics: {
                                generatedAt: '2026-05-17T18:00:00.000Z',
                                connection: {
                                    serverUrl: 'http://127.0.0.1:8188',
                                    transportKind: 'local',
                                    apiBasePath: '',
                                    historyPathBase: '/history',
                                },
                                paths: {
                                    modelsPath: 'D:\\ComfyUI\\models',
                                    statuses: [
                                        {
                                            label: 'Install Path',
                                            path: 'D:\\ComfyUI',
                                            exists: true,
                                            readable: true,
                                            note: 'Configured ComfyUI install root used for repo updates.',
                                        },
                                        {
                                            label: 'Custom Nodes Path',
                                            path: 'D:\\ComfyUI\\custom_nodes',
                                            exists: true,
                                            readable: true,
                                            note: 'Folder scanned for installed custom node repositories.',
                                        },
                                        {
                                            label: 'Workflow Folder',
                                            path: 'D:\\ComfyUI\\user\\default\\workflows',
                                            exists: true,
                                            readable: true,
                                            note: 'Folder scanned for official or custom workflow JSON files.',
                                        },
                                        {
                                            label: 'Models Path',
                                            path: 'D:\\ComfyUI\\models',
                                            exists: true,
                                            readable: true,
                                            note: 'Expected root for checkpoints, LoRAs, VAEs, ControlNets, and other model assets.',
                                        },
                                    ],
                                },
                                runtime: {
                                    features: { supports_preview_metadata: true },
                                    systemStats: { system: { os: 'win32' } },
                                    nodeTypes: ['KSampler'],
                                },
                                assets: [],
                                library: {
                                    installPath: 'D:\\ComfyUI',
                                    customNodesPath: 'D:\\ComfyUI\\custom_nodes',
                                    workflowLibraryPath: 'D:\\ComfyUI\\user\\default\\workflows',
                                    workflowLibraryPaths: ['D:\\ComfyUI\\user\\default\\workflows'],
                                    localWorkspace: {
                                        path: 'D:\\Adobe-Express-Remake\\ComfyUI workflows',
                                        exists: true,
                                        workflowFileCount: 1,
                                        syncedDirectories: ['custom_nodes', 'user', 'models'],
                                        syncedIntoInstall: true,
                                    },
                                    serverTemplates: [],
                                    customFolderWorkflows: [],
                                    nodeRepos: [],
                                    warnings: [],
                                },
                            },
                        }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        message: 'Comfy library refreshed.',
                        snapshot: {
                            installPath: 'D:\\ComfyUI',
                            customNodesPath: 'D:\\ComfyUI\\custom_nodes',
                            workflowLibraryPath: 'D:\\ComfyUI\\user\\default\\workflows',
                            localWorkspace: {
                                path: 'D:\\Adobe-Express-Remake\\ComfyUI workflows',
                                exists: true,
                                workflowFileCount: 1,
                                syncedDirectories: ['custom_nodes', 'user', 'models'],
                                syncedIntoInstall: true,
                            },
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
        await waitFor(() => {
            expect(screen.getByDisplayValue('D:\\ComfyUI')).toBeInTheDocument();
            expect(screen.getByDisplayValue('D:\\ComfyUI\\custom_nodes')).toBeInTheDocument();
            expect(screen.getByDisplayValue('D:\\ComfyUI\\user\\default\\workflows')).toBeInTheDocument();
            expect(screen.getByText('Detected standard Comfy layout')).toBeInTheDocument();
        });
        expect(screen.getByText('Expected install layout verification')).toBeInTheDocument();
        expect(screen.getAllByText('Found').length).toBeGreaterThan(0);
        expect(screen.getByText('ComfyUI Installer')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText('1 missing')).toBeInTheDocument();
        });

        await openTab(/AI Services/i);
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

        await openTab(/Workspace/i);
        fireEvent.change(screen.getByLabelText('Theme mode'), {
            target: { value: 'light' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Accent palette Meadow' }));

        await openTab(/Storage & Cloud/i);
        fireEvent.change(screen.getByDisplayValue('Hybrid (local + optional cloud per upload)'), {
            target: { value: 'cloud' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Save Configurations/i }));

        await waitFor(() => {
            expect(window.localStorage.getItem('meshy_api_key')).toBe('new-meshy');
        });
        expect(window.localStorage.getItem('image-express-theme-preferences')).toContain('light');
        expect(window.localStorage.getItem('image-express-theme-preferences')).toContain('meadow');
        expect(document.documentElement.dataset.themeMode).toBe('light');
        expect(document.documentElement.dataset.themeAccent).toBe('meadow');
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

    it('falls back to local storage when account key sync returns a non-ok response', async () => {
        window.localStorage.setItem('meshy_api_key', 'local-meshy');

        (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.startsWith('/api/user/keys?')) {
                return {
                    ok: false,
                    status: 500,
                    json: async () => ({ message: 'Error retrieving keys' }),
                    text: async () => 'Error retrieving keys',
                } as Response;
            }
            if (url.startsWith('/api/runtime/installer/status')) {
                return {
                    ok: true,
                    json: async () => ({
                        configFile: '/tmp/sources.json',
                        comfyDirectory: {
                            path: '/tmp/ComfyUI',
                            exists: true,
                            gitRepo: true,
                        },
                        customBundles: [],
                        comfyModels: [],
                        localWorkspace: {
                            path: '/tmp/ComfyUI workflows',
                            exists: true,
                            installTargetPath: '/tmp/ComfyUI',
                            workflowFileCount: 1,
                            syncedDirectories: ['custom_nodes', 'user', 'models'],
                        },
                        ollama: {
                            cliAvailable: true,
                            configuredModels: [],
                        },
                        summary: {
                            ready: true,
                            missing: [],
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

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        render(
            <SettingsModal
                isOpen={true}
                onClose={jest.fn()}
                userId="owner@example.com"
                userRoles={['creator']}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Local Storage Only')).toBeInTheDocument();
        });

        await openTab(/AI Services/i);
        expect(screen.getByDisplayValue('local-meshy')).toBeInTheDocument();
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
    });

    it('runs installer workflow from runtime readiness panel', async () => {
        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Dry Run Installer/i })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Dry Run Installer/i }));

        await waitFor(() => {
            const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/runtime/installer/run',
                expect.objectContaining({
                    method: 'POST',
                }),
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('settings-installer-run-message')).toBeInTheDocument();
        });
    });

    it('saves a planned cloud provider selection without forcing broken cloud-only mode', async () => {
        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        await openTab(/Storage & Cloud/i);
        await waitFor(() => {
            expect(screen.getByText('Asset Storage Strategy')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByDisplayValue('Google Drive'), {
            target: { value: 'dropbox' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Save Configurations/i }));

        await waitFor(() => {
            expect(mockSaveAssetStorageSettings).toHaveBeenCalledWith(expect.objectContaining({
                cloudProvider: 'dropbox',
            }));
        });

        expect(screen.getAllByText(/Dropbox/i).length).toBeGreaterThan(0);
    });

    it('installs a missing Ollama model from Settings after a failed check', async () => {
        let statusCalls = 0;
        (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.startsWith('/api/user/keys?')) {
                return {
                    ok: true,
                    json: async () => ({ keys: {} }),
                } as Response;
            }
            if (url.startsWith('/api/user/admin/users?')) {
                return {
                    ok: true,
                    json: async () => ({ success: true, users: [] }),
                } as Response;
            }
            if (url === '/api/logs/login') {
                return {
                    ok: true,
                    text: async () => 'login-entry-1',
                } as Response;
            }
            if (url.startsWith('/api/runtime/installer/status')) {
                return {
                    ok: true,
                    json: async () => ({
                        configFile: '/tmp/sources.json',
                        comfyDirectory: {
                            path: 'D:\\ComfyUI',
                            exists: true,
                            gitRepo: true,
                        },
                        paths: {
                            customNodesPath: 'D:\\ComfyUI\\custom_nodes',
                            modelsPath: 'D:\\ComfyUI\\models',
                            workflowLibraryPaths: ['D:\\ComfyUI\\user\\default\\workflows'],
                            statuses: [
                                {
                                    label: 'Install Folder',
                                    path: 'D:\\ComfyUI',
                                    exists: true,
                                },
                                {
                                    label: 'Custom Nodes Folder',
                                    path: 'D:\\ComfyUI\\custom_nodes',
                                    exists: true,
                                },
                                {
                                    label: 'Models Folder',
                                    path: 'D:\\ComfyUI\\models',
                                    exists: true,
                                },
                                {
                                    label: 'Workflow Folder',
                                    path: 'D:\\ComfyUI\\user\\default\\workflows',
                                    exists: true,
                                },
                            ],
                        },
                        customBundles: [],
                        comfyModels: [],
                        localWorkspace: {
                            path: 'D:\\Adobe-Express-Remake\\ComfyUI workflows',
                            exists: true,
                            installTargetPath: 'D:\\ComfyUI',
                            workflowFileCount: 0,
                            syncedDirectories: ['custom_nodes', 'user', 'models'],
                        },
                        ollama: {
                            cliAvailable: true,
                            configuredModels: [],
                        },
                        summary: {
                            ready: true,
                            missing: [],
                        },
                    }),
                } as Response;
            }
            if (url === '/api/runtime/installer/run' && init?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        startedAt: '2026-04-03T10:00:00.000Z',
                        finishedAt: '2026-04-03T10:00:01.000Z',
                        durationMs: 1000,
                        continueOnError: false,
                        dryRun: false,
                        steps: [],
                        summary: {
                            completedSteps: 0,
                            failedSteps: 0,
                        },
                    }),
                } as Response;
            }
            if (url.startsWith('/api/ai/ollama/status?')) {
                statusCalls += 1;
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        requestedModel: 'qwen2.5:7b',
                        modelFound: statusCalls > 1,
                        count: statusCalls > 1 ? 2 : 1,
                        models: statusCalls > 1 ? ['qwen2.5-coder:7b', 'qwen2.5:7b'] : ['qwen2.5-coder:7b'],
                    }),
                } as Response;
            }
            if (url === '/api/ai/ollama/install' && init?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        message: 'Installed "qwen2.5:7b" in Ollama at http://localhost:11434.',
                        model: 'qwen2.5:7b',
                        baseUrl: 'http://localhost:11434',
                    }),
                } as Response;
            }
            if (url === '/api/ai/comfy/library' && init?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({ success: true, message: 'Comfy library refreshed.', snapshot: null }),
                } as Response;
            }
            return {
                ok: true,
                json: async () => ({}),
                text: async () => '',
            } as Response;
        });

        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        await openTab(/AI Services/i);
        fireEvent.click(screen.getByRole('button', { name: /Check Ollama/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Install qwen2.5:7b' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Install qwen2.5:7b' }));

        await waitFor(() => {
            expect((global as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalledWith(
                '/api/ai/ollama/install',
                expect.objectContaining({ method: 'POST' })
            );
        });
        await waitFor(() => {
            expect(screen.getByText(/Ollama is reachable/i)).toBeInTheDocument();
        });
    });

    it('handles drive connect flow and launches setup wizard', async () => {
        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        await openTab(/Storage & Cloud/i);
        fireEvent.click(screen.getByRole('button', { name: /^Connect$/i }));
        expect(screen.getByText('Add a Google OAuth client ID before connecting.')).toBeInTheDocument();

        const clientIdInput = screen.getByPlaceholderText('1234567890-abcdef.apps.googleusercontent.com');
        fireEvent.change(clientIdInput, { target: { value: 'client-1' } });
        expect(mockUpdateDriveConfig).toHaveBeenCalledWith({ clientId: 'client-1' });

        fireEvent.click(screen.getByRole('button', { name: /^Connect$/i }));
        await waitFor(() => {
            expect(mockConnectGoogleDrive).toHaveBeenCalledWith('client-1');
        });

        await openTab(/Workspace/i);
        fireEvent.click(screen.getByRole('button', { name: /Open Setup Wizard/i }));
        expect(mockRequestOpenSetupWizard).toHaveBeenCalledTimes(1);
    });

    it('shows dependency maintenance in workspace settings and triggers update plus build', async () => {
        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        await openTab(/Workspace/i);

        await waitFor(() => {
            expect(screen.getByText('Project Dependencies')).toBeInTheDocument();
            expect(screen.getByText('next')).toBeInTheDocument();
            expect(screen.getByText('react')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Update All To Latest \+ Build/i }));

        await waitFor(() => {
            const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/runtime/dependencies/run',
                expect.objectContaining({
                    method: 'POST',
                }),
            );
        });

        await waitFor(() => {
            expect(screen.getByText(/Dependency update completed/i)).toBeInTheDocument();
        });
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
        const installRepoButton = screen.getByRole('button', { name: /Install Repo/i });
        await waitFor(() => {
            expect(installRepoButton).toBeEnabled();
        });
        fireEvent.click(installRepoButton);

        await waitFor(() => {
            const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
            expect(fetchMock.mock.calls.some(([url, init]) => (
                String(url) === '/api/ai/comfy/library'
                && init?.method === 'POST'
                && typeof init.body === 'string'
                && init.body.includes('https://github.com/example/custom-upscaler')
            ))).toBe(true);
        });
    });

    it('verifies the expected Comfy install layout for the submitted install path', async () => {
        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        const installPathInput = await screen.findByDisplayValue('D:\\ComfyUI');

        fireEvent.change(installPathInput, {
            target: { value: 'O:\\' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Verify Path/i }));

        await waitFor(() => {
            const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/runtime/installer/status?comfyDir=O%3A%5C',
                expect.objectContaining({
                    cache: 'no-store',
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByText('Expected install layout verification')).toBeInTheDocument();
            expect(screen.getAllByText('Install Folder').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Custom Nodes Folder').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Models Folder').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Workflow Folder').length).toBeGreaterThan(0);
        });
    });

    it('verifies the local ComfyUI runtime together with the app-specific Comfy paths', async () => {
        render(<SettingsModal isOpen={true} onClose={jest.fn()} userId="Guest" />);

        fireEvent.click(screen.getByRole('button', { name: /Verify Local ComfyUI \+ Paths/i }));

        await waitFor(() => {
            expect(mockInspectComfyServerCatalog).toHaveBeenCalledWith(expect.objectContaining({
                connection: expect.objectContaining({
                    mode: 'local',
                    localUrl: 'http://localhost:8188',
                }),
            }));
        });

        await waitFor(() => {
            const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
            expect(fetchMock.mock.calls.some(([url, init]) => (
                String(url) === '/api/ai/comfy/library'
                && init?.method === 'POST'
                && typeof init.body === 'string'
                && init.body.includes('inspect-config')
                && init.body.includes('"connectionMode":"local"')
            ))).toBe(true);
        });

        await waitFor(() => {
            expect(screen.getByText(/configured folders match the app expectations/i)).toBeInTheDocument();
            expect(screen.getByText('App-specific Comfy path verification')).toBeInTheDocument();
            expect(screen.getByText('Install Path')).toBeInTheDocument();
            expect(screen.getByText('Custom Nodes Path')).toBeInTheDocument();
            expect(screen.getByText('Models Path')).toBeInTheDocument();
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
                    workflowName: 'Z Image Turbo / FLUX 2 Klein Image Edit (4B Template)',
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

        await openTab(/Storage & Cloud/i);
        await waitFor(() => {
            expect(screen.getByText('Desktop Updates')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Check Now/i }));
        await waitFor(() => {
            expect(desktopApi.checkForUpdates).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Restart & Install Update/i }));
        await waitFor(() => {
            expect(desktopApi.installUpdate).toHaveBeenCalled();
        });

        await openTab(/Admin/i);
        await waitFor(() => {
            expect(screen.getByText('User Management')).toBeInTheDocument();
            expect(screen.getByText('member@example.com')).toBeInTheDocument();
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

        await openTab(/Workspace/i);
        fireEvent.click(screen.getByRole('button', { name: /View Login Activity Log/i }));
        await waitFor(() => {
            expect(screen.getByText('login-entry-1')).toBeInTheDocument();
        });

        await openTab(/Storage & Cloud/i);
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
