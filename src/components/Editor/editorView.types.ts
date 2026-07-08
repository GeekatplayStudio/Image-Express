import * as fabric from 'fabric';
import type { ExtendedFabricObject } from '@/types';
import type { RetouchBounds } from '@/lib/retouch-engine';

export interface MissingItem {
    id: string;
    type: 'image' | 'model';
    originalSrc: string;
}

export type PanelDockMode = 'docked-left' | 'docked-right' | 'floating' | 'collapsed-left' | 'collapsed-right';

export type ArtboardRectWithBackground = fabric.Rect & {
    canvasBackgroundColor?: string;
    canvasBackgroundEnabled?: boolean;
};

export type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number; left: number; top: number };
    artboardRect?: ArtboardRectWithBackground;
    centerArtboard?: () => void;
};

export type MarqueeSelectionHelper = fabric.Rect & {
    isSelectionOverlayHelper?: boolean;
};

export type LassoSelectionHelper = fabric.Path & {
    isSelectionOverlayHelper?: boolean;
};

export type CanvasWithExportInternals = fabric.Canvas & {
    disposed?: boolean;
    destroyed?: boolean;
    toCanvasElement?: (
        multiplier?: number,
        options?: fabric.TToCanvasElementOptions,
    ) => HTMLCanvasElement;
    elements?: {
        upper?: { ctx?: CanvasRenderingContext2D; el?: HTMLCanvasElement };
        lower?: { el?: HTMLCanvasElement };
    };
    lowerCanvasEl?: HTMLCanvasElement;
    getElement?: () => HTMLCanvasElement;
};

export type ExportDataUrlOptions = fabric.TDataUrlOptions & {
    backgroundColor?: string;
};

export type RetouchLayerState = {
    bounds: RetouchBounds;
    layerCanvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    image: fabric.Image & ExtendedFabricObject;
};

export type RectBounds = {
    left: number;
    top: number;
    width: number;
    height: number;
};

export type LockedLayerOverlayEntry = {
    id: string;
    object: fabric.Object & ExtendedFabricObject;
    paintOrder: number;
    sceneBounds: RectBounds;
    viewportBounds: RectBounds;
    iconBounds: RectBounds;
};

export type CanvasLockControl = {
    id: string;
    object: fabric.Object & ExtendedFabricObject;
    locked: boolean;
    buttonBounds: RectBounds;
    label: string;
};

export type SerializedFill = {
    src?: string;
    source?: string;
    colorStops?: Array<{ src?: string }>;
};

export type SerializedObject = {
    type?: string;
    src?: string;
    modelUrl?: string;
    mediaType?: 'video' | 'audio' | string;
    mediaSource?: string;
    name?: string;
    is3DModel?: boolean;
    clipPath?: SerializedObject;
    objects?: SerializedObject[];
    paths?: SerializedObject[];
    fill?: unknown;
    stroke?: unknown;
    backgroundColor?: unknown;
    overlayFill?: unknown;
    [key: string]: unknown;
};

export type DesignJson = {
    objects?: SerializedObject[];
    backgroundImage?: { src?: string };
    overlayImage?: { src?: string };
    clipPath?: SerializedObject;
    metadata?: unknown;
    [key: string]: unknown;
};
