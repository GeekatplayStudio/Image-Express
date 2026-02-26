import * as fabric from 'fabric';

export interface StarPolygon extends fabric.Polygon {
    isStar?: boolean;
    starPoints?: number;
    starInnerRadius?: number;
}

export interface ThreeDGroup extends fabric.Group {
    is3DModel?: boolean;
    modelUrl?: string;
    id?: string;
    name?: string;
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

export type AdjustmentLayerType = 'curves' | 'levels' | 'saturation-vibrance' | 'hue-saturation' | 'exposure' | 'black-white' | 'brightness-contrast' | 'color-balance' | 'light-and-color' | 'solid-color';

export type CurvesChannel = 'rgb' | 'r' | 'g' | 'b' | 'luminosity';


export type CurvePoint = { x: number; y: number };

export type CurvesAdjustmentSettings = {
    points: CurvePoint[]; // 0..1 normalized points
    channel?: CurvesChannel;
    pointsByChannel?: Partial<Record<CurvesChannel, CurvePoint[]>>;
};

export type LevelsAdjustmentSettings = {
    black: number; // 0 - 1
    mid: number; // 0.5 - 2
    white: number; // 0 - 1
};

export type BrightnessContrastSettings = { brightness: number; contrast: number };
export type ColorBalanceSettings = { red: number; green: number; blue: number; preserveLuminosity?: boolean };
export type LightAndColorSettings = { temperature: number; tint: number; exposure: number; saturation: number; vibrance: number };
export type SolidColorSettings = { color: string; opacity: number; mode?: 'tint' | 'multiply' | 'add' | 'diff' | 'screen' | 'subtract' | 'darken' | 'lighten' | 'overlay' | 'exclusion' };

export type AdjustmentLayerSettings =
    | CurvesAdjustmentSettings
    | LevelsAdjustmentSettings
    | HueSaturationSettings
    | ExposureSettings
    | SaturationVibranceSettings
    | BrightnessContrastSettings
    | ColorBalanceSettings
    | LightAndColorSettings
    | SolidColorSettings
    | Record<string, unknown>;

export type HueSaturationSettings = { hue: number; saturation: number; lightness: number };
export type ExposureSettings = { exposure: number; offset: number; gamma: number; contrast: number };
export type SaturationVibranceSettings = { saturation: number; vibrance: number };

export type LayerNode = {
    id: string;
    obj: fabric.Object;
    parentId: string | null;
    depth: number;
    children: LayerNode[];
    expanded?: boolean;
};

export interface ColorPalette {
    id: string;
    name: string;
    colors: string[];
}

export interface PenNode {
    x: number;
    y: number;
    handleIn: { x: number; y: number };
    handleOut: { x: number; y: number };
}

export type ExtendedFabricObject = fabric.Object & {
    id?: string;
    name?: string;
    gradient?: {
        type: 'linear' | 'radial';
        coords?: { x1: number; y1: number; x2: number; y2: number; r1?: number; r2?: number };
        colorStops?: Array<{ offset: number; color: string; opacity?: number }>;
        angle?: number;
    };
    pattern?: unknown;
    is3DModel?: boolean;
    modelUrl?: string; 
    isStar?: boolean;
    starPoints?: number;
    starInnerRadius?: number;
    mediaType?: 'video' | 'audio' | string;
    mediaSource?: string;
    layerTagColor?: string;
    isPenPath?: boolean;
    penMode?: 'curve' | 'line' | 'straight' | 'smooth' | 'bezier';
    penClosed?: boolean;
    penNodes?: PenNode[];
    penSourcePoints?: { x: number; y: number }[];
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _objects?: any[]; 
    isMask?: boolean;
    aiGenerated?: boolean;
    aiProvider?: string;
    threeDSettings?: ThreeDSettings;
    isAdjustmentLayer?: boolean;
    adjustmentType?: AdjustmentLayerType;
    adjustmentSettings?: AdjustmentLayerSettings;
    baseFilters?: FabricBaseFilter[];
    locked?: boolean;
    clipped?: boolean;
    cacheKey?: string;
    skewZ?: number;
    taperDirection?: number;
    curveStrength?: number;
    curveCenter?: number;
    curveSpan?: number;
    textSpellcheck?: boolean;
    textPathSourceId?: string;
    shapeDrawMode?: 'shape' | 'path' | 'pixels';
    shapeCornerRadius?: number;
    isRetouchLayer?: boolean;
    gradientTypeHint?: 'linear' | 'radial' | 'angle';
    gradientReversed?: boolean;
    gradientDitherEnabled?: boolean;
    skewZBaseScaleX?: number;
    skewZBaseScaleY?: number;
    skewZBaseSkewX?: number;
    skewZBaseSkewY?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FabricBaseFilter = any;

export interface BackgroundJob {
   id: string;
   type: 'upscale' | 'remove-bg' | 'generate-3d' | 'train-model' | 'stability-upscale' | 'stability-image' | 'image-to-3d' | 'text-to-3d';
   status: 'pending' | 'processing' | 'completed' | 'failed' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'PENDING' | 'SUCCEEDED';
   progress?: number;
   result?: unknown;
   resultUrl?: string; 
   thumbnailUrl?: string;
   error?: string;
   createdAt: number;
   apiKey?: string;
   provider?: string;
   stage?: string;
   prompt?: string;
}

export type AssetType = 'images' | 'videos' | 'audio' | 'models';
export type AssetCategory = 'uploads' | 'generated';

export interface AssetDescriptor {
    path: string;
    name: string;
    type: AssetType;
    category: AssetCategory;
    owner?: string;
    isPublic?: boolean;
    createdAt?: string;
    updatedAt?: string;
    url?: string;
}

export interface GoogleDriveConfig {
    enabled: boolean;
    clientId?: string;
    apiKey?: string;
    appId?: string;
    folderName?: string;
}

export type UserStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export interface AuthUser {
    id: string;
    email: string;
    username?: string;
    displayName: string;
    status: UserStatus;
    roles: string[];
    rights: string[];
    createdAt?: string;
    updatedAt?: string;
    approvedAt?: string;
    approvedBy?: string;
}

export interface DesktopUpdatePayload {
    version?: string;
    releaseDate?: string;
    notes?: string;
    status?: DesktopUpdateStatus;
    message?: string;
}

export type DesktopUpdateStatus = 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error' | 'checking' | 'idle' | 'restarting';
