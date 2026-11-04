import { fireEvent, render, screen } from '@testing-library/react';

import EditorViewOverlays from '@/components/Editor/EditorViewOverlays';

jest.mock('@/providers/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/AssetLibrary', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/AssetVault/AssetVaultModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/MissingAssetsModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/UserProfileModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/Editor/EditorExportQualityModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/GridOverlay', () => ({ GridOverlay: () => null }));
jest.mock('@/components/GradientControls', () => ({ GradientControls: () => null }));

const renderOverlays = (over: Record<string, unknown>) => {
    const props = {
        isExporting: false, canvas: null, gridType: 'none', activeTool: 'select',
        showProfileModal: false, setShowProfileModal: jest.fn(), user: 'me', onLogout: jest.fn(), setProfileSettings: jest.fn(),
        showAssetBrowserForMissing: false, setShowAssetBrowserForMissing: jest.fn(), replacingItemId: null, setReplacingItemId: jest.fn(),
        setReplacementMap: jest.fn(), showMissingAssetsModal: false, missingItems: [], handleResolveMissing: jest.fn(), replacementMap: {},
        closeMissingAssetsModal: jest.fn(), mediaPreview: null, setMediaPreview: jest.fn(), handleCaptureVideoFrame: jest.fn(),
        videoPreviewRef: { current: null }, showExportQualityModal: false, pendingExportFormat: null, exportQualityValue: 90,
        exportQualitySize: '', includeCanvasBackground: true, setExportQualityValue: jest.fn(), setIncludeCanvasBackground: jest.fn(),
        closeExportQualityModal: jest.fn(), confirmPendingQualityExport: jest.fn(), showAssetVault: false, setShowAssetVault: jest.fn(),
        onAssetVaultSelect: jest.fn(), onOpenClassicLibrary: jest.fn(),
        ...over,
    };
    render(<EditorViewOverlays {...(props as unknown as React.ComponentProps<typeof EditorViewOverlays>)} />);
    return props;
};

describe('EditorViewOverlays media preview', () => {
    it('shows a video player window with Capture Frame, and closes from the header and Escape', () => {
        const props = renderOverlays({ mediaPreview: { type: 'video', url: 'https://cdn.example/clip.mp4' } });
        expect(screen.getByRole('dialog', { name: 'Video Player' })).toBeInTheDocument();
        expect(document.querySelector('video')).toHaveAttribute('src', 'https://cdn.example/clip.mp4');

        fireEvent.click(screen.getByRole('button', { name: 'Capture Frame' }));
        expect(props.handleCaptureVideoFrame).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Close media player' }));
        expect(props.setMediaPreview).toHaveBeenCalledWith(null);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(props.setMediaPreview).toHaveBeenCalledTimes(2);
    });

    it('shows an audio player without a capture button', () => {
        renderOverlays({ mediaPreview: { type: 'audio', url: 'https://cdn.example/track.mp3' } });
        expect(screen.getByRole('dialog', { name: 'Audio Player' })).toBeInTheDocument();
        expect(document.querySelector('audio')).toHaveAttribute('src', 'https://cdn.example/track.mp3');
        expect(screen.queryByRole('button', { name: 'Capture Frame' })).toBeNull();
    });

    it('renders no player when nothing is being previewed', () => {
        renderOverlays({});
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
