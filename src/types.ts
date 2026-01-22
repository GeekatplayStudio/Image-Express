import * as fabric from 'fabric';

export interface StarPolygon extends fabric.Polygon {
    isStar?: boolean;
    starPoints?: number;
    starInnerRadius?: number;
}

export interface CanvasElement {
    id: string;
    type: 'text' | 'image' | 'rect';
    properties: any;
}

export type ActiveTool = 'select' | 'text' | 'rect' | 'circle';

export interface CanvasState {
    activeSelection: any | null; // Placeholder for Fabric Object
    zoom: number;
}
