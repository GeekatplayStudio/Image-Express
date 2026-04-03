import type { ThemeAccentPreset } from '@/lib/themePreferences';

export type AppThemeTokens = {
    primaryHex: string;
    primarySoftHex: string;
    shapeDefaultFillHex: string;
    zoneOverlayFill: string;
    zoneStroke: string;
    curveDefaultStroke: string;
    circularMenuColors: {
        select: string;
        marquee: string;
        lasso: string;
        wand: string;
        pathSelect: string;
        layers: string;
        healing: string;
        cloneStamp: string;
        historyBrush: string;
        clone: string;
        history: string;
        blur: string;
        sharpen: string;
        dodge: string;
        text: string;
        shapes: string;
        paint: string;
        pen: string;
        gradient: string;
        assets: string;
        templates: string;
        aiZone: string;
        threeD: string;
    };
    paintSwatches: string[];
    utilitySwatches: string[];
};

const APP_THEME_PRESETS: Record<ThemeAccentPreset, AppThemeTokens> = {
    ocean: {
        primaryHex: '#1f8aa5',
        primarySoftHex: '#3aa3be',
        shapeDefaultFillHex: '#1f8aa5',
        zoneOverlayFill: 'rgba(31, 138, 165, 0.12)',
        zoneStroke: '#1f8aa5',
        curveDefaultStroke: '#1f8aa5',
        circularMenuColors: {
            select: '#4ba8c3', marquee: '#3f9fb8', lasso: '#2f93ad', wand: '#2288a2', pathSelect: '#1f8aa5', layers: '#2d7a90', healing: '#23a580', cloneStamp: '#1f8aa5', historyBrush: '#2a9bb5', clone: '#1f8aa5', history: '#2a9bb5', blur: '#2f8ea6', sharpen: '#2a7f95', dodge: '#f59e0b', text: '#22a58a', shapes: '#2a9bb5', paint: '#f59e0b', pen: '#1f8aa5', gradient: '#fb923c', assets: '#46b6c7', templates: '#3aa3be', aiZone: '#4f7de5', threeD: '#5b6ee1',
        },
        paintSwatches: ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#1f8aa5', '#14b8a6'],
        utilitySwatches: ['#f97316', '#f43f5e', '#1f8aa5', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f8fafc', '#111827'],
    },
    ember: {
        primaryHex: '#ea580c',
        primarySoftHex: '#fb923c',
        shapeDefaultFillHex: '#ea580c',
        zoneOverlayFill: 'rgba(234, 88, 12, 0.14)',
        zoneStroke: '#ea580c',
        curveDefaultStroke: '#ea580c',
        circularMenuColors: {
            select: '#f97316', marquee: '#fb923c', lasso: '#ea580c', wand: '#dc2626', pathSelect: '#c2410c', layers: '#9a3412', healing: '#22c55e', cloneStamp: '#c2410c', historyBrush: '#f97316', clone: '#c2410c', history: '#f97316', blur: '#fb7185', sharpen: '#ef4444', dodge: '#f59e0b', text: '#fb7185', shapes: '#ea580c', paint: '#f59e0b', pen: '#c2410c', gradient: '#dc2626', assets: '#fb923c', templates: '#fdba74', aiZone: '#f43f5e', threeD: '#fb7185',
        },
        paintSwatches: ['#000000', '#ffffff', '#dc2626', '#ea580c', '#f59e0b', '#84cc16', '#2563eb', '#7c2d12', '#f97316'],
        utilitySwatches: ['#ea580c', '#f43f5e', '#dc2626', '#f59e0b', '#84cc16', '#22c55e', '#fde047', '#fff7ed', '#431407'],
    },
    meadow: {
        primaryHex: '#15803d',
        primarySoftHex: '#22c55e',
        shapeDefaultFillHex: '#15803d',
        zoneOverlayFill: 'rgba(21, 128, 61, 0.14)',
        zoneStroke: '#15803d',
        curveDefaultStroke: '#15803d',
        circularMenuColors: {
            select: '#16a34a', marquee: '#22c55e', lasso: '#15803d', wand: '#0f766e', pathSelect: '#15803d', layers: '#166534', healing: '#14b8a6', cloneStamp: '#15803d', historyBrush: '#22c55e', clone: '#15803d', history: '#22c55e', blur: '#0f766e', sharpen: '#0d9488', dodge: '#eab308', text: '#10b981', shapes: '#16a34a', paint: '#84cc16', pen: '#15803d', gradient: '#14b8a6', assets: '#2dd4bf', templates: '#4ade80', aiZone: '#06b6d4', threeD: '#0ea5e9',
        },
        paintSwatches: ['#000000', '#ffffff', '#ef4444', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#15803d', '#0f766e'],
        utilitySwatches: ['#f59e0b', '#22c55e', '#15803d', '#14b8a6', '#0ea5e9', '#84cc16', '#eab308', '#ecfdf5', '#052e16'],
    },
    violet: {
        primaryHex: '#7c3aed',
        primarySoftHex: '#a855f7',
        shapeDefaultFillHex: '#7c3aed',
        zoneOverlayFill: 'rgba(124, 58, 237, 0.14)',
        zoneStroke: '#7c3aed',
        curveDefaultStroke: '#7c3aed',
        circularMenuColors: {
            select: '#8b5cf6', marquee: '#a855f7', lasso: '#7c3aed', wand: '#6366f1', pathSelect: '#7c3aed', layers: '#5b21b6', healing: '#14b8a6', cloneStamp: '#7c3aed', historyBrush: '#a855f7', clone: '#7c3aed', history: '#a855f7', blur: '#6366f1', sharpen: '#4f46e5', dodge: '#f59e0b', text: '#db2777', shapes: '#8b5cf6', paint: '#a855f7', pen: '#7c3aed', gradient: '#ec4899', assets: '#818cf8', templates: '#c084fc', aiZone: '#db2777', threeD: '#6366f1',
        },
        paintSwatches: ['#000000', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#7c3aed', '#a855f7', '#db2777'],
        utilitySwatches: ['#f97316', '#db2777', '#7c3aed', '#6366f1', '#0ea5e9', '#22c55e', '#fde047', '#faf5ff', '#2e1065'],
    },
};

export const APP_THEME = APP_THEME_PRESETS.ocean;

export const getThemeAccentPresetFromDocument = (): ThemeAccentPreset => {
    if (typeof document === 'undefined') {
        return 'ocean';
    }

    const value = document.documentElement.dataset.themeAccent;
    return value === 'ocean' || value === 'ember' || value === 'meadow' || value === 'violet'
        ? value
        : 'ocean';
};

export const getAppTheme = (accentPreset: ThemeAccentPreset = getThemeAccentPresetFromDocument()): AppThemeTokens => (
    APP_THEME_PRESETS[accentPreset] || APP_THEME
);
