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
        fireEvent.change(screen.getByDisplayValue('Hybrid (local + optional cloud per upload)'), {
            target: { value: 'cloud' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Save Configurations/i }));

        await waitFor(() => {
            expect(window.localStorage.getItem('meshy_api_key')).toBe('new-meshy');
        });
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
