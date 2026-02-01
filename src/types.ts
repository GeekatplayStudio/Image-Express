import * as fabric from 'fabric';

export interface StarPolygon extends fabric.Polygon {
    isStar?: boolean;
    starPoints?: number;
    starInnerRadius?: number;
}

export interface ThreeDGroup extends fabric.Group {
    is3DModel?: boolean;
    modelUrl?: string;
}

export interface ThreeDImage extends fabric.Image {
    is3DModel?: boolean;
    modelUrl?: string;
}

export type ThreeDSettings = {
    lightPosition: { x: number; y: number; z: number };
    lightIntensity: number;
    lightColor: string;
    castShadowEnabled: boolean;
    castShadowBlur: number;
    castShadowIntensity: number;
    contactShadowEnabled: boolean;
    contactShadowBlur: number;
    contactShadowIntensity: number;
    resolution: { width: number; height: number };
    cameraPosition?: { x: number; y: number; z: number };
    cameraTarget?: { x: number; y: number; z: number };
};

export type AdjustmentLayerType = 'curves' | 'levels' | 'saturation-vibrance' | 'hue-saturation' | 'exposure' | 'black-white';

export type CurvesChannel = 'rgb' | 'r' | 'g' | 'b' | 'luminosity';

export type CurvesAdjustmentSettings = {
    points: Array<{ x: number; y: number }>; // 0..1 normalized points
    channel?: CurvesChannel;
    pointsByChannel?: Partial<Record<CurvesChannel, Array<{ x: number; y: number }>>>;
};

export type LevelsAdjustmentSettings = {
    black: number; // 0 - 1
    mid: number; // 0.5 - 2
    white: number; // 0 - 1
};

export type SaturationVibranceSettings = {
    saturation: number; // -1 to 1
    vibrance: number; // -1 to 1
};

export type HueSaturationSettings = {
    hue: number; // -1 to 1
    saturation: number; // -1 to 1
    lightness: number; // -1 to 1
};

export type ExposureSettings = {
    exposure: number; // -1 to 1
    contrast: number; // -1 to 1
};

export type AdjustmentLayerSettings = CurvesAdjustmentSettings | LevelsAdjustmentSettings | SaturationVibranceSettings | HueSaturationSettings | ExposureSettings;

export type FabricBaseFilter = fabric.filters.BaseFilter<string, Record<string, unknown>, Record<string, unknown>>;

export interface ExtendedFabricObject extends fabric.Object {
    id?: string;
    locked?: boolean;
    is3DModel?: boolean;
    name?: string;
    layerTagColor?: string;
    curveStrength?: number;
    curveCenter?: number;
    skewZ?: number;
    skewZBaseScale?: number;
    skewZBaseScaleX?: number;
    skewZBaseScaleY?: number;
    skewZBaseSkewX?: number;
    skewZBaseSkewY?: number;
    taperDirection?: number;
    taperBaseLeft?: number;
    taperBaseTop?: number;
    // absolutePositioned removed as it conflicts with base
    cacheKey?: string;
    mediaType?: 'video' | 'audio';
    mediaSource?: string;
    threeDSettings?: ThreeDSettings;
    isAdjustmentLayer?: boolean;
    adjustmentType?: AdjustmentLayerType;
    adjustmentSettings?: AdjustmentLayerSettings;
    baseFilters?: FabricBaseFilter[];
}

export interface CanvasElement {
    id: string;
    type: 'text' | 'image' | 'rect';
    properties: Record<string, unknown>;
}

export type ActiveTool = 'select' | 'text' | 'shapes' | 'paint' | 'gradient' | 'assets' | 'ai-zone' | '3d-gen' | 'templates' | 'layers';

export interface CanvasState {
    activeSelection: fabric.Object | null; // Placeholder for Fabric Object
    zoom: number;
}

export interface BackgroundJob {
    id: string; // Task ID
    type: 'text-to-3d' | 'image-to-3d' | 'stability-generate' | 'stability-inpaint' | 'stability-upscale' | 'stability-remove-bg';
    provider?: 'meshy' | 'tripo' | 'hitems' | 'stability'; // Added provider field
    status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
    progress?: number;
    prompt?: string;
    apiKey: string;
    createdAt: number;
    resultUrl?: string;
    thumbnailUrl?: string; // If available
}

export type DesktopUpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error';

export interface DesktopUpdatePayload {
    status: DesktopUpdateStatus;
    message?: string;
}

export interface GoogleDriveConfig {
    enabled: boolean;
    folderId?: string;
    folderName?: string;
    accessToken?: string;
    tokenExpiry?: number;
    clientId?: string;
}

export type AssetType = 'images' | 'models' | 'videos' | 'audio';
export type AssetCategory = 'uploads' | 'generated';

export interface AssetDescriptor {
    name: string;
    path: string;
    type: AssetType;
    category: AssetCategory;
}

export type CurvePoint = { x: number; y: number };

export type LayerNode = {
    id: string;
    obj: fabric.Object;
    parentId: string | null;
    depth: number;
    children: LayerNode[];
};

declare global {
    interface DesktopBridge {
        isDesktop?: boolean;
        checkForUpdates?: () => Promise<{ status: DesktopUpdateStatus | 'restarting'; message?: string }>;
        installUpdate?: () => Promise<{ status: string; message?: string }>;
        onUpdateStatus?: (callback: (payload: DesktopUpdatePayload) => void) => () => void;
    }

    interface Window {
        desktop?: DesktopBridge;
        gapi?: unknown;
    }
}

export {};
