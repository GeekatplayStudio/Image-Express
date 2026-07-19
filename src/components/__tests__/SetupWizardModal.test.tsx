import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SetupWizardModal from '@/components/SetupWizardModal';

const mockUseEscapeKey = jest.fn();
const mockConnectGoogleDrive = jest.fn();
const mockLoadDriveConfig = jest.fn();
const mockUpdateDriveConfig = jest.fn();
const mockLoadAssetStorageSettings = jest.fn();
const mockSaveAssetStorageSettings = jest.fn();

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseEscapeKey(...args),
}));

jest.mock('@/lib/googleDrive', () => ({
    connectGoogleDrive: (...args: unknown[]) => mockConnectGoogleDrive(...args),
    loadDriveConfig: (...args: unknown[]) => mockLoadDriveConfig(...args),
    updateDriveConfig: (...args: unknown[]) => mockUpdateDriveConfig(...args),
}));

jest.mock('@/lib/assetStorageSettings', () => ({
    ASSET_CLOUD_PROVIDER_OPTIONS: [
        { id: 'google-drive', label: 'Google Drive', availability: 'available', descriptionKey: 'storage.provider.googleDrive.desc' },
        { id: 'dropbox', label: 'Dropbox', availability: 'planned', descriptionKey: 'storage.provider.dropbox.desc' },
        { id: 'onedrive', label: 'OneDrive', availability: 'planned', descriptionKey: 'storage.provider.onedrive.desc' },
        { id: 's3-compatible', label: 'S3-compatible', availability: 'planned', descriptionKey: 'storage.provider.s3.desc' },
    ],
    getAssetCloudProviderLabel: (provider: string) => ({
        'google-drive': 'Google Drive',
        dropbox: 'Dropbox',
        onedrive: 'OneDrive',
        's3-compatible': 'S3-compatible',
    }[provider] || 'Cloud'),
    isImplementedAssetCloudProvider: (provider: string) => provider === 'google-drive',
    loadAssetStorageSettings: (...args: unknown[]) => mockLoadAssetStorageSettings(...args),
    saveAssetStorageSettings: (...args: unknown[]) => mockSaveAssetStorageSettings(...args),
}));

describe('SetupWizardModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
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
        }));
        mockLoadDriveConfig.mockReturnValue({ enabled: false, clientId: '' });
        mockLoadAssetStorageSettings.mockReturnValue({
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: true,
        });
        mockConnectGoogleDrive.mockResolvedValue({ enabled: true });
        mockUpdateDriveConfig.mockReturnValue({ enabled: true, clientId: 'client-1' });
    });

    it('does not render when closed', () => {
        render(<SetupWizardModal isOpen={false} onClose={jest.fn()} onComplete={jest.fn()} />);
        expect(screen.queryByText('Setup Wizard')).toBeNull();
    });

    it('renders wizard content and closes from header button', () => {
        const onClose = jest.fn();
        render(<SetupWizardModal isOpen={true} onClose={onClose} onComplete={jest.fn()} />);

        expect(screen.getByText('Setup Wizard')).toBeInTheDocument();
        expect(global.fetch).not.toHaveBeenCalled();

        fireEvent.keyDown(window, { key: 'Escape' });
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('uses viewport-bounded shell and scrollable content layout', () => {
        render(<SetupWizardModal isOpen={true} onClose={jest.fn()} onComplete={jest.fn()} />);

        const shell = screen.getByTestId('setup-wizard-modal-shell');
        const content = screen.getByTestId('setup-wizard-modal-content');

        expect(shell.className).toContain('flex');
        expect(shell.className).toContain('flex-col');
        expect(content.className).toContain('overflow-y-auto');
        expect(content.className).toContain('flex-1');
    });

    it('persists settings, validates drive client id, and finishes setup', async () => {
        const onComplete = jest.fn();
        render(<SetupWizardModal isOpen={true} onClose={jest.fn()} onComplete={onComplete} />);

        expect(global.fetch).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Next/i })); // welcome -> storage
        fireEvent.click(screen.getByRole('button', { name: /Cloud only/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next/i })); // storage -> drive

        await waitFor(() => {
            expect(mockSaveAssetStorageSettings).toHaveBeenCalledWith({
                mode: 'cloud',
                cloudProvider: 'google-drive',
                hybridUploadToCloudByDefault: false,
                includeLegacyServerAssetsInHybrid: true,
            });
        });

        fireEvent.click(screen.getByRole('button', { name: /Connect Google Drive/i }));
        expect(screen.getByText('Add a Google OAuth Client ID first.')).toBeInTheDocument();

        const clientIdInput = screen.getByPlaceholderText('1234567890-abcdef.apps.googleusercontent.com');
        fireEvent.change(clientIdInput, { target: { value: 'client-1' } });
        fireEvent.click(screen.getByRole('button', { name: /Connect Google Drive/i }));

        await waitFor(() => {
            expect(mockConnectGoogleDrive).toHaveBeenCalledWith('client-1');
        });
        expect(mockUpdateDriveConfig).toHaveBeenCalledWith({ clientId: 'client-1' });

        fireEvent.click(screen.getByRole('button', { name: /Next/i })); // drive -> api

        fireEvent.change(screen.getAllByPlaceholderText('sk-...')[1], {
            target: { value: 'sk-openai' },
        });
        expect(global.fetch).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Next/i })); // api -> runtime

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(screen.getByText('Runtime ready')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: /Next/i })); // runtime -> finish
        fireEvent.click(screen.getByRole('button', { name: /Finish Setup/i }));

        expect(window.localStorage.getItem('openai_api_key')).toBe('sk-openai');
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('persists a planned provider selection in hybrid mode', async () => {
        render(<SetupWizardModal isOpen={true} onClose={jest.fn()} onComplete={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Next/i }));

        fireEvent.change(screen.getByDisplayValue('Google Drive'), {
            target: { value: 'dropbox' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Next/i }));

        await waitFor(() => {
            expect(mockSaveAssetStorageSettings).toHaveBeenCalledWith(expect.objectContaining({
                mode: 'hybrid',
                cloudProvider: 'dropbox',
            }));
        });

        expect(screen.getByText(/Dropbox is selected as your future cloud provider/i)).toBeInTheDocument();
    });
});
