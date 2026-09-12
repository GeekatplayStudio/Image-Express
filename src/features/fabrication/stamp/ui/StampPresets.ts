/**
 * 3D Stamp Tool - Curated Presets
 * Pre-configured real-world stamp designs: Desk Rubber Stamps & Wax Seals.
 */

import { StampArtworkConfig, StampConfig, StampDimensions } from '../domain/stampTypes';

export type PartialStampConfig = Partial<Omit<StampConfig, 'artwork' | 'dimensions'>> & {
    dimensions?: Partial<StampDimensions>;
    artwork?: Partial<StampArtworkConfig>;
};

export interface StampPresetDefinition {
    id: string;
    titleKey: string;
    descriptionKey: string;
    category: 'rubber-stamp' | 'wax-seal';
    config: PartialStampConfig;
}

export const STAMP_PRESETS: StampPresetDefinition[] = [
    {
        id: 'approved-classic',
        titleKey: 'stamp.preset.approved.title',
        descriptionKey: 'stamp.preset.approved.desc',
        category: 'rubber-stamp',
        config: {
            stampType: 'rubber-stamp',
            podiumShape: 'rectangular',
            handleStyle: 'classic-wood',
            materialTheme: 'rubber-wood',
            dimensions: {
                widthMm: 55,
                depthMm: 35,
                podiumThicknessMm: 7,
                handleHeightMm: 58,
                reliefDepthMm: 2.2,
                basePlateThicknessMm: 1.5,
                draftAngleDeg: 8,
                cornerRadiusMm: 4,
            },
            artwork: {
                mode: 'text',
                text: {
                    primaryText: 'APPROVED',
                    secondaryText: 'VERIFIED & AUDITED',
                    arcMode: 'straight',
                    fontFamily: 'Inter',
                    fontSize: 40,
                    letterSpacing: 3,
                    isBold: true,
                    isItalic: false,
                },
                invertRelief: false,
                flipHorizontal: true,
                threshold: 128,
                useContinuousGrayscale: false,
                smoothRadius: 1.2,
                borderStyle: 'double',
                borderThicknessMm: 1.5,
                borderInsetMm: 1.8,
            },
        },
    },
    {
        id: 'confidential-red',
        titleKey: 'stamp.preset.confidential.title',
        descriptionKey: 'stamp.preset.confidential.desc',
        category: 'rubber-stamp',
        config: {
            stampType: 'rubber-stamp',
            podiumShape: 'rectangular',
            handleStyle: 'classic-wood',
            materialTheme: 'rubber-wood',
            dimensions: {
                widthMm: 65,
                depthMm: 30,
                podiumThicknessMm: 6,
                handleHeightMm: 55,
                reliefDepthMm: 2.0,
                basePlateThicknessMm: 1.5,
                draftAngleDeg: 8,
                cornerRadiusMm: 3,
            },
            artwork: {
                mode: 'text',
                text: {
                    primaryText: 'CONFIDENTIAL',
                    secondaryText: 'DO NOT DISTRIBUTE',
                    arcMode: 'straight',
                    fontFamily: 'Montserrat',
                    fontSize: 36,
                    letterSpacing: 4,
                    isBold: true,
                    isItalic: false,
                },
                invertRelief: false,
                flipHorizontal: true,
                threshold: 128,
                useContinuousGrayscale: false,
                smoothRadius: 1.2,
                borderStyle: 'single',
                borderThicknessMm: 2.0,
                borderInsetMm: 1.5,
            },
        },
    },
    {
        id: 'wax-seal-monogram',
        titleKey: 'stamp.preset.waxMonogram.title',
        descriptionKey: 'stamp.preset.waxMonogram.desc',
        category: 'wax-seal',
        config: {
            stampType: 'wax-seal',
            podiumShape: 'circular',
            handleStyle: 'wax-seal-turned',
            materialTheme: 'wax-brass-wood',
            dimensions: {
                widthMm: 32,
                depthMm: 32,
                podiumThicknessMm: 8,
                handleHeightMm: 68,
                reliefDepthMm: 1.8,
                basePlateThicknessMm: 2.0,
                draftAngleDeg: 10,
                cornerRadiusMm: 3,
            },
            artwork: {
                mode: 'text',
                text: {
                    primaryText: 'EX LIBRIS',
                    secondaryText: 'ARCHIVE',
                    arcMode: 'circular-arc',
                    fontFamily: 'Playfair Display',
                    fontSize: 32,
                    letterSpacing: 2,
                    isBold: true,
                    isItalic: false,
                    centerIcon: '★',
                },
                invertRelief: true, // Wax seals are intaglio engraved
                flipHorizontal: true,
                threshold: 128,
                useContinuousGrayscale: false,
                smoothRadius: 1.5,
                borderStyle: 'coin-beaded',
                borderThicknessMm: 1.8,
                borderInsetMm: 1.5,
            },
        },
    },
    {
        id: 'official-notary-seal',
        titleKey: 'stamp.preset.notary.title',
        descriptionKey: 'stamp.preset.notary.desc',
        category: 'wax-seal',
        config: {
            stampType: 'wax-seal',
            podiumShape: 'circular',
            handleStyle: 'wax-seal-turned',
            materialTheme: 'wax-brass-wood',
            dimensions: {
                widthMm: 38,
                depthMm: 38,
                podiumThicknessMm: 7,
                handleHeightMm: 70,
                reliefDepthMm: 1.6,
                basePlateThicknessMm: 2.0,
                draftAngleDeg: 9,
                cornerRadiusMm: 3,
            },
            artwork: {
                mode: 'text',
                text: {
                    primaryText: 'OFFICIAL NOTARY PUBLIC',
                    secondaryText: 'AUTHENTIC SEAL',
                    arcMode: 'top-bottom-arc',
                    fontFamily: 'Montserrat',
                    fontSize: 26,
                    letterSpacing: 2,
                    isBold: true,
                    isItalic: false,
                    centerIcon: '✦',
                },
                invertRelief: true,
                flipHorizontal: true,
                threshold: 130,
                useContinuousGrayscale: false,
                smoothRadius: 1.4,
                borderStyle: 'double',
                borderThicknessMm: 1.4,
                borderInsetMm: 1.6,
            },
        },
    },
];
