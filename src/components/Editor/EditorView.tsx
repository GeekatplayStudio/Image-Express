'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import EditorCanvasWorkspace from '@/components/Editor/EditorCanvasWorkspace';
import EditorHeaderPrimary from '@/components/Editor/EditorHeaderPrimary';
import EditorHeaderMenus from '@/components/Editor/EditorHeaderMenus';
import EditorHeaderActions from '@/components/Editor/EditorHeaderActions';
import EditorPropertiesPanels from '@/components/Editor/EditorPropertiesPanels';
import EditorTopToolOptionsBridge from '@/components/Editor/EditorTopToolOptionsBridge';
import EditorViewOverlays from '@/components/Editor/EditorViewOverlays';
import EditorWorkspaceShell from '@/components/Editor/EditorWorkspaceShell';
import { type ToolbarHandle } from '@/components/Toolbar';
import { loadProfileSettings, UserProfileSettings } from '@/lib/profile-utils';
import * as fabric from 'fabric';
import type { GridType } from '@/components/GridOverlay';
import { ColorPalette } from '@/types';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import { APP_THEME } from '@/lib/theme-tokens';
import { useMediaOverlay } from '@/components/Editor/useMediaOverlay';
import { useEditorExport } from '@/components/Editor/useEditorExport';
import { useEditorPersistence } from '@/components/Editor/useEditorPersistence';
import { useEditorMenuActions } from '@/components/Editor/useEditorMenuActions';
import { useEditorMediaPreview } from '@/components/Editor/useEditorMediaPreview';
import { useEditorKeyboardShortcuts } from '@/components/Editor/useEditorKeyboardShortcuts';
import { useEditorDesignTitle } from '@/components/Editor/useEditorDesignTitle';
import { useEditorMenus } from '@/components/Editor/useEditorMenus';
import { useEditorTextControls } from '@/components/Editor/useEditorTextControls';
import { useEditorHistory } from '@/components/Editor/useEditorHistory';
import { useEditorPanelState } from '@/components/Editor/useEditorPanelState';
import { useEditorCanvasAssetActions } from '@/components/Editor/useEditorCanvasAssetActions';
import { useEditorTopCanvasControls } from '@/components/Editor/useEditorTopCanvasControls';
import { useEditorCanvasInteractionEffects } from '@/components/Editor/useEditorCanvasInteractionEffects';
import { useEditorCanvasOverlayState } from '@/components/Editor/useEditorCanvasOverlayState';
import { useEditorCanvasSelectionInteractions } from '@/components/Editor/useEditorCanvasSelectionInteractions';
import { useEditorCanvasRetouchInteractions } from '@/components/Editor/useEditorCanvasRetouchInteractions';
import { useEditorCanvasExportSupport } from '@/components/Editor/useEditorCanvasExportSupport';
import { useEditorShellEffects } from '@/components/Editor/useEditorShellEffects';
import { useEditorShapeGradientControls } from '@/components/Editor/useEditorShapeGradientControls';
import { useEditorSelectionModify } from '@/components/Editor/useEditorSelectionModify';
import { useEditorThreeDWorkspace } from '@/components/Editor/useEditorThreeDWorkspace';
import { useBackgroundJobsStore } from '@/components/Editor/useBackgroundJobsStore';
import { useBackgroundJobPolling } from '@/components/Editor/useBackgroundJobPolling';
import { useEditorTopToolState } from '@/components/Editor/useEditorTopToolState';
import { useEditorUtilityOverlayLayout } from '@/components/Editor/useEditorUtilityOverlayLayout';
import { useEditorPaintPenEffects } from '@/components/Editor/useEditorPaintPenEffects';
import { useEditorPanelModePersistence } from '@/components/Editor/useEditorPanelModePersistence';
import { useEditorWorkspaceCompositionProps } from '@/components/Editor/useEditorWorkspaceCompositionProps';
import { useEditorTopToolOptionsBridgeProps } from '@/components/Editor/useEditorTopToolOptionsBridgeProps';
import type { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';

interface EditorViewProps {
    initialDesign: { data?: unknown } | null;
    initialTemplateJsonUrl: string | null;
    initialSize?: { width: number, height: number } | null;
    user: string;
    onBack: () => void;
    onLogout: () => void;
    currentDesignName: string;
    currentDesignId: string | null;
    onUpdateDesignInfo: (id: string | null, name: string) => void;
    onOpenDocumentation?: () => void;
    onOpenSettings: () => void;
    onOpenAdminArea?: () => void;
    isAdminUser?: boolean;
    settingsOpen: boolean;
    initialActiveTool?: string;
}

const PANEL_MODE_STORAGE_KEY = 'image-express-properties-panel-mode';

const TOOL_PANEL_MODE_MAP: Partial<Record<string, PanelRailMode>> = {
    select: 'properties',
    marquee: 'properties',
    lasso: 'properties',
    wand: 'properties',
    'quick-select': 'properties',
    'selection-brush': 'properties',
    'path-select': 'properties',
    healing: 'properties',
    'clone-stamp': 'properties',
    'history-brush': 'properties',
    blur: 'properties',
    sharpen: 'properties',
    dodge: 'properties',
    text: 'properties',
    gradient: 'properties',
    eyedropper: 'properties',
    crop: 'properties',
    zoom: 'properties',
    hand: 'properties',
    paint: 'brushes',
    pen: 'brushes',
    layers: 'layers',
};

export default function EditorView({ 
    initialDesign, 
    initialTemplateJsonUrl,
    initialSize,
    user, 
    onBack,
    onLogout,
    currentDesignName: propDesignName,
    currentDesignId: propDesignId,
    onUpdateDesignInfo,
    onOpenDocumentation,
    onOpenSettings,
    onOpenAdminArea,
    isAdminUser = false,
    settingsOpen,
    initialActiveTool
}: EditorViewProps) {
    const dialog = useDialog();
    const { toast } = useToast();

    const getDisplayName = useCallback((url: string) => {
        const withoutQuery = url.split('?')[0];
        const last = decodeURIComponent(withoutQuery.split('/').pop() || 'Media');
        return last || 'Media';
    }, []);
    const envDriveClientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? '';
    
    // Core Logic States
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const [activeTool, setActiveTool] = useState<string>('select');
    const [activePalette, setActivePalette] = useState<ColorPalette | null>(null);
    const [zoom, setZoom] = useState(1);
    const [isDirty, setIsDirty] = useState(false);

    const customHistoryProps = useMemo(() => [
        'id',
        'gradient',
        'pattern',
        'is3DModel',
        'modelUrl',
        'isStar',
        'starPoints',
        'starInnerRadius',
        'mediaType',
        'mediaSource',
        'layerTagColor',
        'name',
        'locked',
        'curveStrength',
        'curveCenter',
        'curveSpan',
        'textSpellcheck',
        'skewZ',
        'skewZBaseScale',
        'skewZBaseScaleX',
        'skewZBaseScaleY',
        'skewZBaseSkewX',
        'skewZBaseSkewY',
        'taperDirection',
        'taperBaseLeft',
        'taperBaseTop',
        'threeDSettings',
        'isAdjustmentLayer',
        'adjustmentType',
        'adjustmentSettings',
        'baseFilters',
        'aiGenerated',
        'aiProvider',
        'isPenPath',
        'penMode',
        'penClosed',
        'penNodes',
        'penSourcePoints',
        'textPathSourceId',
        'shapeCornerRadius',
        'isRetouchLayer',
        'gradientTypeHint',
        'gradientReversed',
        'gradientDitherEnabled'
    ], []);

    const {
        historyReadyRef,
        historyState,
        resetHistory,
        pushHistory,
        handleUndo,
        handleRedo,
        handleDuplicate,
    } = useEditorHistory({
        canvas,
        customHistoryProps,
        setIsDirty,
    });

    const {
        panelState,
        setPanelState,
        propertiesPanelMode,
        setPropertiesPanelMode,
        isDraggingPanel,
        handlePanelDragStart,
        startPanelResize,
        toggleCollapse,
        toggleFloat,
        isPropertiesPanelVisible,
        handleWindowPanelToggle,
        handleWindowDockMode,
    } = useEditorPanelState();

    // UI States
    const {
        showFileMenu,
        showEditMenu,
        showImageMenu,
        showLayerMenu,
        showSelectMenu,
        showFilterMenu,
        showViewMenu,
        showWindowMenu,
        showSettingsMenu,
        showHelpMenu,
        showExportMenu,
        showShareMenu,
        showGridMenu,
        setShowFileMenu,
        setShowEditMenu,
        setShowImageMenu,
        setShowLayerMenu,
        setShowSelectMenu,
        setShowFilterMenu,
        setShowViewMenu,
        setShowWindowMenu,
        setShowSettingsMenu,
        setShowHelpMenu,
        setShowExportMenu,
        setShowShareMenu,
        setShowGridMenu,
        closeEditorMenus,
        toggleEditorMenu,
        openEditorMenu,
        isAnyEditorMenuOpen,
    } = useEditorMenus();
    const [showTopNavMenus, setShowTopNavMenus] = useState(false);
    const shareRef = useRef<HTMLDivElement>(null);
    const [gridType, setGridType] = useState<GridType>('none');
    const [showProfileModal, setShowProfileModal] = useState(false);
    const {
        autoSelectEnabled, setAutoSelectEnabled, selectionMode, setSelectionMode,
        showTransformControls, setShowTransformControls, selectFeather, setSelectFeather,
        selectAntiAlias, setSelectAntiAlias, selectionModifyPixels, setSelectionModifyPixels,
        wandTopThreshold, setWandTopThreshold,
        healingTopSize, setHealingTopSize, healingTopHardness, setHealingTopHardness,
        healingTopSampleAllLayers, setHealingTopSampleAllLayers,
        historyBrushTopSize, setHistoryBrushTopSize, historyBrushTopHardness, setHistoryBrushTopHardness,
        historyBrushTopSampleAllLayers, setHistoryBrushTopSampleAllLayers,
        blurTopSize, setBlurTopSize, blurTopStrength, setBlurTopStrength,
        blurTopSampleAllLayers, setBlurTopSampleAllLayers,
        sharpenTopSize, setSharpenTopSize, sharpenTopStrength, setSharpenTopStrength,
        sharpenTopSampleAllLayers, setSharpenTopSampleAllLayers,
        dodgeTopSize, setDodgeTopSize, dodgeTopExposure, setDodgeTopExposure,
        dodgeTopProtectTones, setDodgeTopProtectTones,
        cloneTopSize, setCloneTopSize, cloneTopHardness, setCloneTopHardness,
        cloneTopAligned, setCloneTopAligned, cloneTopSampleAllLayers, setCloneTopSampleAllLayers,
        cloneSourcePoint, setCloneSourcePoint,
        expandToolRailLabelsOnHover, setExpandToolRailLabelsOnHover,
        paintBrushPreset, setPaintBrushPreset, paintBrushSize, setPaintBrushSize,
        paintBrushHardness, setPaintBrushHardness, paintBrushOpacity, setPaintBrushOpacity,
        paintBrushFlow, setPaintBrushFlow, paintBrushSmoothing, setPaintBrushSmoothing,
        paintBlendMode, setPaintBlendMode,
        penTopMode, setPenTopMode, penTopPathOperation, setPenTopPathOperation,
        penTopAutoAddDelete, setPenTopAutoAddDelete, penTopRubberBand, setPenTopRubberBand,
        handTopLockPan, setHandTopLockPan,
    } = useEditorTopToolState();
    const {
        mediaOverlayEnabled,
        setMediaOverlayEnabled,
        mediaOverlayPreset,
        mediaOverlayFrames,
        activeMediaOverlayFrameId,
        mediaOverlayFrameRef,
        mediaOverlayLabelRef,
        getMediaOverlayBatchTargets,
        handleMediaOverlayPresetChange,
        handleAddMediaOverlayFrame,
        handleRemoveActiveMediaOverlayFrame,
        handleToggleMediaOverlayFrameInclude,
        mediaOverlayNamingTemplate,
        setMediaOverlayNamingTemplate,
        mediaOverlayVariantConversionMode,
        setMediaOverlayVariantConversionMode,
        handleActiveMediaOverlayFrameSafeAreaPresetChange,
        handleSelectMediaOverlayFrame,
        handleConvertActiveMediaOverlayFrameToVariant,
    } = useMediaOverlay({
        canvas,
        designId: propDesignId,
        designName: propDesignName || 'Untitled Design',
        onDirty: () => setIsDirty(true),
        pushHistory,
        toast,
        confirm: dialog.confirm,
        onVariantDraftCreated: (name) => {
            onUpdateDesignInfo(null, name);
            setIsDirty(true);
        },
    });

    const {
        textQuickBarPos,
        textOptions,
        setSampledTextColor,
        handleTextFontFamilyChange,
        handleTextFontStyleChange,
        handleTextFontSizeChange,
        handleTextColorChange,
        handleTextBoldChange,
        handleTextItalicChange,
        handleTextUnderlineChange,
        handleTextAlignChange,
        handleTextSpellcheckChange,
    } = useEditorTextControls({ canvas });

    const {
        gradientTopType,
        gradientTopBlendMode,
        gradientTopOpacity,
        gradientTopReverse,
        gradientTopDither,
        handleGradientTypeChange,
        handleGradientBlendModeChange,
        handleGradientOpacityChange,
        handleGradientReverseChange,
        handleGradientDitherChange,
        resolveGradientStops,
        shapeTopMode,
        shapeTopFillColor,
        shapeTopStrokeColor,
        shapeTopStrokeWidth,
        shapeTopCornerRadius,
        shapeTopCanSmoothAngles,
        shapeTopFixedSize,
        setShapeTopFillColor,
        handleShapeModeChange,
        handleShapeFillColorChange,
        handleShapeStrokeColorChange,
        handleShapeStrokeWidthChange,
        handleShapeCornerRadiusChange,
        handleShapeFixedSizeChange,
    } = useEditorShapeGradientControls({
        canvas,
        initialShapeFillColor: APP_THEME.shapeDefaultFillHex,
    });

    const {
        utilityCanvasSize,
        viewportSize,
        cropTopRatioPreset,
        cropTopDeleteOutside,
        cropTopUseArtboardBounds,
        setCropTopDeleteOutside,
        setCropTopUseArtboardBounds,
        handleCropRatioPresetChange,
        applyTopCropSettings,
        eyedropperTopSampleSize,
        eyedropperTopSampleSource,
        eyedropperTopSampledColor,
        setEyedropperTopSampleSource,
        handleEyedropperSampleSizeChange,
        handleEyedropperSample,
        zoomTopMode,
        zoomTopStep,
        setZoomTopMode,
        handleZoomStepChange,
        handleZoomApply,
        handleZoomReset,
        handleFitToScreen,
        handleZoom,
    } = useEditorTopCanvasControls({
        canvas,
        activeTool,
        setActiveTool,
        setIsDirty,
        setShapeTopFillColor,
        setSampledTextColor,
        setZoom,
        toast,
    });

    const {
        contextMenu,
        setContextMenu,
        handleOpenWorkspaceContextMenu,
        handleCloseContextMenu,
        lockedLayerOverlayEntries,
        hoveredLockedLayerId,
        setHoveredLockedLayerId,
        canvasLockControl,
        cursorPreview,
        setObjectLockedFromCanvasOverlay,
    } = useEditorCanvasOverlayState({
        canvas,
        activeTool,
        zoom,
        paintBrushSize,
        healingTopSize,
        cloneTopSize,
        historyBrushTopSize,
        blurTopSize,
        sharpenTopSize,
        dodgeTopSize,
    });

    const {
        handleAssetSelect,
        handleCanvasModified,
        handleRightClick,
        handleFileDrop,
    } = useEditorCanvasAssetActions({
        canvas,
        user,
        pushHistory,
        setIsDirty,
        setContextMenu,
        toast,
    });

    const { handleSelectionModify } = useEditorSelectionModify({
        canvas,
        selectionMode,
        selectionModifyPixels,
    });

    useEditorCanvasSelectionInteractions({
        canvas,
        activeTool,
        selectionMode,
        wandTopThreshold,
    });

    useEditorCanvasRetouchInteractions({
        canvas,
        utilityCanvasSize,
        activeTool,
        retouchControls: {
            healingTopSize,
            healingTopHardness,
            healingTopSampleAllLayers,
            historyBrushTopSize,
            historyBrushTopHardness,
            blurTopSize,
            blurTopStrength,
            blurTopSampleAllLayers,
            sharpenTopSize,
            sharpenTopStrength,
            sharpenTopSampleAllLayers,
            dodgeTopSize,
            dodgeTopExposure,
            dodgeTopProtectTones,
            cloneTopSize,
            cloneTopHardness,
            cloneTopAligned,
            cloneTopSampleAllLayers,
            cloneSourcePoint,
            setCloneSourcePoint,
        },
        pushHistory,
        setIsDirty,
        toast,
    });

    const {
        getCanvasBackgroundSettings,
        withViewportReset,
        safeCanvasToDataURL,
    } = useEditorCanvasExportSupport({
        canvas,
    });

    useEditorPanelModePersistence({
        storageKey: PANEL_MODE_STORAGE_KEY,
        propertiesPanelMode,
        setPropertiesPanelMode,
    });
    const [profileSettings, setProfileSettings] = useState<UserProfileSettings | null>(() => loadProfileSettings());
    // Assets & Missing Items
    const [showAssetBrowserForMissing, setShowAssetBrowserForMissing] = useState(false);
    const [replacingItemId, setReplacingItemId] = useState<string | null>(null);
    const [replacementMap, setReplacementMap] = useState<Record<string, string>>({});

    useEditorPaintPenEffects({
        canvas,
        activeTool,
        paintBrushPreset,
        paintBrushSize,
        paintBrushHardness,
        paintBrushOpacity,
        paintBrushFlow,
        paintBrushSmoothing,
        paintBlendMode,
        setPenTopMode,
        setPenTopPathOperation,
        setPenTopAutoAddDelete,
        setPenTopRubberBand,
    });

    // 3D & AI States
    const { backgroundJobs, setBackgroundJobs, upsertBackgroundJob } = useBackgroundJobsStore();
    const [mediaPreview, setMediaPreview] = useState<{ type: 'video' | 'audio'; url: string } | null>(null);
    const {
        setEditingModelUrl,
        setEditingModelObject,
        handleToolbarToolChange,
        handleOpenThreeDFromPanel,
        handleOpenThreeDEditor,
        threeDControls: canvasWorkspaceThreeDControls,
    } = useEditorThreeDWorkspace({
        canvas,
        activeTool,
        setActiveTool,
        user,
        backgroundJobs,
        onOpenSettings,
        toast,
        upsertBackgroundJob,
        getDisplayName,
    });

    const exportRef = useRef<HTMLDivElement>(null);
    const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
    const toolbarRef = useRef<ToolbarHandle | null>(null);
    
    // API Keys State
    const apiKeys = useMemo<{
        meshy?: string, 
        tripo?: string, 
        hitems?: string,
        stability?: string, 
        openai?: string, 
        google?: string,
        banana?: string
    }>(() => {
        if (typeof window === 'undefined') {
            return {};
        }

        void settingsOpen;
        return {
            meshy: localStorage.getItem('meshy_api_key') || undefined,
            tripo: localStorage.getItem('tripo_api_key') || undefined,
            hitems: localStorage.getItem('hitems_api_key') || undefined,
            stability: localStorage.getItem('stability_api_key') || undefined,
            openai: localStorage.getItem('openai_api_key') || undefined,
            google: localStorage.getItem('google_api_key') || undefined,
            banana: localStorage.getItem('banana_api_key') || undefined,
        };
    }, [settingsOpen]);

    useEditorShellEffects({
        canvas,
        activeTool,
        autoSelectEnabled,
        showTransformControls,
        selectAntiAlias,
        initialActiveTool,
        setActiveTool,
        exportRef,
        setShowExportMenu,
        setZoom,
        handTopLockPan,
        mediaPreview,
        setMediaPreview,
        settingsOpen,
        setExpandToolRailLabelsOnHover,
    });

    useEffect(() => {
        const nextPanelMode = TOOL_PANEL_MODE_MAP[activeTool];
        if (!nextPanelMode) {
            return;
        }

        setPropertiesPanelMode((prev) => (prev === nextPanelMode ? prev : nextPanelMode));
        setPanelState((prev) => {
            if (prev.mode === 'collapsed-left') {
                return { ...prev, mode: 'docked-left' };
            }
            if (prev.mode === 'collapsed-right') {
                return { ...prev, mode: 'docked-right' };
            }
            return prev;
        });
    }, [activeTool, setPanelState, setPropertiesPanelMode]);

    const closeExportMenu = useCallback(() => {
        setShowExportMenu(false);
    }, [setShowExportMenu]);

    const closeShareMenu = useCallback(() => {
        setShowShareMenu(false);
    }, [setShowShareMenu]);

    const {
        isExporting,
        setIsExporting,
        showExportQualityModal,
        pendingExportFormat,
        exportQualityValue,
        exportQualitySize,
        includeCanvasBackground,
        setExportQualityValue,
        setIncludeCanvasBackground,
        closeExportQualityModal,
        confirmPendingQualityExport,
        handleExport,
        handleShare,
        exportMediaOverlayFramesZip,
    } = useEditorExport({
        canvas,
        customHistoryProps,
        user,
        profileSettings,
        mediaOverlayFrameRef,
        mediaOverlayLabelRef,
        getCanvasBackgroundSettings,
        withViewportReset,
        safeCanvasToDataURL,
        getMediaOverlayBatchTargets,
        mediaOverlayNamingTemplate,
        designName: propDesignName || 'Untitled Design',
        getDisplayName,
        toast,
        closeExportMenu,
        closeShareMenu,
    });

    const {
        handleBack,
        handleSave,
        showMissingAssetsModal,
        missingItems,
        closeMissingAssetsModal,
        handleResolveMissing,
    } = useEditorPersistence({
        canvas,
        initialDesign,
        initialTemplateJsonUrl,
        designId: propDesignId,
        designName: propDesignName,
        customHistoryProps,
        driveClientId: envDriveClientId,
        isDirty,
        dialog,
        toast,
        onBack,
        onUpdateDesignInfo,
        setIsDirty,
        setIsExporting,
        resetHistory,
        historyReadyRef,
        withViewportReset,
        safeCanvasToDataURL,
    });

    const {
        isRenamingDesignTitle,
        setIsRenamingDesignTitle,
        designTitleDraft,
        setDesignTitleDraft,
        cancelDesignTitleEdit,
        commitDesignTitle,
    } = useEditorDesignTitle({
        designId: propDesignId,
        designName: propDesignName,
        onUpdateDesignInfo,
        setIsDirty,
        toast,
    });

    useEditorKeyboardShortcuts({
        canvas,
        toolbarRef,
        showExportQualityModal,
        hasOpenMenu: isAnyEditorMenuOpen,
        closeExportQualityModal,
        closeEditorMenus,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onDuplicate: handleDuplicate,
    });

    const { gridStatusLabel, bottomRightUtilityStyle } = useEditorUtilityOverlayLayout({
        gridType,
        backgroundJobsCount: backgroundJobs.length,
        contextMenu,
        panelState,
        viewportSize,
    });

    const triggerToolbarTool = useCallback((toolName: string) => {
        toolbarRef.current?.triggerTool(toolName);
    }, []);

    const {
        openPanelModeFromMenu,
        getMenuLayerTarget,
        getActiveLayerOrderState,
        handleLayerOrderAction,
        handleLayerDeleteFromMenu,
        handleLayerToggleLockFromMenu,
        handleSelectAllFromMenu,
        handleDeselectFromMenu,
        handleResetZoomFromMenu,
        handleShowShortcutsFromMenu,
        handleShowAboutFromMenu,
    } = useEditorMenuActions({
        canvas,
        selectionMode,
        toast,
        dialog,
        setZoom,
        setIsDirty,
        pushHistory,
        setObjectLockedFromCanvasOverlay,
        setPropertiesPanelMode,
        setPanelState,
    });

    const { handleCaptureVideoFrame } = useEditorMediaPreview({
        canvas,
        mediaPreview,
        videoPreviewRef,
        setMediaPreview,
        setActiveTool,
    });

    useEditorCanvasInteractionEffects({
        canvas,
        activeTool,
        gradientTopType,
        gradientTopBlendMode,
        gradientTopOpacity,
        gradientTopReverse,
        gradientTopDither,
        resolveGradientStops,
        setMediaPreview,
        setEditingModelUrl,
        setEditingModelObject,
        setActiveTool,
    });

    useBackgroundJobPolling({
        backgroundJobs,
        setBackgroundJobs,
        canvas,
        user,
    });

    // Connection status check commented out
    /*
    const is3DMode = activeTool === '3d-gen';
    const has2DKey = !!(apiKeys.stability || apiKeys.openai || apiKeys.google || apiKeys.banana);
    const has3DKey = !!(apiKeys.meshy || apiKeys.tripo || apiKeys.hitems);
    // const isConnected = is3DMode ? has3DKey : has2DKey;
    */

    const handleResetZoomFromWorkspace = useCallback(() => {
        if (!canvas) {
            return;
        }

        const centerPoint = new fabric.Point(
            (canvas.width || canvas.getWidth()) / 2,
            (canvas.height || canvas.getHeight()) / 2
        );

        canvas.zoomToPoint(centerPoint, 1);
        canvas.requestRenderAll();
        setZoom(1);
    }, [canvas]);

    const activeLayerOrderState = getActiveLayerOrderState();
    const menuLayerTarget = getMenuLayerTarget();
    const handleToggleTopNavMenus = useCallback(() => {
        setShowTopNavMenus((prev) => {
            const next = !prev;
            if (!next) {
                closeEditorMenus();
            }
            return next;
        });
    }, [closeEditorMenus]);

    const {
        propertiesPanelChromeControls,
        propertiesPanelContentControls,
        propertiesPanelBrushControls,
        canvasWorkspaceCanvasControls,
        canvasWorkspaceTextControls,
        canvasWorkspaceLockOverlayControls,
        canvasWorkspaceUtilityControls,
        workspaceShellToolbarProps,
        workspaceShellJobFooterProps,
        workspaceShellContextMenuProps,
    } = useEditorWorkspaceCompositionProps({
        canvas,
        activeTool,
        user,
        activePalette,
        setActivePalette,
        handleToolbarToolChange,
        handleOpenThreeDEditor,
        apiKeys,
        zoomTopMode,
        expandToolRailLabelsOnHover,
        backgroundJobs,
        setBackgroundJobs,
        contextMenu,
        handleCloseContextMenu,
        triggerToolbarTool,
        handleLayerOrderAction,
        activeLayerOrderState,
        bottomRightUtilityStyle,
        zoom,
        utilityCanvasSize,
        gridStatusLabel,
        handleZoom,
        handleFitToScreen,
        handleResetZoomFromWorkspace,
        lockedLayerOverlayEntries,
        canvasLockControl,
        hoveredLockedLayerId,
        setHoveredLockedLayerId,
        setObjectLockedFromCanvasOverlay,
        textQuickBarPos,
        textOptions,
        handleTextFontFamilyChange,
        handleTextFontStyleChange,
        handleTextFontSizeChange,
        handleTextColorChange,
        handleTextBoldChange,
        handleTextItalicChange,
        handleTextUnderlineChange,
        handleTextAlignChange,
        handleTextSpellcheckChange,
        handleFileDrop,
        handleOpenWorkspaceContextMenu,
        setCanvas,
        handleCanvasModified,
        initialSize,
        handleRightClick,
        panelState,
        propertiesPanelMode,
        setPropertiesPanelMode,
        handlePanelDragStart,
        startPanelResize,
        toggleCollapse,
        toggleFloat,
        handleDuplicate,
        handleAssetSelect,
        historyState,
        handleUndo,
        handleRedo,
        handleOpenThreeDFromPanel,
        paintBrushPreset,
        paintBrushSize,
        paintBrushHardness,
        paintBrushOpacity,
        paintBrushFlow,
        paintBrushSmoothing,
        paintBlendMode,
        setPaintBrushPreset,
        setPaintBrushSize,
        setPaintBrushHardness,
        setPaintBrushOpacity,
        setPaintBrushFlow,
        setPaintBrushSmoothing,
        setPaintBlendMode,
    });

    const topToolOptionsBridgeProps = useEditorTopToolOptionsBridgeProps({
        canvas,
        toolbarRef,
        isDirty,
        historyState,
        handleSave,
        handleUndo,
        handleRedo,
        autoSelectEnabled,
        setAutoSelectEnabled,
        selectionMode,
        setSelectionMode,
        showTransformControls,
        setShowTransformControls,
        selectFeather,
        setSelectFeather,
        selectAntiAlias,
        setSelectAntiAlias,
        selectionModifyPixels,
        setSelectionModifyPixels,
        handleSelectionModify,
        wandTopThreshold,
        setWandTopThreshold,
        healingTopSize,
        setHealingTopSize,
        healingTopHardness,
        setHealingTopHardness,
        healingTopSampleAllLayers,
        setHealingTopSampleAllLayers,
        historyBrushTopSize,
        setHistoryBrushTopSize,
        historyBrushTopHardness,
        setHistoryBrushTopHardness,
        historyBrushTopSampleAllLayers,
        setHistoryBrushTopSampleAllLayers,
        blurTopSize,
        setBlurTopSize,
        blurTopStrength,
        setBlurTopStrength,
        blurTopSampleAllLayers,
        setBlurTopSampleAllLayers,
        sharpenTopSize,
        setSharpenTopSize,
        sharpenTopStrength,
        setSharpenTopStrength,
        sharpenTopSampleAllLayers,
        setSharpenTopSampleAllLayers,
        dodgeTopSize,
        setDodgeTopSize,
        dodgeTopExposure,
        setDodgeTopExposure,
        dodgeTopProtectTones,
        setDodgeTopProtectTones,
        cloneTopSize,
        setCloneTopSize,
        cloneTopHardness,
        setCloneTopHardness,
        cloneTopAligned,
        setCloneTopAligned,
        cloneTopSampleAllLayers,
        setCloneTopSampleAllLayers,
        cloneSourcePoint,
        setCloneSourcePoint,
        paintBrushPreset,
        setPaintBrushPreset,
        paintBrushSize,
        setPaintBrushSize,
        paintBrushHardness,
        setPaintBrushHardness,
        paintBrushOpacity,
        setPaintBrushOpacity,
        paintBrushFlow,
        setPaintBrushFlow,
        paintBrushSmoothing,
        setPaintBrushSmoothing,
        paintBlendMode,
        setPaintBlendMode,
        gradientTopType,
        gradientTopBlendMode,
        gradientTopOpacity,
        gradientTopReverse,
        gradientTopDither,
        handleGradientTypeChange,
        handleGradientBlendModeChange,
        handleGradientOpacityChange,
        handleGradientReverseChange,
        handleGradientDitherChange,
        penTopMode,
        setPenTopMode,
        penTopPathOperation,
        setPenTopPathOperation,
        penTopAutoAddDelete,
        setPenTopAutoAddDelete,
        penTopRubberBand,
        setPenTopRubberBand,
        textOptions,
        handleTextFontFamilyChange,
        handleTextFontStyleChange,
        handleTextFontSizeChange,
        handleTextColorChange,
        handleTextBoldChange,
        handleTextItalicChange,
        handleTextUnderlineChange,
        handleTextAlignChange,
        shapeTopMode,
        shapeTopFillColor,
        shapeTopStrokeColor,
        shapeTopStrokeWidth,
        shapeTopCornerRadius,
        shapeTopCanSmoothAngles,
        shapeTopFixedSize,
        handleShapeModeChange,
        handleShapeFillColorChange,
        handleShapeStrokeColorChange,
        handleShapeStrokeWidthChange,
        handleShapeCornerRadiusChange,
        handleShapeFixedSizeChange,
        cropTopRatioPreset,
        handleCropRatioPresetChange,
        cropTopDeleteOutside,
        setCropTopDeleteOutside,
        cropTopUseArtboardBounds,
        setCropTopUseArtboardBounds,
        applyTopCropSettings,
        eyedropperTopSampleSize,
        handleEyedropperSampleSizeChange,
        eyedropperTopSampleSource,
        setEyedropperTopSampleSource,
        eyedropperTopSampledColor,
        handleEyedropperSample,
        zoomTopMode,
        setZoomTopMode,
        zoomTopStep,
        handleZoomStepChange,
        handleZoomApply,
        handleFitToScreen,
        handleZoomReset,
        zoom,
        handTopLockPan,
        setHandTopLockPan,
    });

    return (
        <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
            {/* Editor Header */}
            <header className="h-16 border-b bg-card/50 backdrop-blur-xl flex items-center px-4 justify-between z-[220] relative shadow-sm overflow-visible">
                <EditorHeaderPrimary
                    designName={propDesignName || 'Untitled Design'}
                    isRenamingDesignTitle={isRenamingDesignTitle}
                    designTitleDraft={designTitleDraft}
                    onDesignTitleDraftChange={setDesignTitleDraft}
                    onCommitDesignTitle={() => { void commitDesignTitle(); }}
                    onCancelDesignTitleEdit={cancelDesignTitleEdit}
                    onStartDesignTitleEdit={() => setIsRenamingDesignTitle(true)}
                    onBack={handleBack}
                    showTopNavMenus={showTopNavMenus}
                    onToggleTopNavMenus={handleToggleTopNavMenus}
                >
                    {showTopNavMenus && (
                        <EditorHeaderMenus
                            showFileMenu={showFileMenu}
                            showEditMenu={showEditMenu}
                            showImageMenu={showImageMenu}
                            showLayerMenu={showLayerMenu}
                            showSelectMenu={showSelectMenu}
                            showFilterMenu={showFilterMenu}
                            showViewMenu={showViewMenu}
                            showWindowMenu={showWindowMenu}
                            showSettingsMenu={showSettingsMenu}
                            showHelpMenu={showHelpMenu}
                            toggleEditorMenu={toggleEditorMenu}
                            openEditorMenu={openEditorMenu}
                            setShowFileMenu={setShowFileMenu}
                            setShowEditMenu={setShowEditMenu}
                            setShowImageMenu={setShowImageMenu}
                            setShowLayerMenu={setShowLayerMenu}
                            setShowSelectMenu={setShowSelectMenu}
                            setShowFilterMenu={setShowFilterMenu}
                            setShowViewMenu={setShowViewMenu}
                            setShowWindowMenu={setShowWindowMenu}
                            setShowSettingsMenu={setShowSettingsMenu}
                            setShowHelpMenu={setShowHelpMenu}
                            handleSave={handleSave}
                            handleFitToScreen={handleFitToScreen}
                            handleResetZoomFromMenu={handleResetZoomFromMenu}
                            openPanelModeFromMenu={openPanelModeFromMenu}
                            triggerToolbarTool={triggerToolbarTool}
                            handleDuplicate={handleDuplicate}
                            handleLayerDeleteFromMenu={handleLayerDeleteFromMenu}
                            handleLayerToggleLockFromMenu={handleLayerToggleLockFromMenu}
                            menuLayerTarget={menuLayerTarget}
                            activeLayerOrderState={activeLayerOrderState}
                            handleLayerOrderAction={handleLayerOrderAction}
                            handleSelectAllFromMenu={handleSelectAllFromMenu}
                            handleDeselectFromMenu={handleDeselectFromMenu}
                            handleSelectionModify={handleSelectionModify}
                            handleUndo={handleUndo}
                            handleRedo={handleRedo}
                            historyState={historyState}
                            handleZoom={handleZoom}
                            gridType={gridType}
                            setGridType={setGridType}
                            isPropertiesPanelVisible={isPropertiesPanelVisible}
                            propertiesPanelMode={propertiesPanelMode}
                            handleWindowPanelToggle={handleWindowPanelToggle}
                            setPanelState={setPanelState}
                            panelState={panelState}
                            handleWindowDockMode={handleWindowDockMode}
                            onOpenSettings={onOpenSettings}
                            isAdminUser={isAdminUser}
                            onOpenAdminArea={onOpenAdminArea}
                            onOpenDocumentation={onOpenDocumentation}
                            handleShowShortcutsFromMenu={handleShowShortcutsFromMenu}
                            handleShowAboutFromMenu={handleShowAboutFromMenu}
                        />
                    )}
                </EditorHeaderPrimary>

                <EditorHeaderActions
                    activePalette={activePalette}
                    canvas={canvas}
                    setActivePalette={setActivePalette}
                    gridType={gridType}
                    setGridType={setGridType}
                    toggleEditorMenu={toggleEditorMenu}
                    showGridMenu={showGridMenu}
                    setShowGridMenu={setShowGridMenu}
                    shareRef={shareRef}
                    showShareMenu={showShareMenu}
                    handleShare={handleShare}
                    exportRef={exportRef}
                    showExportMenu={showExportMenu}
                    mediaOverlayEnabled={mediaOverlayEnabled}
                    setMediaOverlayEnabled={setMediaOverlayEnabled}
                    mediaOverlayPreset={mediaOverlayPreset}
                    handleMediaOverlayPresetChange={handleMediaOverlayPresetChange}
                    handleAddMediaOverlayFrame={handleAddMediaOverlayFrame}
                    handleRemoveActiveMediaOverlayFrame={handleRemoveActiveMediaOverlayFrame}
                    activeMediaOverlayFrameId={activeMediaOverlayFrameId}
                    mediaOverlayFrames={mediaOverlayFrames}
                    handleSelectMediaOverlayFrame={handleSelectMediaOverlayFrame}
                    handleToggleMediaOverlayFrameInclude={handleToggleMediaOverlayFrameInclude}
                    handleActiveMediaOverlayFrameSafeAreaPresetChange={handleActiveMediaOverlayFrameSafeAreaPresetChange}
                    mediaOverlayNamingTemplate={mediaOverlayNamingTemplate}
                    setMediaOverlayNamingTemplate={setMediaOverlayNamingTemplate}
                    mediaOverlayVariantConversionMode={mediaOverlayVariantConversionMode}
                    setMediaOverlayVariantConversionMode={setMediaOverlayVariantConversionMode}
                    handleConvertActiveMediaOverlayFrameToVariant={handleConvertActiveMediaOverlayFrameToVariant}
                    handleExport={handleExport}
                    exportMediaOverlayFramesZip={exportMediaOverlayFramesZip}
                    setShowProfileModal={setShowProfileModal}
                    profileSettings={profileSettings}
                />
            </header>

            <EditorTopToolOptionsBridge activeTool={activeTool} {...topToolOptionsBridgeProps} />

            {/* Overlays */}
            <EditorViewOverlays
                isExporting={isExporting}
                canvas={canvas}
                gridType={gridType}
                activeTool={activeTool}
                showProfileModal={showProfileModal}
                setShowProfileModal={setShowProfileModal}
                user={user}
                onLogout={onLogout}
                setProfileSettings={setProfileSettings}
                showAssetBrowserForMissing={showAssetBrowserForMissing}
                setShowAssetBrowserForMissing={setShowAssetBrowserForMissing}
                replacingItemId={replacingItemId}
                setReplacingItemId={setReplacingItemId}
                setReplacementMap={setReplacementMap}
                showMissingAssetsModal={showMissingAssetsModal}
                missingItems={missingItems}
                handleResolveMissing={handleResolveMissing}
                replacementMap={replacementMap}
                closeMissingAssetsModal={closeMissingAssetsModal}
                mediaPreview={mediaPreview}
                setMediaPreview={setMediaPreview}
                handleCaptureVideoFrame={handleCaptureVideoFrame}
                videoPreviewRef={videoPreviewRef}
                showExportQualityModal={showExportQualityModal}
                pendingExportFormat={pendingExportFormat}
                exportQualityValue={exportQualityValue}
                exportQualitySize={exportQualitySize}
                includeCanvasBackground={includeCanvasBackground}
                setExportQualityValue={setExportQualityValue}
                setIncludeCanvasBackground={setIncludeCanvasBackground}
                closeExportQualityModal={closeExportQualityModal}
                confirmPendingQualityExport={confirmPendingQualityExport}
            />

            {/* Main Editor Layout */}
            <EditorWorkspaceShell
                toolbarRef={toolbarRef}
                toolbarProps={workspaceShellToolbarProps}
                beforeWorkspace={(
                    <EditorPropertiesPanels
                        placement="before-main"
                        canvas={canvas}
                        activeTool={activeTool}
                        setActiveTool={setActiveTool}
                        chromeControls={propertiesPanelChromeControls}
                        contentControls={propertiesPanelContentControls}
                        brushControls={propertiesPanelBrushControls}
                    />
                )}
                workspace={(
                    <EditorCanvasWorkspace
                        isDraggingPanel={isDraggingPanel}
                        canvasControls={canvasWorkspaceCanvasControls}
                        threeDControls={canvasWorkspaceThreeDControls}
                        textControls={canvasWorkspaceTextControls}
                        lockOverlayControls={canvasWorkspaceLockOverlayControls}
                        cursorPreview={cursorPreview}
                        utilityControls={canvasWorkspaceUtilityControls}
                    />
                )}
                afterWorkspace={(
                    <EditorPropertiesPanels
                        placement="after-main"
                        canvas={canvas}
                        activeTool={activeTool}
                        setActiveTool={setActiveTool}
                        chromeControls={propertiesPanelChromeControls}
                        contentControls={propertiesPanelContentControls}
                        brushControls={propertiesPanelBrushControls}
                    />
                )}
                jobFooterProps={workspaceShellJobFooterProps}
                contextMenuProps={workspaceShellContextMenuProps}
            />
        </div>
    );
}
