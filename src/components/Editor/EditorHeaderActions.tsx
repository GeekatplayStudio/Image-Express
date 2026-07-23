import type { RefObject } from 'react';
import NextImage from 'next/image';
import * as fabric from 'fabric';
import {
    Download,
    Share2,
    ChevronDown,
    Image as ImageIcon,
    FileText,
    FileCode,
    User,
    X,
    Grid3x3,
    LayoutGrid,
    Crosshair as CrosshairIcon,
    Archive,
    Square,
    Facebook,
    Instagram,
    Scissors,
} from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import LanguageSelector from '@/components/LanguageSelector';
import {
    MEDIA_OVERLAY_NAMING_TEMPLATES,
    MEDIA_OVERLAY_PRESETS,
    MEDIA_OVERLAY_SAFE_AREA_PRESETS,
    MEDIA_OVERLAY_VARIANT_CONVERSION_MODES,
    type MediaOverlayNamingTemplate,
    type MediaOverlayPreset,
    type MediaOverlaySafeAreaPreset,
    type MediaOverlayVariantConversionMode,
} from '@/components/Editor/editorViewConfig';
import type { EditorMenuId } from '@/components/Editor/useEditorMenus';
import type { MediaOverlayFrameConfig } from '@/components/Editor/useMediaOverlay';
import type { GridType } from '@/components/GridOverlay';
import type { UserProfileSettings } from '@/lib/profile-utils';
import type { ColorPalette } from '@/types';
import { useI18n } from '@/providers/I18nProvider';

type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf' | 'json' | 'html' | 'embroidery';
type SharePlatform = 'facebook' | 'instagram';

type EditorHeaderActionsProps = {
    activePalette: ColorPalette | null;
    canvas: fabric.Canvas | null;
    setActivePalette: (palette: ColorPalette | null) => void;
    gridType: GridType;
    setGridType: (gridType: GridType) => void;
    toggleEditorMenu: (menu: EditorMenuId) => void;
    showGridMenu: boolean;
    setShowGridMenu: (next: boolean) => void;
    shareRef: RefObject<HTMLDivElement | null>;
    showShareMenu: boolean;
    handleShare: (platform: SharePlatform) => void | Promise<void>;
    exportRef: RefObject<HTMLDivElement | null>;
    showExportMenu: boolean;
    mediaOverlayEnabled: boolean;
    setMediaOverlayEnabled: (enabled: boolean) => void;
    mediaOverlayPreset: MediaOverlayPreset;
    handleMediaOverlayPresetChange: (preset: MediaOverlayPreset) => void;
    handleAddMediaOverlayFrame: () => void;
    handleRemoveActiveMediaOverlayFrame: () => void;
    activeMediaOverlayFrameId: string | null;
    mediaOverlayFrames: MediaOverlayFrameConfig[];
    handleSelectMediaOverlayFrame: (frameId: string) => void;
    handleToggleMediaOverlayFrameInclude: (frameId: string, includeInBatchExport: boolean) => void;
    handleActiveMediaOverlayFrameSafeAreaPresetChange: (preset: MediaOverlaySafeAreaPreset) => void;
    mediaOverlayNamingTemplate: MediaOverlayNamingTemplate;
    setMediaOverlayNamingTemplate: (template: MediaOverlayNamingTemplate) => void;
    mediaOverlayVariantConversionMode: MediaOverlayVariantConversionMode;
    setMediaOverlayVariantConversionMode: (mode: MediaOverlayVariantConversionMode) => void;
    handleConvertActiveMediaOverlayFrameToVariant: () => void | Promise<void>;
    handleExport: (format: ExportFormat) => void | Promise<void>;
    exportMediaOverlayFramesZip: (scope: 'selected' | 'all') => void | Promise<void>;
    setShowProfileModal: (show: boolean) => void;
    profileSettings: UserProfileSettings | null;
};

