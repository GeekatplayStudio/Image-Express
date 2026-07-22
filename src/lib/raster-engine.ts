import * as fabric from 'fabric';

/**
 * Stamp-based raster paint engine.
 *
 * Replaces the previous fabric free-drawing approach (which created a new
 * vector Path object per stroke) with Photoshop-style dab stamping onto a
 * single shared "Paint Layer" bitmap:
 *  - flow    = alpha of each dab (builds up within a stroke)
 *  - opacity = alpha of the whole stroke when committed to the layer
 *  - blend   = composite operation of the stroke against the layer
 */

export type RasterBrushPreset =
    | 'soft-round'
    | 'hard-round'
    | 'calligraphy'
    | 'chalk'
    | 'spray'
    | 'marker';

export type RasterBlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

// `value` is the stored preset identifier; `labelKey` resolves through t() at
// render (see PaintControls). The brush names themselves are translatable.
export const PAINT_BRUSH_PRESET_OPTIONS: Array<{ value: RasterBrushPreset; labelKey: string }> = [
    { value: 'soft-round', labelKey: 'paintPreset.softRound' },
    { value: 'hard-round', labelKey: 'paintPreset.hardRound' },
    { value: 'calligraphy', labelKey: 'paintPreset.calligraphy' },
    { value: 'chalk', labelKey: 'paintPreset.chalk' },
    { value: 'spray', labelKey: 'paintPreset.spray' },
    { value: 'marker', labelKey: 'paintPreset.marker' },
];

const PRESET_VALUES = new Set<string>(PAINT_BRUSH_PRESET_OPTIONS.map((option) => option.value));

// Legacy preset names from the fabric-brush era map onto the closest new tip.
const LEGACY_PRESET_MAP: Record<string, RasterBrushPreset> = {
    Pencil: 'hard-round',
    Spray: 'spray',
    Oil: 'marker',
    Watercolor: 'soft-round',
};

export const normalizeRasterBrushPreset = (value: string | null | undefined): RasterBrushPreset => {
    if (value && PRESET_VALUES.has(value)) return value as RasterBrushPreset;
    if (value && LEGACY_PRESET_MAP[value]) return LEGACY_PRESET_MAP[value];
    return 'soft-round';
};

export interface PaintBrushConfig {
    preset: RasterBrushPreset;
    /** Brush diameter in layer pixels. */
    size: number;
    /** 0-100. Edge hardness for round tips; texture density for chalk. */
    hardness: number;
    /** 1-100. Per-dab alpha. */
    flow: number;
    /** 1-100. Whole-stroke alpha at commit time. */
    opacity: number;
    /** 0-100. Higher smoothing = wider dab spacing. */
    smoothing: number;
    color: string;
    blendMode: RasterBlendMode;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const normalizePaintBrushConfig = (config: PaintBrushConfig): PaintBrushConfig => ({
    preset: normalizeRasterBrushPreset(config.preset),
    size: clamp(Number(config.size) || 1, 1, 1000),
    hardness: clamp(Number(config.hardness) || 0, 0, 100),
    flow: clamp(Number(config.flow) || 100, 1, 100),
    opacity: clamp(Number(config.opacity) || 100, 1, 100),
    smoothing: clamp(Number(config.smoothing) || 50, 0, 100),
    color: typeof config.color === 'string' && config.color.trim().length > 0 ? config.color : '#000000',
    blendMode: config.blendMode || 'source-over',
});

/** Dab spacing in pixels — tighter for smooth tips, looser for textured ones. */
export const getBrushSpacing = (config: PaintBrushConfig): number => {
    const base = (() => {
        switch (config.preset) {
            case 'calligraphy': return config.size * 0.08;
            case 'marker': return config.size * 0.1;
            case 'chalk': return config.size * 0.2;
            case 'spray': return config.size * 0.35;
            case 'hard-round': return config.size * 0.12;
            case 'soft-round':
            default: return config.size * 0.15;
        }
    })();
    const smoothingBoost = 1 + (config.smoothing / 100);
    return Math.max(0.75, base * smoothingBoost);
};

const parseColorChannels = (color: string): { r: number; g: number; b: number } => {
    const hex = color.trim().replace('#', '');
    if (/^[0-9a-f]{3}$/i.test(hex)) {
        return {
            r: parseInt(hex[0] + hex[0], 16),
            g: parseInt(hex[1] + hex[1], 16),
            b: parseInt(hex[2] + hex[2], 16),
        };
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) {
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        };
    }
    return { r: 0, g: 0, b: 0 };
};

/**
 * Builds the brush tip bitmap for a preset. The tip is stamped repeatedly
 * along the stroke; per-dab alpha (flow) is applied at stamp time.
 */
