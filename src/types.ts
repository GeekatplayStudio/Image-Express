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
    ambientIntensity?: number;
    environment?: string;
    envIntensity?: number;
    modelRotationY?: number;
    modelScale?: number;
};

export type ThreeDLayerMode = 'unwarp' | 'relight' | 'object' | 'vfx';

export type ThreeDLayerLight = {
    id: string;
    kind: 'point' | 'directional';
    color: string;
    intensity: number;
    /** Point lights live in normalized layer space: x/y in [0,1], z against depth. */
    x?: number;
    y?: number;
    z?: number;
    /** Windowed-quadratic falloff radius (normalized units); lit region boundary. */
    radius?: number;
    softness?: number;
    azimuth?: number;
    elevation?: number;
    shadows?: { enabled: boolean; strength: number; softness: number; range: number };
};

export type ThreeDLayerRewarpSettings = {
    feather: number;
    edgeHardness: number;
    matchColors: boolean;
    seamless: boolean;
};

export type ThreeDLayerSettings = {
    mode: ThreeDLayerMode;
    /** Asset/blob reference to the untouched source image. */
    sourceRef?: string;
    /** Normalized quad corners TL, TR, BR, BL in [0,1] of the source image. */
    corners?: [number, number][];
    aspectMode?: 'auto' | 'metric';
    /** 35mm-equivalent focal length used by the metric aspect solve. */
    focal35?: number;
    gridDivisions?: number;
    rewarp?: ThreeDLayerRewarpSettings;
    /** Edited flat (unwarped) image; rewarp re-projects this over the source. */
    flatRef?: string;
    flatSize?: { width: number; height: number };
    depthRef?: string;
    normalRef?: string;
    albedoRef?: string;
    depthSpace?: 'disparity' | 'linear';
    /** Where the depth map came from — 'fallback' means the ML model could not run. */
    depthSource?: 'model' | 'fallback';
    useGlobalLight?: boolean;
    lights?: ThreeDLayerLight[];
    ambient?: { color: string; intensity: number };
    delitMix?: number;
    modelUrl?: string;
    threeD?: ThreeDSettings;
    /** Depth-driven lens blur (VFX), applied after relight. */
    lensBlur?: {
        enabled: boolean;
        focusX: number;         // [0,1] image UV of the focus point
        focusY: number;
        focalOffset: number;    // [-1,1] shift of the sampled focal depth
        strength: number;       // [0,1] -> max blur radius
        fieldOfDepth: number;   // [0,1] in-focus band width
    };
    /** Object-mode bake parameters (live GLB layer). */
    object?: {
        rotationY?: number;
        rotationX?: number;
        scale?: number;
        cameraFovV?: number;
        cameraElevation?: number;
        cameraDistance?: number;
        shadowOpacity?: number;
    };
};

export type AdjustmentLayerType = 'curves' | 'levels' | 'saturation-vibrance' | 'hue-saturation' | 'exposure' | 'black-white' | 'brightness-contrast' | 'color-balance' | 'light-and-color' | 'solid-color';

export type CurvesChannel = 'rgb' | 'r' | 'g' | 'b' | 'luminosity';
export type CurvesPickerTarget = 'shadow' | 'midtone' | 'highlight';


export type CurvePoint = { x: number; y: number };

export type CurvesAdjustmentSettings = {
    points: CurvePoint[]; // 0..1 normalized points
    channel?: CurvesChannel;
    pointsByChannel?: Partial<Record<CurvesChannel, CurvePoint[]>>;
    pickerTarget?: CurvesPickerTarget;
    pickerColors?: Partial<Record<CurvesPickerTarget, string>>;
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
    aiReferenceLayer?: boolean;
    aiEditPlanData?: {
        createdAt: string;
        sourceLayerId: string;
        sourceLayerLabel?: string;
        globalPrompt: {
            positive: string;
            negative: string;
        };
        compiledPrompts: {
            positive: string;
            negative: string;
        };
        annotations: Array<{
            id: string;
            type: string;
            instruction: string;
            mode?: string;
            strength?: number;
            geometry: unknown;
        }>;
    };
    threeDSettings?: ThreeDSettings;
    /** Live re-editable 3D layer (unwarp / relight / object / vfx). */
    is3DLayer?: boolean;
    threeDLayerSettings?: ThreeDLayerSettings;
    isAdjustmentLayer?: boolean;
    adjustmentType?: AdjustmentLayerType;
    adjustmentSettings?: AdjustmentLayerSettings;
    baseFilters?: FabricBaseFilter[];
    channelSettings?: {
        mode?: string;
        target?: string;
        opacities?: Record<string, number>;
        masks?: Record<string, boolean>;
    };
    locked?: boolean;
    clipped?: boolean;
    /** Photoshop-style clipping mask: this layer is clipped to the visual layer below it. */
    isClippedToBelow?: boolean;
    /** Object id of the base layer this layer's clip mask was built from. */
    clipSourceId?: string;
    /** Set while a layer's mask shape is detached onto the canvas for editing. */
    isMaskEditing?: boolean;
    /** The shared raster paint layer that brush strokes are stamped onto. */
    isPaintLayer?: boolean;
    /** Object id of the layer a detached mask belongs to. */
    maskTargetId?: string;
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
    backsideBaseFlipX?: boolean;
    pseudoBacksidePreset?: 'front' | 'back';
    textBgEnabled?: boolean;
    textBgColor?: string;
    textBgPadding?: number;
    textBgCorners?: number;
    textBgStyle?: 'rect' | 'pill' | 'speech';
    /** Shared-layer id: layers with the same sharedLayerId are linked across
     *  canvases in the project; adjustment settings propagate globally. */
    sharedLayerId?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FabricBaseFilter = any;

export type BackgroundJobType =
    | 'upscale'
    | 'remove-bg'
    | 'generate-3d'
    | 'train-model'
    | 'stability-upscale'
    | 'stability-image'
    | 'image-to-3d'
    | 'text-to-3d'
    | 'hitems-relief'
    | 'hitems-split';

export type BackgroundJobStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'FAILED'
    | 'PENDING'
    | 'SUCCEEDED'
    | 'CANCELLED';

export type BackgroundJobRequest =
    | {
        provider: 'meshy';
        mode: 'text';
        prompt: string;
    }
    | {
        provider: 'meshy';
        mode: 'image';
        imageUrl: string;
    }
    | {
        provider: 'tripo';
        mode: 'text';
        prompt: string;
    }
    | {
        provider: 'tripo';
        mode: 'image';
        imageUrl: string;
    }
    | {
        provider: 'hitems';
        mode: 'image';
        imageUrl: string;
        model: string;
        requestType: string;
        resolution: string;
        format: string;
        face?: string;
        meshUrl?: string;
        pbr?: boolean;
        extraImageUrls?: string[];
        multiImagesBit?: string;
    }
    | {
        provider: 'stability';
        mode: 'upscale';
        imageUrl: string;
        upscaleType: 'conservative' | 'creative';
        prompt?: string;
    };

export interface BackgroundJob {
   id: string;
   type: BackgroundJobType;
   status: BackgroundJobStatus;
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
    request?: BackgroundJobRequest;
    /**
     * Queue job driving this task server-side. When set, the browser must not
     * poll: the server owns the loop, so the job survives this tab closing.
     * Absent for guests, whose keys never reach the server.
     */
    queueJobId?: string;
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
    sessionToken?: string;
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