export default function EditorHeaderActions({
    activePalette,
    canvas,
    setActivePalette,
    gridType,
    setGridType,
    toggleEditorMenu,
    showGridMenu,
    setShowGridMenu,
    shareRef,
    showShareMenu,
    handleShare,
    exportRef,
    showExportMenu,
    mediaOverlayEnabled,
    setMediaOverlayEnabled,
    mediaOverlayPreset,
    handleMediaOverlayPresetChange,
    handleAddMediaOverlayFrame,
    handleRemoveActiveMediaOverlayFrame,
    activeMediaOverlayFrameId,
    mediaOverlayFrames,
    handleSelectMediaOverlayFrame,
    handleToggleMediaOverlayFrameInclude,
    handleActiveMediaOverlayFrameSafeAreaPresetChange,
    mediaOverlayNamingTemplate,
    setMediaOverlayNamingTemplate,
    mediaOverlayVariantConversionMode,
    setMediaOverlayVariantConversionMode,
    handleConvertActiveMediaOverlayFrameToVariant,
    handleExport,
    exportMediaOverlayFramesZip,
    setShowProfileModal,
    profileSettings,
}: EditorHeaderActionsProps) {
    const { t } = useI18n();
    const activeFrame = activeMediaOverlayFrameId
        ? mediaOverlayFrames.find((frame) => frame.id === activeMediaOverlayFrameId) ?? null
        : mediaOverlayFrames[0] ?? null;

    return (
        <div className="flex items-center gap-3">
            {/* Active Palette Bar */}
            {activePalette && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 rounded-full border border-border/50 animate-in fade-in zoom-in-95 duration-200">
                    <span className="text-xs font-medium text-muted-foreground mr-1">{activePalette.name}</span>
                    {activePalette.colors.map((c, i) => (
                        <button
                            key={i}
                            className="w-4 h-4 rounded-full border border-border/20 hover:scale-125 transition-transform shadow-sm"
                            style={{ backgroundColor: c }}
                            onClick={() => {
                                const activeObj = canvas?.getActiveObject();
                                if (activeObj) {
                                    if (activeObj instanceof fabric.Group && activeObj.type === 'path_group') {
                                        activeObj.set({ fill: c });
                                    } else {
                                        activeObj.set({ fill: c });
                                    }
                                    canvas?.requestRenderAll();
                                }
                            }}
                            title={t('header.useColor', { color: c })}
                        />
                    ))}
                    <button onClick={() => setActivePalette(null)} className="ml-1 p-0.5 text-muted-foreground hover:text-foreground"><X size={12} /></button>
                </div>
            )}

            {activePalette && <div className="h-6 w-px bg-border mx-1" />}

            {/* Grid Menu */}
            <div className="relative">
                <button
                    onClick={() => toggleEditorMenu('grid')}
                    className={`p-2 hover:bg-secondary rounded-full transition-colors ${gridType !== 'none' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    title={t('hdr.gridGuides')}
                >
                    <Grid3x3 size={20} />
                </button>
                {showGridMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                        <button onClick={() => { setGridType('none'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'none' ? 'bg-secondary/30' : ''}`}>
                            <X size={16} className="text-muted-foreground" /> <span className="font-medium">{t('hdr.grid.none')}</span>
                        </button>
                        <button onClick={() => { setGridType('rule-of-thirds'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'rule-of-thirds' ? 'bg-secondary/30' : ''}`}>
                            <Grid3x3 size={16} className="text-blue-500" /> <span className="font-medium">{t('hdr.grid.thirds')}</span>
                        </button>
                        <button onClick={() => { setGridType('golden-ratio'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'golden-ratio' ? 'bg-secondary/30' : ''}`}>
                            <LayoutGrid size={16} className="text-orange-500" /> <span className="font-medium">{t('hdr.grid.golden')}</span>
                        </button>
                        <button onClick={() => { setGridType('cross'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'cross' ? 'bg-secondary/30' : ''}`}>
                            <CrosshairIcon size={16} className="text-red-500" /> <span className="font-medium">{t('hdr.grid.centerCross')}</span>
                        </button>
                        <button onClick={() => { setGridType('grid-4x4'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'grid-4x4' ? 'bg-secondary/30' : ''}`}>
                            <LayoutGrid size={16} className="text-green-500" /> <span className="font-medium">{t('header.grid4x4')}</span>
                        </button>
                        <button onClick={() => { setGridType('canvas-border'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'canvas-border' ? 'bg-secondary/30' : ''}`}>
                            <Square size={16} className="text-yellow-500" /> <span className="font-medium">{t('hdr.grid.canvasBorder')}</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="relative" ref={shareRef}>
                <button
                    onClick={() => toggleEditorMenu('share')}
                    className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                    title={t('hdr.share')}
                >
                    <Share2 size={20} />
                </button>
                {showShareMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                        <button onClick={() => handleShare('facebook')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Facebook size={16} className="text-blue-600" /> <span className="font-medium">Facebook</span></button>
                        <button onClick={() => handleShare('instagram')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Instagram size={16} className="text-primary" /> <span className="font-medium">Instagram</span></button>
                    </div>
                )}
            </div>

            <div className="relative z-[130]" ref={exportRef}>
                <button
                    onClick={() => toggleEditorMenu('export')}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-lg shadow-primary/20 transition-all transform hover:scale-105 active:scale-95"
                >
                    <Download size={16} />
                    <span>{t('hdr.export')}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>
                {showExportMenu && (
                    <div className="absolute right-0 top-full mt-2 w-[320px] bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-[170]">
                        <div className="px-3 py-2 border-b border-border/50 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('hdr.mediaOverlay')}</span>
                                <Switch
                                    checked={mediaOverlayEnabled}
                                    onCheckedChange={setMediaOverlayEnabled}
                                    aria-label={t('hdr.enableOverlayAria')}
                                />
                            </div>
                            <select
                                value={mediaOverlayPreset}
                                onChange={(event) => handleMediaOverlayPresetChange(event.target.value as MediaOverlayPreset)}
                                aria-label={t('hdr.overlayPresetAria')}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground"
                                disabled={!mediaOverlayEnabled}
                            >
                                {MEDIA_OVERLAY_PRESETS.map((preset) => (
                                    <option key={preset.id} value={preset.id}>{t(preset.labelKey)}</option>
                                ))}
                            </select>
                            <select
                                value={mediaOverlayNamingTemplate}
                                onChange={(event) => setMediaOverlayNamingTemplate(event.target.value as MediaOverlayNamingTemplate)}
                                aria-label={t('hdr.frameNamingAria')}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground"
                                disabled={!mediaOverlayEnabled}
                            >
                                {MEDIA_OVERLAY_NAMING_TEMPLATES.map((template) => (
                                    <option key={template.id} value={template.id}>{t(template.labelKey)}</option>
                                ))}
                            </select>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={handleAddMediaOverlayFrame}
                                    disabled={!mediaOverlayEnabled}
                                    className="rounded-md border border-border/70 px-2 py-1.5 text-[11px] font-medium hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {t('header.addFrame')}
                                </button>
                                <button
                                    onClick={handleRemoveActiveMediaOverlayFrame}
                                    disabled={!mediaOverlayEnabled || !activeMediaOverlayFrameId}
                                    className="rounded-md border border-border/70 px-2 py-1.5 text-[11px] font-medium hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {t('header.removeActive')}
                                </button>
                            </div>
                            {mediaOverlayFrames.length > 0 && (
                                <div className="space-y-2">
                                    <div className="max-h-36 overflow-y-auto rounded-md border border-border/60 bg-background/40">
                                        {mediaOverlayFrames.map((frame, index) => {
                                            const preset = MEDIA_OVERLAY_PRESETS.find((item) => item.id === frame.preset);
                                            const isActive = frame.id === activeMediaOverlayFrameId;
                                            return (
                                                <div key={frame.id} className={`flex items-center justify-between px-2 py-1.5 text-[11px] ${isActive ? 'bg-secondary/35' : ''}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectMediaOverlayFrame(frame.id)}
                                                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                    >
                                                        <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                                                        <span className="truncate font-medium">{t('header.frameNumber', { n: index + 1 })}</span>
                                                        <span className="truncate text-muted-foreground">{preset ? t(preset.labelKey) : frame.preset}</span>
                                                    </button>
                                                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                        <input
                                                            type="checkbox"
                                                            checked={frame.includeInBatchExport}
                                                            onChange={(event) => handleToggleMediaOverlayFrameInclude(frame.id, event.target.checked)}
                                                        />
                                                        {t('header.batch')}
                                                    </label>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <select
                                        value={activeFrame?.safeAreaPreset ?? 'none'}
                                        onChange={(event) => handleActiveMediaOverlayFrameSafeAreaPresetChange(event.target.value as MediaOverlaySafeAreaPreset)}
                                        aria-label={t('hdr.safeAreaAria')}
                                        className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground"
                                        disabled={!mediaOverlayEnabled || !activeFrame}
                                    >
                                        {MEDIA_OVERLAY_SAFE_AREA_PRESETS.map((preset) => (
                                            <option key={preset.id} value={preset.id}>{t(preset.labelKey)}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={mediaOverlayVariantConversionMode}
                                        onChange={(event) => setMediaOverlayVariantConversionMode(event.target.value as MediaOverlayVariantConversionMode)}
                                        aria-label={t('hdr.variantModeAria')}
                                        className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground"
                                        disabled={!mediaOverlayEnabled || !activeFrame}
                                    >
                                        {MEDIA_OVERLAY_VARIANT_CONVERSION_MODES.map((mode) => (
                                            <option key={mode.id} value={mode.id}>{t(mode.labelKey)}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => { void handleConvertActiveMediaOverlayFrameToVariant(); }}
                                        disabled={!mediaOverlayEnabled || !activeFrame}
                                        className="w-full rounded-md border border-border/70 px-2 py-1.5 text-[11px] font-medium hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {t('header.convertFrameToVariant')}
                                    </button>
                                </div>
                            )}
                            <div className="text-[10px] text-muted-foreground">
                                {t('header.frameExportHint')}
                            </div>
                        </div>
                        <button onClick={() => handleExport('png')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><ImageIcon size={16} className="text-blue-500" /> <span className="font-medium">PNG</span></button>
                        <button onClick={() => handleExport('jpg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><ImageIcon size={16} className="text-orange-500" /> <span className="font-medium">JPG</span></button>
                        <button onClick={() => handleExport('svg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileCode size={16} className="text-primary" /> <span className="font-medium">SVG</span></button>
                        <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileText size={16} className="text-red-500" /> <span className="font-medium">PDF</span></button>
                        <div className="my-1 border-t border-border/50" />
                        <button onClick={() => { void exportMediaOverlayFramesZip('selected'); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Archive size={16} className="text-indigo-500" /> <span className="font-medium">{t('hdr.zipSelected')}</span></button>
                        <button onClick={() => { void exportMediaOverlayFramesZip('all'); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Archive size={16} className="text-violet-500" /> <span className="font-medium">{t('hdr.zipAll')}</span></button>
                        <div className="my-1 border-t border-border/50" />
                        <button onClick={() => handleExport('json')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileCode size={16} className="text-green-500" /> <span className="font-medium">JSON</span></button>
                        <button onClick={() => handleExport('html')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Archive size={16} className="text-sky-400" /> <span className="font-medium">{t('hdr.htmlBundle')}</span></button>
                        <div className="my-1 border-t border-border/50" />
                        <button onClick={() => handleExport('embroidery')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Scissors size={16} className="text-pink-500" /> <span className="font-medium">{t('hdr.embroidery')}</span></button>
                    </div>
                )}
            </div>
            <LanguageSelector className="ml-1" />
            <button
                onClick={() => setShowProfileModal(true)}
                className="relative w-9 h-9 rounded-full ui-avatar-gradient ring-2 ring-background ml-2 overflow-hidden flex items-center justify-center"
                title={t('hdr.userProfile')}
            >
                {profileSettings?.image ? (
                    <NextImage
                        src={profileSettings.image}
                        alt={t('hdr.profileAlt')}
                        fill
                        sizes="36px"
                        className="object-cover"
                        style={{ transform: `scale(${profileSettings.imageScale || 1})`, transformOrigin: 'center' }}
                        unoptimized
                    />
                ) : (
                    <User size={16} className="text-white/90" />
                )}
            </button>
        </div>
    );
}
