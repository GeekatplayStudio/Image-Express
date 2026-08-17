export type CricutPoint = { x: number; y: number };

export type CricutTraceOptions = {
    threshold: number;
    invert: boolean;
    simplifyToleranceMm: number;
    minimumFeatureAreaMm2: number;
    designWidthMm: number;
    scalePercent: number;
    maxTraceDimension?: number;
};

export type CricutSheetOptions = {
    widthMm: number;
    heightMm: number;
    marginMm: number;
    gapMm: number;
    allowRotation: boolean;
};

export type CricutLayerOptions = {
    enabled: boolean;
    targetDepthMm: number;
    materialThicknessMm: number;
    registrationMarks: boolean;
    registrationDiameterMm: number;
};

export type CricutExportOptions = CricutTraceOptions & CricutSheetOptions & CricutLayerOptions;

export type CricutContour = {
    points: CricutPoint[];
    areaMm2: number;
};

export type CricutPart = {
    id: string;
    componentIndex: number;
    layerIndex: number;
    layerDepthMm: number;
    widthMm: number;
    heightMm: number;
    contours: CricutContour[];
    registrationAnchors: CricutPoint[];
};

export type CricutPlacement = {
    part: CricutPart;
    xMm: number;
    yMm: number;
    rotated: boolean;
    packedWidthMm: number;
    packedHeightMm: number;
};

export type CricutSheet = {
    index: number;
    widthMm: number;
    heightMm: number;
    placements: CricutPlacement[];
    usedAreaMm2: number;
    svg: string;
};

export type CricutPlan = {
    sourceWidthPx: number;
    sourceHeightPx: number;
    traceWidthPx: number;
    traceHeightPx: number;
    outputWidthMm: number;
    outputHeightMm: number;
    layerCount: number;
    parts: CricutPart[];
    sheets: CricutSheet[];
    nodeCount: number;
    originalNodeCount: number;
    materialAreaMm2: number;
    occupiedAreaMm2: number;
    utilizationPercent: number;
    monochromeDataUrl: string;
};

export type TracedComponent = {
    contours: CricutContour[];
    widthMm: number;
    heightMm: number;
    registrationAnchors: CricutPoint[];
    originalNodeCount: number;
};

export type CricutTraceResult = {
    sourceWidthPx: number;
    sourceHeightPx: number;
    traceWidthPx: number;
    traceHeightPx: number;
    outputWidthMm: number;
    outputHeightMm: number;
    components: TracedComponent[];
    monochromeDataUrl: string;
};
