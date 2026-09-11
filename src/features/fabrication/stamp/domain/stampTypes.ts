/**
 * 3D Stamp Tool - Domain Types
 * Configuration and structural types for stamp die, podium, handle, and export.
 */

export type StampType = 'rubber-stamp' | 'wax-seal' | 'die-only';

export type PodiumShape = 'rectangular' | 'circular' | 'oval';

export type HandleStyle =
    | 'classic-wood'
    | 'wax-seal-turned'
    | 'desk-knob'
    | 'minimal-block'
    | 'none';

export type ArtworkInputMode = 'text' | 'image' | 'preset';

export type ReliefMode = 'emboss' | 'deboss';

export type BorderStyle = 'none' | 'single' | 'double' | 'coin-beaded';

export type StampMaterialTheme =
    | 'rubber-wood'
    | 'wax-brass-wood'
    | 'white-filament'
    | 'gold-ebony'
    | 'slate-resin'
    | 'wireframe';

export type StampExportFormat = 'stl-binary' | 'stl-ascii' | 'obj' | 'glb';

export type StampExportTarget = 'complete' | 'die-plate' | 'handle';

export type TextArcMode = 'straight' | 'circular-arc' | 'top-bottom-arc';

export interface StampTextConfig {
    primaryText: string;
    secondaryText: string;
    arcMode: TextArcMode;
    fontFamily: string;
    fontSize: number;
    letterSpacing: number;
    isBold: boolean;
    isItalic: boolean;
    centerIcon?: string;
}

export interface StampArtworkConfig {
    mode: ArtworkInputMode;
    text: StampTextConfig;
    imageUrl?: string;
    presetId?: string;
    invertRelief: boolean;       // Inverts dark/light height mapping
    flipHorizontal: boolean;     // Essential for stamps so stamping produces correct left-to-right text
    threshold: number;          // 0 - 255 binarization (128 default)
    useContinuousGrayscale: boolean; // Continuous heightmap vs sharp binary relief
    smoothRadius: number;       // Anti-aliasing blur radius in pixels (0 - 4)
    borderStyle: BorderStyle;
    borderThicknessMm: number;
    borderInsetMm: number;
}

export interface StampDimensions {
    widthMm: number;             // X axis / diameter
    depthMm: number;             // Z axis / length
    podiumThicknessMm: number;   // Thickness of backing plate (3 - 15mm)
    handleHeightMm: number;      // Total handle height (20 - 80mm)
    reliefDepthMm: number;       // Height of raised/engraved die artwork (1 - 4mm)
    basePlateThicknessMm: number;// Thickness of rubber/brass die base (1 - 3mm)
    draftAngleDeg: number;       // Draft angle for clean stamping/demolding (0 - 15 deg)
    cornerRadiusMm: number;      // For rectangular podiums
}

export interface StampConfig {
    stampType: StampType;
    podiumShape: PodiumShape;
    handleStyle: HandleStyle;
    dimensions: StampDimensions;
    artwork: StampArtworkConfig;
    materialTheme: StampMaterialTheme;
}

export interface StampModelMetrics {
    widthMm: number;
    depthMm: number;
    totalHeightMm: number;
    reliefDepthMm: number;
    triangleCount: number;
    vertexCount: number;
    isManifold: boolean;
}

export const DEFAULT_STAMP_CONFIG: StampConfig = {
    stampType: 'rubber-stamp',
    podiumShape: 'rectangular',
    handleStyle: 'classic-wood',
    dimensions: {
        widthMm: 50,
        depthMm: 35,
        podiumThicknessMm: 6,
        handleHeightMm: 55,
        reliefDepthMm: 2.0,
        basePlateThicknessMm: 1.5,
        draftAngleDeg: 8,
        cornerRadiusMm: 4,
    },
    artwork: {
        mode: 'text',
        text: {
            primaryText: 'APPROVED',
            secondaryText: 'CONFIDENTIAL',
            arcMode: 'straight',
            fontFamily: 'Inter',
            fontSize: 42,
            letterSpacing: 2,
            isBold: true,
            isItalic: false,
        },
        invertRelief: false,
        flipHorizontal: true, // Default to true so physical stamping is correct
        threshold: 128,
        useContinuousGrayscale: false,
        smoothRadius: 1.2,
        borderStyle: 'double',
        borderThicknessMm: 1.2,
        borderInsetMm: 1.5,
    },
    materialTheme: 'rubber-wood',
};
