export type Point2 = { x: number; y: number };
export type Point3 = { x: number; y: number; z: number };

export type MeshTriangle = {
    id: number;
    points: [Point3, Point3, Point3];
};

export type FlatFace = {
    faceId: number;
    points: [Point2, Point2, Point2];
    vertexKeys: [string, string, string];
};

export type FlatEdge = {
    a: Point2;
    b: Point2;
    edgeKey: string;
    faceId: number;
    seam: boolean;
    tab: boolean;
};

export type FoldLine = {
    a: Point2;
    b: Point2;
    edgeKey: string;
    foldAngleDegrees: number;
    foldDirection: 'mountain' | 'valley' | 'flat';
};

export type PapercraftIsland = {
    id: number;
    faces: FlatFace[];
    cuts: FlatEdge[];
    folds: FoldLine[];
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type PapercraftSheet = {
    index: number;
    widthMm: number;
    heightMm: number;
    svg: string;
    islandCount: number;
};

export type PapercraftPlan = {
    sourceFaceCount: number;
    unfoldedFaceCount: number;
    islandCount: number;
    sheets: PapercraftSheet[];
    modelScaleMm: number;
    intelligence: {
        strategy: string;
        candidatesEvaluated: number;
        foldBackConfidence: number;
        surfaceCoverage: number;
        edgeFidelity: number;
        areaFidelity: number;
        topologyCoverage: number;
        foldInstructionCoverage: number;
        watertight: boolean;
    };
};

export type PapercraftOptions = {
    maxFaces: number;
    modelSizeMm: number;
    sheetWidthMm: number;
    sheetHeightMm: number;
    marginMm: number;
    gapMm: number;
    tabDepthMm: number;
};

export const DEFAULT_PAPERCRAFT_OPTIONS: PapercraftOptions = {
    maxFaces: 80,
    modelSizeMm: 180,
    sheetWidthMm: 210,
    sheetHeightMm: 297,
    marginMm: 10,
    gapMm: 5,
    tabDepthMm: 5,
};