export const createBrushTip = (config: PaintBrushConfig): HTMLCanvasElement | null => {
    const size = Math.max(2, Math.round(config.size));
    const tip = document.createElement('canvas');
    tip.width = size;
    tip.height = size;
    const ctx = tip.getContext('2d');
    if (!ctx) return null;

    const radius = size / 2;
    const { r, g, b } = parseColorChannels(config.color);
    const rgba = (alpha: number) => `rgba(${r},${g},${b},${alpha})`;

    switch (config.preset) {
        case 'hard-round': {
            ctx.fillStyle = rgba(1);
            ctx.beginPath();
            ctx.arc(radius, radius, Math.max(0.5, radius - 0.5), 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'soft-round': {
            const inner = radius * clamp(config.hardness, 0, 100) / 100;
            const gradient = ctx.createRadialGradient(radius, radius, inner, radius, radius, radius);
            gradient.addColorStop(0, rgba(1));
            gradient.addColorStop(1, rgba(0));
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(radius, radius, radius, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'calligraphy': {
            // Flat nib at 45 degrees; hardness controls nib thickness.
            const thickness = Math.max(1.5, size * (0.12 + (config.hardness / 100) * 0.18));
            ctx.translate(radius, radius);
            ctx.rotate(-Math.PI / 4);
            ctx.fillStyle = rgba(1);
            const halfLength = radius * 0.92;
            ctx.beginPath();
            ctx.ellipse(0, 0, halfLength, thickness / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'marker': {
            // Chisel tip: rounded bar with baked-in translucency for buildup.
            ctx.translate(radius, radius);
            ctx.rotate(-Math.PI / 10);
            ctx.fillStyle = rgba(0.75);
            const halfWidth = radius * 0.85;
            const halfHeight = Math.max(1.5, radius * 0.4);
            ctx.beginPath();
            ctx.ellipse(0, 0, halfWidth, halfHeight, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'chalk': {
            // Grainy disk: solid circle with random speckle holes.
            ctx.fillStyle = rgba(0.9);
            ctx.beginPath();
            ctx.arc(radius, radius, Math.max(0.5, radius - 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'destination-out';
            const holeDensity = 0.35 - (clamp(config.hardness, 0, 100) / 100) * 0.2;
            const holes = Math.max(6, Math.round(size * size * holeDensity * 0.08));
            for (let i = 0; i < holes; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * radius;
                const holeRadius = Math.max(0.5, Math.random() * size * 0.08);
                ctx.beginPath();
                ctx.arc(radius + Math.cos(angle) * distance, radius + Math.sin(angle) * distance, holeRadius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
            break;
        }
        case 'spray': {
            // The spray tip is regenerated per dab (random scatter), see stampBrushTip.
            break;
        }
    }

    return tip;
};

/** Draws one dab at (x, y) in layer coordinates. */
export const stampBrushTip = (
    bufferCtx: CanvasRenderingContext2D,
    tip: HTMLCanvasElement | null,
    config: PaintBrushConfig,
    x: number,
    y: number,
) => {
    const flowAlpha = clamp(config.flow, 1, 100) / 100;
    bufferCtx.save();
    bufferCtx.globalAlpha = flowAlpha;

    if (config.preset === 'spray') {
        const radius = Math.max(1, config.size / 2);
        const { r, g, b } = parseColorChannels(config.color);
        bufferCtx.fillStyle = `rgba(${r},${g},${b},1)`;
        const dots = Math.max(4, Math.round(radius * 1.6));
        for (let i = 0; i < dots; i++) {
            const angle = Math.random() * Math.PI * 2;
            // Bias scatter toward the center for a denser core.
            const distance = Math.pow(Math.random(), 0.6) * radius;
            const dotRadius = Math.max(0.4, Math.random() * Math.max(1, config.size * 0.035));
            bufferCtx.beginPath();
            bufferCtx.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, dotRadius, 0, Math.PI * 2);
            bufferCtx.fill();
        }
        bufferCtx.restore();
        return;
    }

    if (!tip) {
        bufferCtx.restore();
        return;
    }

    bufferCtx.drawImage(tip, x - tip.width / 2, y - tip.height / 2);
    bufferCtx.restore();
};

/**
 * Composites the committed base pixels plus the live stroke buffer into the
 * display canvas (the fabric image element), honoring stroke opacity/blend.
 */
export const renderStrokePreview = (
    displayCtx: CanvasRenderingContext2D,
    baseCanvas: HTMLCanvasElement,
    strokeBuffer: HTMLCanvasElement,
    config: PaintBrushConfig,
) => {
    displayCtx.save();
    displayCtx.globalCompositeOperation = 'source-over';
    displayCtx.globalAlpha = 1;
    displayCtx.clearRect(0, 0, displayCtx.canvas.width, displayCtx.canvas.height);
    displayCtx.drawImage(baseCanvas, 0, 0);
    displayCtx.globalAlpha = clamp(config.opacity, 1, 100) / 100;
    displayCtx.globalCompositeOperation = config.blendMode;
    displayCtx.drawImage(strokeBuffer, 0, 0);
    displayCtx.restore();
};

/** Commits the stroke buffer into the base pixels (end of stroke). */
export const commitStroke = (
    baseCtx: CanvasRenderingContext2D,
    strokeBuffer: HTMLCanvasElement,
    config: PaintBrushConfig,
) => {
    baseCtx.save();
    baseCtx.globalAlpha = clamp(config.opacity, 1, 100) / 100;
    baseCtx.globalCompositeOperation = config.blendMode;
    baseCtx.drawImage(strokeBuffer, 0, 0);
    baseCtx.restore();
};

/** Turns off fabric's built-in free drawing (legacy paint mode). */
export const disableRasterDrawingMode = (canvas: fabric.Canvas) => {
    const drawingCanvas = canvas as fabric.Canvas & {
        set?: (key: string, value: unknown) => void;
        isDrawingMode?: boolean;
    };
    if (typeof drawingCanvas.set === 'function') {
        drawingCanvas.set('isDrawingMode', false);
        return;
    }
    drawingCanvas.isDrawingMode = false;
};
