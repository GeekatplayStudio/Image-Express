import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AssetLibrary from '../AssetLibrary';
import type { AssetDescriptor } from '@/types';
import type { AssetStorageSettings } from '@/lib/assetStorageSettings';
import type { DriveAssetRecord } from '@/lib/googleDrive';
import type { LocalAssetRecord } from '@/lib/localAssetStore';

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

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseEscapeKey(...args),
}));

jest.mock('@/providers/DialogProvider', () => ({
    useDialog: () => ({
        confirm: (...args: unknown[]) => mockDialogConfirm(...args),
    }),
}));

jest.mock('@/providers/ToastProvider', () => ({
    useToast: () => ({
        toast: (...args: unknown[]) => mockToast(...args),
    }),
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
    loadAssetStorageSettings: (...args: unknown[]) => mockLoadAssetStorageSettings(...args),
    onAssetStorageSettingsChanged: (...args: unknown[]) => mockOnAssetStorageSettingsChanged(...args),
}));

jest.mock('../Asset3DPreview', () => ({
    __esModule: true,
    default: ({ url }: { url: string }) => <div data-testid="asset-3d-preview">{url}</div>,
}));

jest.mock('@/components/ui/DraggableResizablePanel', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="asset-library-panel">{children}</div>,
}));

function makeJsonResponse(payload: unknown, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 500,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
        blob: async () => new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    } as unknown as Response;
}

function makeBlobResponse(blob: Blob, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 500,
        json: async () => ({}),
        text: async () => '',
        blob: async () => blob,
    } as unknown as Response;
}

function hasFetchCall(
    fetchMock: jest.Mock,
    predicate: (url: string, init?: RequestInit) => boolean
) {
    return fetchMock.mock.calls.some((call) => {
        const input = call[0] as RequestInfo | URL;
        const init = call[1] as RequestInit | undefined;
        return predicate(String(input), init);
    });
}

