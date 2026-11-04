import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as fabric from 'fabric';
import { Clapperboard, Music } from 'lucide-react';

import AssetLibrary from '@/components/AssetLibrary';
import ModalShell from '@/components/ui/ModalShell';
import AssetVaultModal from '@/components/AssetVault/AssetVaultModal';
import EditorExportQualityModal from '@/components/Editor/EditorExportQualityModal';
import { GradientControls } from '@/components/GradientControls';
import { GridOverlay, type GridType } from '@/components/GridOverlay';
import MissingAssetsModal from '@/components/MissingAssetsModal';
import UserProfileModal from '@/components/UserProfileModal';
import type { MissingItem } from '@/components/Editor/editorView.types';
import type { UserProfileSettings } from '@/lib/profile-utils';
import type { AssetType } from '@/types';
import type { BookcaseFilter } from '@/features/asset-vault/contracts/bookcase';
import { MODAL_LAYER_BASE } from '@/lib/zLayers';

/**
 * The asset browser for replacing a missing asset is a floating panel that
 * portals itself to <body>, so it does not inherit the stacking level of the
 * backdrop rendered beside it. It is told to sit above that backdrop (1060)
 * and the missing-assets window under it (1050); wrapped in a card at the
 * workspace tier, as it used to be, it drew behind both.
 */
const MISSING_ASSET_BROWSER_Z = MODAL_LAYER_BASE + 61;

type MediaPreviewState = { type: 'video' | 'audio'; url: string } | null;
type PendingExportFormat = 'png' | 'jpg' | null;

type EditorViewOverlaysProps = {
    isExporting: boolean;
    canvas: fabric.Canvas | null;
    gridType: GridType;
    activeTool: string;
    showProfileModal: boolean;
    setShowProfileModal: (show: boolean) => void;
    user: string;
    onLogout: () => void;
    setProfileSettings: (profile: UserProfileSettings) => void;
    showAssetBrowserForMissing: boolean;
    setShowAssetBrowserForMissing: (show: boolean) => void;
    replacingItemId: string | null;
    setReplacingItemId: (id: string | null) => void;
    setReplacementMap: Dispatch<SetStateAction<Record<string, string>>>;
    showMissingAssetsModal: boolean;
    missingItems: MissingItem[];
    handleResolveMissing: (replaceMap: Record<string, string> | null) => void;
    replacementMap: Record<string, string>;
    closeMissingAssetsModal: () => void;
    mediaPreview: MediaPreviewState;
    setMediaPreview: Dispatch<SetStateAction<MediaPreviewState>>;
    handleCaptureVideoFrame: () => void;
    videoPreviewRef: MutableRefObject<HTMLVideoElement | null>;
    showExportQualityModal: boolean;
    pendingExportFormat: PendingExportFormat;
    exportQualityValue: number;
    exportQualitySize: string;
    includeCanvasBackground: boolean;
    setExportQualityValue: (quality: number) => void;
    setIncludeCanvasBackground: (includeBackground: boolean) => void;
    closeExportQualityModal: () => void;
    confirmPendingQualityExport: () => void;
    showAssetVault: boolean;
    setShowAssetVault: (show: boolean) => void;
    vaultInitialFilter?: BookcaseFilter;
    vaultInitialBookcaseId?: string;
    vaultFocusSearch?: boolean;
    onAssetVaultSelect: (path: string, type: AssetType, name?: string) => void;
    onOpenClassicLibrary: () => void;
};

