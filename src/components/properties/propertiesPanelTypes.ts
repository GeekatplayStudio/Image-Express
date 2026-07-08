import * as fabric from 'fabric';
import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';
import type { PanelMode } from './PanelModeRail';

export interface CustomObjectState {
    _strokeEnabled?: boolean;
    _borderEnabled?: boolean;
    _strokeCachedWidth?: number;
    _borderCachedWidth?: number;
    _strokeCachedColor?: string;
    _borderCachedColor?: string;
    _strokeCachedOpacity?: number;
    _borderCachedOpacity?: number;
}

export type ArtboardRectWithBackground = fabric.Rect & {
    canvasBackgroundColor?: string;
    canvasBackgroundEnabled?: boolean;
};

export type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number; left: number; top: number };
    artboardRect?: ArtboardRectWithBackground;
    centerArtboard?: () => void;
    hostContainer?: HTMLDivElement;
    workspaceBackground?: string;
    setWorkspaceBackground?: (color: string) => void;
    getWorkspaceBackground?: () => string;
};

export interface PropertiesPanelProps {
    canvas: fabric.Canvas | null;
    activeTool: string;
    panelMode?: PanelMode;
    enablePanelRailHoverLabels?: boolean;
    onPanelModeChange?: (mode: PanelMode) => void;
    onLayerDblClick?: (obj?: fabric.Object) => void;
    onMake3D?: (imageUrl: string) => void;
    onDuplicate?: () => void;
    onAssetSelect?: (url: string, type: string, name?: string) => void;
    historyState?: { undo: number; redo: number };
    onUndo?: () => void;
    onRedo?: () => void;
    zoom?: number;
    brushOptions?: {
        brushPreset: RasterBrushPreset;
        size: number;
        hardness: number;
        opacity: number;
        flow: number;
        smoothing: number;
        blendMode: RasterBlendMode;
    };
    onBrushPresetChange?: (preset: RasterBrushPreset) => void;
    onBrushSizeChange?: (size: number) => void;
    onBrushHardnessChange?: (hardness: number) => void;
    onBrushOpacityChange?: (opacity: number) => void;
    onBrushFlowChange?: (flow: number) => void;
    onBrushSmoothingChange?: (smoothing: number) => void;
    onBrushBlendModeChange?: (mode: RasterBlendMode) => void;
    onActivatePaintTool?: () => void;
}

export const PANEL_MODE_STORAGE_KEY = 'image-express-properties-panel-mode';
export const PANEL_MODE_VALUES: PanelMode[] = [
    'layers',
    'properties',
    'history',
    'color',
    'swatches',
    'brushes',
    'channels',
    'adjustments',
    'navigator',
    'info',
];
