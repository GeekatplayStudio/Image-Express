import * as fabric from 'fabric';

export type MaskGradientType = 'linear' | 'radial';

export type MaskGradientSettings = {
    enabled: boolean;
    type: MaskGradientType;
    angle: number;
    startOpacity: number;
    endOpacity: number;
};

type GradientColorStopLike = {
    color?: unknown;
    opacity?: unknown;
};

type GradientLike = {
    type?: unknown;
    coords?: Partial<Record<'x1' | 'y1' | 'x2' | 'y2' | 'r1' | 'r2', number>>;
    colorStops?: GradientColorStopLike[];
};

export const DEFAULT_MASK_GRADIENT_SETTINGS: MaskGradientSettings = {
    enabled: false,
    type: 'linear',
    angle: 90,
    startOpacity: 1,
    endOpacity: 0,
};

const clampOpacity = (value: number, fallback: number) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value));
};

const parseOpacityFromColor = (color: unknown, fallback: number) => {
    if (typeof color !== 'string') return fallback;
    const normalized = color.trim();
    const rgbaMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbaMatch) {
        const channels = rgbaMatch[1].split(',').map((part) => part.trim());
        if (channels.length >= 4) {
            const alpha = Number.parseFloat(channels[3]);
            if (Number.isFinite(alpha)) {
                return clampOpacity(alpha, fallback);
            }
        }
        return 1;
    }

    const hexMatch = normalized.match(/^#([0-9a-f]{8})$/i);
    if (hexMatch) {
        const alpha = Number.parseInt(hexMatch[1].slice(6, 8), 16) / 255;
        return clampOpacity(alpha, fallback);
    }

    return fallback;
};

const resolveStopOpacity = (stop: GradientColorStopLike | undefined, fallback: number) => {
    if (!stop) return fallback;
    if (typeof stop.opacity === 'number') {
        return clampOpacity(stop.opacity, fallback);
    }
    return parseOpacityFromColor(stop.color, fallback);
};

const buildLinearCoords = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return {
        x1: 0.5 - (Math.cos(radians) * 0.5),
        y1: 0.5 - (Math.sin(radians) * 0.5),
        x2: 0.5 + (Math.cos(radians) * 0.5),
        y2: 0.5 + (Math.sin(radians) * 0.5),
    };
};

const buildRadialCoords = () => ({
    x1: 0.5,
    y1: 0.5,
    r1: 0,
    x2: 0.5,
    y2: 0.5,
    r2: 0.75,
});

const toMaskColor = (opacity: number) => `rgba(255,255,255,${clampOpacity(opacity, 1)})`;

export const readMaskGradientSettings = (clipPath: fabric.Object | null | undefined): MaskGradientSettings => {
    const fill = clipPath?.fill as unknown;
    if (!fill || typeof fill === 'string' || !Array.isArray((fill as GradientLike).colorStops)) {
        return { ...DEFAULT_MASK_GRADIENT_SETTINGS };
    }

    const gradient = fill as GradientLike;
    const firstStop = gradient.colorStops?.[0];
    const lastStop = gradient.colorStops?.[gradient.colorStops.length - 1];
    const type: MaskGradientType = gradient.type === 'radial' ? 'radial' : 'linear';
    const coords = gradient.coords;
    const dx = (coords?.x2 ?? 1) - (coords?.x1 ?? 0);
    const dy = (coords?.y2 ?? 0.5) - (coords?.y1 ?? 0.5);
    const angle = type === 'linear'
        ? ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
        : DEFAULT_MASK_GRADIENT_SETTINGS.angle;

    return {
        enabled: true,
        type,
        angle: Math.round(angle),
        startOpacity: resolveStopOpacity(firstStop, DEFAULT_MASK_GRADIENT_SETTINGS.startOpacity),
        endOpacity: resolveStopOpacity(lastStop, DEFAULT_MASK_GRADIENT_SETTINGS.endOpacity),
    };
};

export const buildMaskGradientFill = (settings: MaskGradientSettings): string | fabric.Gradient<MaskGradientType, MaskGradientType> => {
    if (!settings.enabled) {
        return '#ffffff';
    }

    return new fabric.Gradient({
        type: settings.type,
        gradientUnits: 'percentage',
        coords: settings.type === 'radial'
            ? buildRadialCoords()
            : buildLinearCoords(settings.angle),
        colorStops: [
            { offset: 0, color: toMaskColor(settings.startOpacity) },
            { offset: 1, color: toMaskColor(settings.endOpacity) },
        ],
    });
};

export const mergeMaskGradientSettings = (
    current: MaskGradientSettings,
    updates: Partial<MaskGradientSettings>,
): MaskGradientSettings => ({
    enabled: typeof updates.enabled === 'boolean' ? updates.enabled : current.enabled,
    type: updates.type === 'radial' ? 'radial' : updates.type === 'linear' ? 'linear' : current.type,
    angle: Number.isFinite(updates.angle) ? Number(updates.angle) : current.angle,
    startOpacity: clampOpacity(
        typeof updates.startOpacity === 'number' ? updates.startOpacity : current.startOpacity,
        current.startOpacity,
    ),
    endOpacity: clampOpacity(
        typeof updates.endOpacity === 'number' ? updates.endOpacity : current.endOpacity,
        current.endOpacity,
    ),
});