export default function EditorViewOverlays({
    isExporting,
    canvas,
    gridType,
    activeTool,
    showProfileModal,
    setShowProfileModal,
    user,
    onLogout,
    setProfileSettings,
    showAssetBrowserForMissing,
    setShowAssetBrowserForMissing,
    replacingItemId,
    setReplacingItemId,
    setReplacementMap,
    showMissingAssetsModal,
    missingItems,
    handleResolveMissing,
    replacementMap,
    closeMissingAssetsModal,
    mediaPreview,
    setMediaPreview,
    handleCaptureVideoFrame,
    videoPreviewRef,
    showExportQualityModal,
    pendingExportFormat,
    exportQualityValue,
    exportQualitySize,
    includeCanvasBackground,
    setExportQualityValue,
    setIncludeCanvasBackground,
    closeExportQualityModal,
    confirmPendingQualityExport,
    showAssetVault,
    setShowAssetVault,
    vaultInitialFilter,
    vaultInitialBookcaseId,
    vaultFocusSearch,
    onAssetVaultSelect,
    onOpenClassicLibrary,
}: EditorViewOverlaysProps) {
    return (
        <>
            <GridOverlay canvas={isExporting ? null : canvas} gridType={gridType} />
            <GradientControls canvas={canvas} activeTool={activeTool} />
            <UserProfileModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                username={user}
                onLogout={() => {
                    setShowProfileModal(false);
                    onLogout();
                }}
                onProfileUpdate={(profile) => setProfileSettings(profile)}
            />

            {showAssetBrowserForMissing && (
                <>
                    <div
                        className="fixed inset-0 z-[1060] bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowAssetBrowserForMissing(false)}
                    />
                    <AssetLibrary
                        currentUser={user}
                        zIndex={MISSING_ASSET_BROWSER_Z}
                        onSelect={(url) => {
                            if (replacingItemId) {
                                setReplacementMap((prev) => ({ ...prev, [replacingItemId]: url }));
                            }
                            setShowAssetBrowserForMissing(false);
                            setReplacingItemId(null);
                        }}
                        onClose={() => setShowAssetBrowserForMissing(false)}
                    />
                </>
            )}

            <AssetVaultModal
                isOpen={showAssetVault}
                onClose={() => setShowAssetVault(false)}
                onSelect={onAssetVaultSelect}
                onOpenClassicLibrary={onOpenClassicLibrary}
                currentUser={user}
                initialFilter={vaultInitialFilter}
                initialBookcaseId={vaultInitialBookcaseId}
                focusSearch={vaultFocusSearch}
            />

            <MissingAssetsModal
                isOpen={showMissingAssetsModal}
                missingItems={missingItems}
                onReplace={(id) => { setReplacingItemId(id); setShowAssetBrowserForMissing(true); }}
                onIgnore={() => { handleResolveMissing(Object.keys(replacementMap).length > 0 ? replacementMap : null); }}
                onClose={closeMissingAssetsModal}
            />

            {mediaPreview && (
                <ModalShell
                    isOpen
                    onClose={() => setMediaPreview(null)}
                    zIndex={130}
                    title={mediaPreview.type === 'video' ? 'Video Player' : 'Audio Player'}
                    icon={mediaPreview.type === 'video' ? <Clapperboard size={16} className="text-primary" /> : <Music size={16} className="text-primary" />}
                    closeLabel="Close media player"
                    initialWidth={880}
                    initialHeight={mediaPreview.type === 'video' ? 620 : 220}
                    minWidth={420}
                    minHeight={mediaPreview.type === 'video' ? 320 : 160}
                    persistKey={`media-preview-${mediaPreview.type}`}
                    headerExtras={(
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="hidden md:block text-xs text-muted-foreground truncate max-w-[360px]" title={mediaPreview.url}>{mediaPreview.url}</span>
                            {mediaPreview.type === 'video' && (
                                <button
                                    onClick={handleCaptureVideoFrame}
                                    className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow hover:bg-primary/90 transition-colors"
                                >
                                    Capture Frame
                                </button>
                            )}
                        </div>
                    )}
                >
                        <div className="p-4 bg-background">
                            {mediaPreview.type === 'video' ? (
                                <video
                                    key={mediaPreview.url}
                                    src={mediaPreview.url}
                                    controls
                                    ref={videoPreviewRef}
                                    className="w-full max-h-[70vh] rounded-lg bg-black"
                                />
                            ) : (
                                <audio
                                    key={mediaPreview.url}
                                    src={mediaPreview.url}
                                    controls
                                    className="w-full"
                                />
                            )}
                        </div>
                </ModalShell>
            )}

            <EditorExportQualityModal
                isOpen={showExportQualityModal}
                pendingExportFormat={pendingExportFormat}
                exportQualityValue={exportQualityValue}
                exportQualitySize={exportQualitySize}
                includeCanvasBackground={includeCanvasBackground}
                onQualityChange={setExportQualityValue}
                onIncludeCanvasBackgroundChange={setIncludeCanvasBackground}
                onCancel={closeExportQualityModal}
                onSave={confirmPendingQualityExport}
            />
        </>
    );
}
