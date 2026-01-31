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
