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
    loadAssetStorageSettings: (...args: unknown[]) => mockLoadAssetStorageSettings(...args),
    saveAssetStorageSettings: (...args: unknown[]) => mockSaveAssetStorageSettings(...args),
}));

describe('SetupWizardModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
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
        expect(screen.queryByText('First-Time Setup Wizard')).toBeNull();
    });

    it('renders wizard content and closes from header button', () => {
        const onClose = jest.fn();
        render(<SetupWizardModal isOpen={true} onClose={onClose} onComplete={jest.fn()} />);

        expect(screen.getByText('First-Time Setup Wizard')).toBeInTheDocument();
        expect(mockUseEscapeKey).toHaveBeenCalled();

        fireEvent.click(screen.getByTitle('Close setup wizard'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('persists settings, validates drive client id, and finishes setup', async () => {
        const onComplete = jest.fn();
        render(<SetupWizardModal isOpen={true} onClose={jest.fn()} onComplete={onComplete} />);

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
        fireEvent.click(screen.getByRole('button', { name: /Next/i })); // api -> finish
        fireEvent.click(screen.getByRole('button', { name: /Finish Setup/i }));

        expect(window.localStorage.getItem('openai_api_key')).toBe('sk-openai');
        expect(onComplete).toHaveBeenCalledTimes(1);
    });
});
