import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as fabric from 'fabric';
import { X } from 'lucide-react';

import AssetLibrary from '@/components/AssetLibrary';
import EditorExportQualityModal from '@/components/Editor/EditorExportQualityModal';
import { GradientControls } from '@/components/GradientControls';
import { GridOverlay, type GridType } from '@/components/GridOverlay';
import MissingAssetsModal from '@/components/MissingAssetsModal';
import UserProfileModal from '@/components/UserProfileModal';
import type { MissingItem } from '@/components/Editor/editorView.types';
import type { UserProfileSettings } from '@/lib/profile-utils';

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
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card w-[800px] h-[600px] rounded-xl shadow-2xl relative flex flex-col overflow-hidden border border-border">
                        <div className="flex-1 overflow-hidden">
                            <AssetLibrary
                                currentUser={user}
                                onSelect={(url) => {
                                    if (replacingItemId) {
                                        setReplacementMap((prev) => ({ ...prev, [replacingItemId]: url }));
                                    }
                                    setShowAssetBrowserForMissing(false);
                                    setReplacingItemId(null);
                                }}
                                onClose={() => setShowAssetBrowserForMissing(false)}
                            />
                        </div>
                        <button onClick={() => setShowAssetBrowserForMissing(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground bg-background/50 rounded-full p-1 z-50"> <X size={20} /> </button>
                    </div>
                </div>
            )}

            <MissingAssetsModal
                isOpen={showMissingAssetsModal}
                missingItems={missingItems}
                onReplace={(id) => { setReplacingItemId(id); setShowAssetBrowserForMissing(true); }}
                onIgnore={() => { handleResolveMissing(Object.keys(replacementMap).length > 0 ? replacementMap : null); }}
                onClose={closeMissingAssetsModal}
            />

            {mediaPreview && (
                <div
                    className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
                    onClick={() => setMediaPreview(null)}
                >
                    <div
                        className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={mediaPreview.type === 'video' ? 'Video player' : 'Audio player'}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-secondary/40">
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-foreground/90">{mediaPreview.type === 'video' ? 'Video Player' : 'Audio Player'}</span>
                                <span className="text-xs text-muted-foreground truncate max-w-[420px]">
                                    {mediaPreview.url}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {mediaPreview.type === 'video' && (
                                    <button
                                        onClick={handleCaptureVideoFrame}
                                        className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow hover:bg-primary/90 transition-colors"
                                    >
                                        Capture Frame
                                    </button>
                                )}
                                <button
                                    onClick={() => setMediaPreview(null)}
                                    className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label="Close media player"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
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
                    </div>
                </div>
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
