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

export interface CanvasElement {
    id: string;
    type: 'text' | 'image' | 'rect';
    properties: Record<string, unknown>;
}

export type ActiveTool = 'select' | 'text' | 'rect' | 'circle';

export interface CanvasState {
    activeSelection: fabric.Object | null; // Placeholder for Fabric Object
    zoom: number;
}

export interface BackgroundJob {
    id: string; // Task ID
    type: 'text-to-3d' | 'image-to-3d';
    provider?: 'meshy' | 'tripo' | 'hitems'; // Added provider field
    status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
    progress?: number;
    prompt?: string;
    apiKey: string;
    createdAt: number;
    resultUrl?: string;
    thumbnailUrl?: string; // If available
}
