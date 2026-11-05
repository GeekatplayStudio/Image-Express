import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AssetLibrary from '@/components/AssetLibrary';

const mockBuildSessionAuthorizationHeader = jest.fn();
const mockUseEscapeKey = jest.fn();
const mockDialogConfirm = jest.fn();
const mockToast = jest.fn();

const mockDeleteDriveAsset = jest.fn();
const mockDownloadDriveAssetBlob = jest.fn();
const mockListDriveAssets = jest.fn();
const mockLoadDriveConfig = jest.fn();
const mockRenameDriveAsset = jest.fn();
const mockSetDriveAssetVisibility = jest.fn();
const mockUploadDriveAsset = jest.fn();

const mockDeleteLocalAsset = jest.fn();
const mockGetLocalAssetBlob = jest.fn();
const mockListLocalAssets = jest.fn();
const mockRenameLocalAsset = jest.fn();
const mockSaveLocalAsset = jest.fn();
const mockSetLocalAssetVisibility = jest.fn();

const mockLoadAssetStorageSettings = jest.fn();
const mockOnAssetStorageSettingsChanged = jest.fn();

jest.mock('@/hooks/useEscapeKey', () => ({ __esModule: true, default: (...args: unknown[]) => mockUseEscapeKey(...args) }));

jest.mock('@/lib/authSession', () => ({
    buildSessionAuthorizationHeader: (...args: unknown[]) => mockBuildSessionAuthorizationHeader(...args),
}));

jest.mock('@/providers/DialogProvider', () => ({
    useDialog: () => ({ confirm: (...args: unknown[]) => mockDialogConfirm(...args) }),
}));

jest.mock('@/providers/ToastProvider', () => ({
    useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

jest.mock('@/lib/googleDrive', () => ({
    deleteDriveAsset: (...args: unknown[]) => mockDeleteDriveAsset(...args),
    downloadDriveAssetBlob: (...args: unknown[]) => mockDownloadDriveAssetBlob(...args),
    listDriveAssets: (...args: unknown[]) => mockListDriveAssets(...args),
    loadDriveConfig: (...args: unknown[]) => mockLoadDriveConfig(...args),
    renameDriveAsset: (...args: unknown[]) => mockRenameDriveAsset(...args),
    setDriveAssetVisibility: (...args: unknown[]) => mockSetDriveAssetVisibility(...args),
    uploadDriveAsset: (...args: unknown[]) => mockUploadDriveAsset(...args),
}));

jest.mock('@/lib/localAssetStore', () => ({
    deleteLocalAsset: (...args: unknown[]) => mockDeleteLocalAsset(...args),
    getLocalAssetBlob: (...args: unknown[]) => mockGetLocalAssetBlob(...args),
    listLocalAssets: (...args: unknown[]) => mockListLocalAssets(...args),
    renameLocalAsset: (...args: unknown[]) => mockRenameLocalAsset(...args),
    saveLocalAsset: (...args: unknown[]) => mockSaveLocalAsset(...args),
    setLocalAssetVisibility: (...args: unknown[]) => mockSetLocalAssetVisibility(...args),
}));

jest.mock('@/lib/assetStorageSettings', () => ({
    getAssetCloudProviderLabel: (provider: string) => ({
        'google-drive': 'Google Drive',
        dropbox: 'Dropbox',
        onedrive: 'OneDrive',
        's3-compatible': 'S3-compatible',
    }[provider] || 'Cloud'),
    isImplementedAssetCloudProvider: (provider: string) => provider === 'google-drive',
    loadAssetStorageSettings: (...args: unknown[]) => mockLoadAssetStorageSettings(...args),
    onAssetStorageSettingsChanged: (...args: unknown[]) => mockOnAssetStorageSettingsChanged(...args),
}));

jest.mock('../Asset3DPreview', () => ({
    __esModule: true,
    default: ({ url }: { url: string }) => <div data-testid="asset-3d-preview">{url}</div>,
}));

jest.mock('@/components/ui/DraggableResizablePanel', () => ({
    __esModule: true,
    default: ({ children, zIndex }: { children: React.ReactNode; zIndex?: number }) => (
        <div data-testid="asset-library-panel" data-z={zIndex}>{children}</div>
    ),
}));

jest.mock('@/lib/modelThumbnail', () => ({ renderModelThumbnail: jest.fn().mockResolvedValue(null) }));

function makeJsonResponse(payload: unknown, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 500,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
        blob: async () => new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    } as unknown as Response;
}

/**
 * The large single-click preview of an asset. It had no test; this pins it
 * before and after its move onto ModalShell.
 */
describe('AssetLibrary asset preview', () => {
    let fetchMock: jest.Mock;
    // Restored after every test: verify runs Jest in-band, so a stub left on
    // global.fetch would starve every later suite that awaits a response.
    const originalFetch = global.fetch;
    afterEach(() => { (global as unknown as { fetch: typeof fetch }).fetch = originalFetch; });

    beforeEach(() => {
        jest.clearAllMocks();
        mockLoadAssetStorageSettings.mockReturnValue({ mode: 'hybrid', cloudProvider: 'google-drive', hybridUploadToCloudByDefault: false, includeLegacyServerAssetsInHybrid: true });
        mockOnAssetStorageSettingsChanged.mockReturnValue(() => undefined);
        mockLoadDriveConfig.mockReturnValue({ enabled: true, clientId: 'drive-client' });
        mockListLocalAssets.mockResolvedValue([]);
        mockListDriveAssets.mockResolvedValue([]);
        mockBuildSessionAuthorizationHeader.mockReturnValue('Bearer t');
        fetchMock = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input).startsWith('/api/assets/list?')) {
                return makeJsonResponse({ success: true, files: [{ path: '/server-assets/hero.png', name: 'hero.png', type: 'images', category: 'uploads', owner: 'alice@example.com', isPublic: false }] });
            }
            return makeJsonResponse({});
        });
        (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    });

    const open = async () => {
        const onSelect = jest.fn();
        const onClose = jest.fn();
        render(<AssetLibrary onSelect={onSelect} onClose={onClose} currentUser="alice@example.com" />);
        const name = await screen.findByText('hero.png');
        fireEvent.click(name);
        const dialog = await screen.findByRole('dialog', { name: 'hero.png' });
        return { onSelect, onClose, dialog };
    };

    it('opens on a single click, shows the image, and adds it to the canvas', async () => {
        const { onSelect, dialog } = await open();
        expect(within(dialog).getByRole('img', { name: 'hero.png' })).toHaveAttribute('src', '/server-assets/hero.png');
        fireEvent.click(within(dialog).getByRole('button', { name: /Add to Canvas/ }));
        await waitFor(() => expect(onSelect).toHaveBeenCalledWith('/server-assets/hero.png', 'images', 'hero.png'));
        expect(screen.queryByRole('button', { name: 'Close preview' })).toBeNull();
    });

    it('closes from Cancel, from the close button, and from Escape without closing the library', async () => {
        const { onClose, dialog } = await open();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('button', { name: 'Close preview' })).toBeNull();

        fireEvent.click(await screen.findByText('hero.png'));
        fireEvent.click(await screen.findByRole('button', { name: 'Close preview' }));
        expect(screen.queryByRole('button', { name: 'Close preview' })).toBeNull();

        fireEvent.click(await screen.findByText('hero.png'));
        await screen.findByRole('button', { name: 'Close preview' });
        fireEvent.keyDown(window, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Close preview' })).toBeNull());
        expect(onClose).not.toHaveBeenCalled();
    });
});
