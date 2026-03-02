export type AnnotationType = 'point' | 'box' | 'polygon' | 'brush' | 'pose' | 'text';
export type AnnotationMode = 'auto' | 'inpaint' | 'replace' | 'style' | 'pose' | 'text';

export interface NormalizedPoint {
    x: number;
    y: number;
}

export interface PointGeometry {
    x: number;
    y: number;
}

export interface BoxGeometry {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PolygonGeometry {
    points: NormalizedPoint[];
}

export interface BrushStroke {
    points: NormalizedPoint[];
    size: number;
}

export interface BrushGeometry {
    boundingBox: BoxGeometry;
    strokes: BrushStroke[];
}

export interface PoseGeometry {
    points: NormalizedPoint[];
}

export interface AnnotationRecord {
    id: string;
    type: AnnotationType;
    enabled: boolean;
    priority: number;
    geometry: PointGeometry | BoxGeometry | PolygonGeometry | BrushGeometry | PoseGeometry;
    instruction: string;
    mode?: AnnotationMode;
    strength?: number;
    negative?: string;
    tags?: string[];
}

export interface ReferenceRecord {
    id: string;
    role: 'style' | 'character' | 'pose' | 'background' | 'other';
}

export interface ProviderSelection {
    name: string;
    model: string;
    params: {
        seed?: number;
        steps?: number;
        cfg?: number;
        [key: string]: unknown;
    };
}

export interface AnnotationDocument {
    image: {
        id: string;
        width: number;
        height: number;
    };
    annotations: AnnotationRecord[];
    globalPrompt: {
        positive: string;
        negative: string;
    };
    references: ReferenceRecord[];
    provider: ProviderSelection;
}

export interface CompiledPrompts {
    positive: string;
    negative: string;
}

export interface GenerateJobState {
    id: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed';
    progress: number;
    message: string;
    createdAt: string;
    updatedAt: string;
    resultImageUrl?: string;
    error?: string;
}