describe('AssetLibrary', () => {
    let storageSettings: AssetStorageSettings;
    let serverAssets: AssetDescriptor[];
    let settingsListener: (() => void) | null;
    let createObjectUrlCount = 0;
    let fetchMock: jest.Mock;
    let anchorClickSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        serverAssets = [];
        settingsListener = null;
        createObjectUrlCount = 0;

        storageSettings = {
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: true,
        };

        mockDialogConfirm.mockResolvedValue(true);
        mockLoadAssetStorageSettings.mockImplementation(() => storageSettings);
        mockOnAssetStorageSettingsChanged.mockImplementation((listener: () => void) => {
            settingsListener = listener;
            return () => {
                if (settingsListener === listener) {
                    settingsListener = null;
                }
            };
        });

        mockLoadDriveConfig.mockReturnValue({ enabled: true, clientId: 'drive-client' });
        mockListLocalAssets.mockResolvedValue([]);
        mockListDriveAssets.mockResolvedValue([]);
        mockSaveLocalAsset.mockResolvedValue(undefined);
        mockUploadDriveAsset.mockResolvedValue(undefined);
        mockRenameLocalAsset.mockResolvedValue(undefined);
        mockRenameDriveAsset.mockResolvedValue(undefined);
        mockSetLocalAssetVisibility.mockResolvedValue(undefined);
        mockSetDriveAssetVisibility.mockResolvedValue(undefined);
        mockDeleteLocalAsset.mockResolvedValue(undefined);
        mockDeleteDriveAsset.mockResolvedValue(undefined);
        mockGetLocalAssetBlob.mockResolvedValue(new Blob(['local-selection'], { type: 'image/png' }));
        mockDownloadDriveAssetBlob.mockResolvedValue(new Blob(['drive-selection'], { type: 'image/png' }));

        fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.startsWith('/api/assets/list?')) {
                return makeJsonResponse({ success: true, files: serverAssets });
            }
            if (url === '/api/assets/rename') {
                return makeJsonResponse({ success: true });
            }
            if (url === '/api/assets/delete') {
                return makeJsonResponse({ success: true });
            }
            if (url === '/api/assets/visibility') {
                return makeJsonResponse({ success: true });
            }
            if (url.startsWith('/server-assets/')) {
                return makeBlobResponse(new Blob(['server-asset'], { type: 'image/png' }));
            }
            if (init?.method === 'POST') {
                return makeJsonResponse({ success: true });
            }
            return makeJsonResponse({});
        });
        (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            writable: true,
            value: jest.fn(() => {
                createObjectUrlCount += 1;
                return `blob:asset-${createObjectUrlCount}`;
            }),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            writable: true,
            value: jest.fn(),
        });

        anchorClickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => {
        anchorClickSpy.mockRestore();
    });

    it('loads local, drive, and server assets and responds to scope/filter/settings changes', async () => {
        const localAsset: LocalAssetRecord = {
            id: 'local-image-1',
            name: 'local-image.png',
            type: 'images',
            category: 'uploads',
            owner: 'alice@example.com',
            isPublic: false,
            mimeType: 'image/png',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            data: new Blob(['local-image'], { type: 'image/png' }),
        };
        const driveAsset: DriveAssetRecord = {
            id: 'drive-image-1',
            name: 'drive-image.png',
            type: 'images',
            category: 'uploads',
            owner: 'alice@example.com',
            isPublic: true,
            mimeType: 'image/png',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
        };
        serverAssets = [
            {
                path: '/server-assets/server-image.png',
                name: 'server-image.png',
                type: 'images',
                category: 'uploads',
                owner: 'alice@example.com',
                isPublic: false,
            },
        ];
        mockListLocalAssets.mockResolvedValue([localAsset]);
        mockListDriveAssets.mockResolvedValue([driveAsset]);

        const onClose = jest.fn();
        render(
            <AssetLibrary
                onSelect={jest.fn()}
                onClose={onClose}
                currentUser="alice@example.com"
            />
        );

        await waitFor(() => {
            expect(screen.getByTitle('local-image.png')).toBeInTheDocument();
            expect(screen.getByTitle('drive-image.png')).toBeInTheDocument();
            expect(screen.getByTitle('server-image.png')).toBeInTheDocument();
        });

        expect(mockUseEscapeKey).toHaveBeenCalledWith(onClose);
        expect(mockListLocalAssets).toHaveBeenCalledWith(expect.objectContaining({
            owner: 'alice@example.com',
            scope: 'personal',
            includePublic: true,
            visibility: 'all',
            search: '',
        }));
        expect(mockListDriveAssets).toHaveBeenCalledWith('drive-client', expect.objectContaining({
            owner: 'alice@example.com',
            scope: 'personal',
            includePublic: true,
            visibility: 'all',
            search: '',
        }));
        expect(hasFetchCall(fetchMock, (url) => url.startsWith('/api/assets/list?'))).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Shared' }));
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'private' } });

        await waitFor(() => {
            expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('public');
        });

        storageSettings = {
            ...storageSettings,
            hybridUploadToCloudByDefault: true,
        };
        act(() => {
            settingsListener?.();
        });

        await waitFor(() => {
            const cloudUploadCheckbox = screen.getByLabelText('Also upload this file to Google Drive') as HTMLInputElement;
            expect(cloudUploadCheckbox.checked).toBe(true);
        });
    });

    it('warns and skips upload when cloud mode is enabled but Drive is disconnected', async () => {
        storageSettings = {
            mode: 'cloud',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: false,
        };
        mockLoadDriveConfig.mockReturnValue({ enabled: false, clientId: '' });

        render(
            <AssetLibrary
                onSelect={jest.fn()}
                onClose={jest.fn()}
                currentUser="alice@example.com"
            />
        );

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        const image = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [image] } });

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Google Drive required',
                variant: 'warning',
            }));
        });
        expect(mockSaveLocalAsset).not.toHaveBeenCalled();
        expect(mockUploadDriveAsset).not.toHaveBeenCalled();
    });

    it('uploads to local and drive in hybrid mode, then selects and downloads a local asset', async () => {
        storageSettings = {
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: true,
            includeLegacyServerAssetsInHybrid: false,
        };

        const localVideo: LocalAssetRecord = {
            id: 'local-video-1',
            name: 'clip.mp4',
            type: 'videos',
            category: 'uploads',
            owner: 'alice@example.com',
            isPublic: false,
            mimeType: 'video/mp4',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            data: new Blob(['local-video'], { type: 'video/mp4' }),
        };
        mockListLocalAssets.mockImplementation(async (params: { type: string }) => (
            params.type === 'videos' ? [localVideo] : []
        ));
        mockListDriveAssets.mockResolvedValue([]);

        const onSelect = jest.fn();
        const onClose = jest.fn();
        render(
            <AssetLibrary
                onSelect={onSelect}
                onClose={onClose}
                currentUser="alice@example.com"
            />
        );

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        const videoUpload = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' });
        fireEvent.change(fileInput, { target: { files: [videoUpload] } });

        await waitFor(() => {
            expect(mockSaveLocalAsset).toHaveBeenCalledWith(expect.objectContaining({
                filename: 'clip.mp4',
                type: 'videos',
                owner: 'alice@example.com',
            }));
        });
        expect(mockUploadDriveAsset).toHaveBeenCalledWith('drive-client', expect.objectContaining({
            filename: 'clip.mp4',
            type: 'videos',
            owner: 'alice@example.com',
        }));
        await waitFor(() => {
            expect(mockListLocalAssets).toHaveBeenCalledWith(expect.objectContaining({ type: 'videos' }));
        });

        await waitFor(() => {
            expect(screen.getByTitle('clip.mp4')).toBeInTheDocument();
        });

        const videoElement = document.querySelector('video');
        expect(videoElement).not.toBeNull();
        fireEvent.click(videoElement as HTMLElement);

        await waitFor(() => {
            expect(onSelect).toHaveBeenCalledWith(expect.stringMatching(/^blob:/), 'videos', 'clip.mp4');
        });
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTitle('Download Asset'));
        await waitFor(() => {
            expect(mockGetLocalAssetBlob).toHaveBeenCalledWith('local-video-1');
        });
        expect(anchorClickSpy).toHaveBeenCalled();
    });

    it('handles provider-specific rename/visibility/delete/download actions and read-only visibility guard', async () => {
        const localReadOnly: LocalAssetRecord = {
            id: 'local-read-only',
            name: 'shared-photo.png',
            type: 'images',
            category: 'uploads',
            owner: 'bob@example.com',
            isPublic: true,
            mimeType: 'image/png',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            data: new Blob(['shared-photo'], { type: 'image/png' }),
        };
        const driveAsset: DriveAssetRecord = {
            id: 'drive-1',
            name: 'drive-photo.png',
            type: 'images',
            category: 'uploads',
            owner: 'alice@example.com',
            isPublic: false,
            mimeType: 'image/png',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
        };
        serverAssets = [
            {
                path: '/server-assets/server-photo.png',
                name: 'server-photo.png',
                type: 'images',
                category: 'uploads',
                owner: 'alice@example.com',
                isPublic: false,
            },
        ];

        mockListLocalAssets.mockResolvedValue([localReadOnly]);
        mockListDriveAssets.mockResolvedValue([driveAsset]);

        render(
            <AssetLibrary
                onSelect={jest.fn()}
                onClose={jest.fn()}
                currentUser="alice@example.com"
            />
        );

        await waitFor(() => {
            expect(screen.getByTitle('shared-photo.png')).toBeInTheDocument();
            expect(screen.getByTitle('drive-photo.png')).toBeInTheDocument();
            expect(screen.getByTitle('server-photo.png')).toBeInTheDocument();
        });

        const readOnlyCard = screen.getByTitle('shared-photo.png');
        fireEvent.click(within(readOnlyCard).getByTitle('Set private'));

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Read only asset',
                variant: 'warning',
            }));
        });
        expect(mockSetLocalAssetVisibility).not.toHaveBeenCalled();

        const driveCard = screen.getByTitle('drive-photo.png');
        fireEvent.click(within(driveCard).getByTitle('Rename Asset'));
        const driveRenameInput = within(driveCard).getByDisplayValue('drive-photo.png');
        fireEvent.change(driveRenameInput, { target: { value: 'drive-renamed.png' } });
        fireEvent.keyDown(driveRenameInput, { key: 'Enter' });

        await waitFor(() => {
            expect(mockRenameDriveAsset).toHaveBeenCalledWith('drive-client', 'drive-1', 'drive-renamed.png');
        });
        await waitFor(() => {
            expect(within(screen.getByTitle('drive-photo.png')).queryByTitle('Save')).toBeNull();
        });

        fireEvent.click(within(screen.getByTitle('drive-photo.png')).getByTitle('Set public'));
        await waitFor(() => {
            expect(mockSetDriveAssetVisibility).toHaveBeenCalledWith('drive-client', 'drive-1', true);
        });

        fireEvent.click(within(screen.getByTitle('drive-photo.png')).getByTitle('Delete Asset'));
        await waitFor(() => {
            expect(mockDeleteDriveAsset).toHaveBeenCalledWith('drive-client', 'drive-1');
        });

        fireEvent.click(within(screen.getByTitle('drive-photo.png')).getByTitle('Download Asset'));
        await waitFor(() => {
            expect(mockDownloadDriveAssetBlob).toHaveBeenCalledWith('drive-client', 'drive-1');
        });

        const serverCard = screen.getByTitle('server-photo.png');
        fireEvent.click(within(serverCard).getByTitle('Rename Asset'));
        const serverRenameInput = within(serverCard).getByDisplayValue('server-photo.png');
        fireEvent.change(serverRenameInput, { target: { value: 'server-renamed.png' } });
        fireEvent.keyDown(serverRenameInput, { key: 'Enter' });

        await waitFor(() => {
            expect(hasFetchCall(fetchMock, (url, init) => (
                url === '/api/assets/rename' &&
                init?.method === 'POST'
            ))).toBe(true);
        });
        await waitFor(() => {
            expect(within(screen.getByTitle('server-photo.png')).queryByTitle('Save')).toBeNull();
        });

        fireEvent.click(within(screen.getByTitle('server-photo.png')).getByTitle('Set public'));
        await waitFor(() => {
            expect(hasFetchCall(fetchMock, (url, init) => (
                url === '/api/assets/visibility' &&
                init?.method === 'POST'
            ))).toBe(true);
        });

        fireEvent.click(within(screen.getByTitle('server-photo.png')).getByTitle('Delete Asset'));
        await waitFor(() => {
            expect(hasFetchCall(fetchMock, (url, init) => (
                url === '/api/assets/delete' &&
                init?.method === 'POST'
            ))).toBe(true);
        });

        fireEvent.click(within(screen.getByTitle('server-photo.png')).getByTitle('Download Asset'));
        await waitFor(() => {
            expect(hasFetchCall(fetchMock, (url) => url === '/server-assets/server-photo.png')).toBe(true);
        });
    });
});
