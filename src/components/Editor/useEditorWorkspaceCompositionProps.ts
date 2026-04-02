import type { Dispatch, DragEvent, SetStateAction } from 'react';
import type * as fabric from 'fabric';

import type { ColorPalette } from '@/types';
import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';
import type { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';
import type { CanvasLockControl, LockedLayerOverlayEntry, PanelDockMode } from '@/components/Editor/editorView.types';

type UseEditorWorkspaceCompositionPropsArgs<TJob extends { id: string }> = {
    canvas: fabric.Canvas | null;
    activeTool: string;
    user: string;
    activePalette: ColorPalette | null;
    setActivePalette: Dispatch<SetStateAction<ColorPalette | null>>;
    handleToolbarToolChange: (toolName: string) => void;
    handleRequestPropertiesPanel: (mode?: PanelRailMode) => void;
    handleOpenThreeDEditor: (url: string) => void;
    apiKeys: Record<string, string | undefined>;
    zoomTopMode: 'in' | 'out';
    expandToolRailLabelsOnHover: boolean;
    backgroundJobs: TJob[];
    setBackgroundJobs: Dispatch<SetStateAction<TJob[]>>;
    contextMenu: { x: number; y: number; isOpen: boolean };
    handleCloseContextMenu: () => void;
    triggerToolbarTool: (toolName: string) => void;
    handleLayerOrderAction: (action: 'move-up' | 'move-down' | 'to-front' | 'to-back') => void;
    activeLayerOrderState: { canMoveUp: boolean; canMoveDown: boolean; canBringToFront: boolean; canSendToBack: boolean };
    bottomRightUtilityStyle: { right: string; bottom: string };
    zoom: number;
    utilityCanvasSize: { width: number; height: number };
    gridStatusLabel: string;
    handleZoom: (delta: number) => void;
    handleFitToScreen: () => void;
    handleResetZoomFromWorkspace: () => void;
    lockedLayerOverlayEntries: LockedLayerOverlayEntry[];
    canvasLockControl: CanvasLockControl | null;
    hoveredLockedLayerId: string | null;
    setHoveredLockedLayerId: Dispatch<SetStateAction<string | null>>;
    setObjectLockedFromCanvasOverlay: (obj: NonNullable<CanvasLockControl>['object'], locked: boolean) => void;
    textQuickBarPos: { visible: boolean; left: number; top: number };
    textOptions: {
        fontFamily: string;
        fontFamilies: string[];
        fontStyle: string;
        fontStyles: string[];
        fontSize: number;
        color: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
        align: 'left' | 'center' | 'right' | 'justify';
        spellcheck: boolean;
    };
    handleTextFontFamilyChange: (value: string) => void;
    handleTextFontStyleChange: (value: string) => void;
    handleTextFontSizeChange: (value: number) => void;
    handleTextColorChange: (value: string) => void;
    handleTextBoldChange: (value: boolean) => void;
    handleTextItalicChange: (value: boolean) => void;
    handleTextUnderlineChange: (value: boolean) => void;
    handleTextAlignChange: (value: 'left' | 'center' | 'right' | 'justify') => void;
    handleTextSpellcheckChange: (value: boolean) => void;
    handleFileDrop: (event: DragEvent) => void | Promise<void>;
    handleOpenWorkspaceContextMenu: (x: number, y: number) => void;
    setCanvas: Dispatch<SetStateAction<fabric.Canvas | null>>;
    handleCanvasModified: () => void;
    initialSize?: { width: number; height: number } | null;
    handleRightClick: (event: MouseEvent) => void;
    panelState: { mode: PanelDockMode; position: { x: number; y: number }; width: number };
    propertiesPanelMode: PanelRailMode;
    setPropertiesPanelMode: Dispatch<SetStateAction<PanelRailMode>>;
    handlePanelDragStart: (event: React.MouseEvent) => void;
    startPanelResize: (event: React.MouseEvent) => void;
    toggleCollapse: () => void;
    toggleFloat: () => void;
    handleDuplicate: () => void;
    handleAssetSelect: (url: string, type: string, name?: string) => void;
    historyState: { undo: number; redo: number };
    handleUndo: () => void;
    handleRedo: () => void;
    handleOpenThreeDFromPanel: (imageUrl: string) => void;
    paintBrushPreset: RasterBrushPreset;
    paintBrushSize: number;
    paintBrushHardness: number;
    paintBrushOpacity: number;
    paintBrushFlow: number;
    paintBrushSmoothing: number;
    paintBlendMode: RasterBlendMode;
    setPaintBrushPreset: Dispatch<SetStateAction<RasterBrushPreset>>;
    setPaintBrushSize: (value: number) => void;
    setPaintBrushHardness: (value: number) => void;
    setPaintBrushOpacity: (value: number) => void;
    setPaintBrushFlow: (value: number) => void;
    setPaintBrushSmoothing: (value: number) => void;
    setPaintBlendMode: Dispatch<SetStateAction<RasterBlendMode>>;
};

export function useEditorWorkspaceCompositionProps<TJob extends { id: string }>(args: UseEditorWorkspaceCompositionPropsArgs<TJob>) {
    const {
        canvas,
        activeTool,
        user,
        activePalette,
        setActivePalette,
        handleToolbarToolChange,
        handleRequestPropertiesPanel,
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
    } = args;

    const propertiesPanelChromeControls = {
        panelState,
        propertiesPanelMode,
        setPropertiesPanelMode,
        handlePanelDragStart,
        startPanelResize,
        toggleCollapse,
        toggleFloat,
    };

    const propertiesPanelContentControls = {
        handleDuplicate,
        handleAssetSelect,
        historyState,
        handleUndo,
        handleRedo,
        zoom,
        enablePanelRailHoverLabels: expandToolRailLabelsOnHover,
        onOpenThreeDFromSelection: handleOpenThreeDFromPanel,
    };

    const propertiesPanelBrushControls = {
        brushOptions: {
            brushPreset: paintBrushPreset,
            size: paintBrushSize,
            hardness: paintBrushHardness,
            opacity: paintBrushOpacity,
            flow: paintBrushFlow,
            smoothing: paintBrushSmoothing,
            blendMode: paintBlendMode,
        },
        onBrushPresetChange: setPaintBrushPreset,
        onBrushSizeChange: setPaintBrushSize,
        onBrushHardnessChange: setPaintBrushHardness,
        onBrushOpacityChange: setPaintBrushOpacity,
        onBrushFlowChange: setPaintBrushFlow,
        onBrushSmoothingChange: setPaintBrushSmoothing,
        onBrushBlendModeChange: setPaintBlendMode,
    };

    const canvasWorkspaceCanvasControls = {
        onFileDrop: handleFileDrop,
        onOpenWorkspaceContextMenu: handleOpenWorkspaceContextMenu,
        onCanvasReady: setCanvas,
        onModified: handleCanvasModified,
        initialWidth: initialSize?.width,
        initialHeight: initialSize?.height,
        onRightClick: handleRightClick,
    };

    const canvasWorkspaceTextControls = {
        visible: textQuickBarPos.visible,
        left: textQuickBarPos.left,
        top: textQuickBarPos.top,
        textOptions,
        onTextFontFamilyChange: handleTextFontFamilyChange,
        onTextFontStyleChange: handleTextFontStyleChange,
        onTextFontSizeChange: handleTextFontSizeChange,
        onTextColorChange: handleTextColorChange,
        onTextBoldChange: handleTextBoldChange,
        onTextItalicChange: handleTextItalicChange,
        onTextUnderlineChange: handleTextUnderlineChange,
        onTextAlignChange: handleTextAlignChange,
        onTextSpellcheckChange: handleTextSpellcheckChange,
    };

    const canvasWorkspaceLockOverlayControls = {
        lockedLayerOverlayEntries,
        canvasLockControl,
        hoveredLockedLayerId,
        setHoveredLockedLayerId,
        onSetObjectLocked: setObjectLockedFromCanvasOverlay,
    };

    const canvasWorkspaceUtilityControls = {
        bottomRightUtilityStyle,
        zoom,
        utilityCanvasSize,
        gridStatusLabel,
        onZoomOut: () => handleZoom(-0.1),
        onZoomIn: () => handleZoom(0.1),
        onFitToScreen: handleFitToScreen,
        onResetZoom: handleResetZoomFromWorkspace,
    };

    const workspaceShellToolbarProps = {
        canvas,
        activeTool,
        currentUser: user,
        activePalette,
        setActivePalette,
        setActiveTool: handleToolbarToolChange,
        onRequestPropertiesPanel: handleRequestPropertiesPanel,
        onOpen3DEditor: handleOpenThreeDEditor,
        apiKeys,
        zoomCursorMode: zoomTopMode,
        enableHoverLabels: expandToolRailLabelsOnHover,
    };

    const workspaceShellJobFooterProps = {
        jobs: backgroundJobs,
        onClear: (jobId: string) => {
            setBackgroundJobs((prev) => prev.filter((job) => job.id !== jobId));
        },
    };

    const workspaceShellContextMenuProps = {
        x: contextMenu.x,
        y: contextMenu.y,
        isOpen: contextMenu.isOpen,
        activeTool,
        activePanelMode: propertiesPanelMode,
        onClose: handleCloseContextMenu,
        onSelectTool: triggerToolbarTool,
        onLayerOrderAction: handleLayerOrderAction,
        layerOrderState: {
            enabled:
                activeLayerOrderState.canMoveUp ||
                activeLayerOrderState.canMoveDown ||
                activeLayerOrderState.canBringToFront ||
                activeLayerOrderState.canSendToBack,
            ...activeLayerOrderState,
        },
    };

    return {
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
    };
}
