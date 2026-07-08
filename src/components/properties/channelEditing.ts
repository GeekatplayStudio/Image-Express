import * as fabric from 'fabric';
import { applyAlphaToColor, normalizeColorValue, parseColorWithAlpha } from '@/lib/fabric-utils';
import type { FabricBaseFilter } from '@/types';

export type ChannelTarget = 'composite' | 'r' | 'g' | 'b' | 'a' | 'lum';
export type EditableChannelTarget = Exclude<ChannelTarget, 'composite'>;
export type ChannelMode = 'composite' | 'isolate' | 'invert' | 'mask';

export interface ChannelControlState {
    opacities: Record<EditableChannelTarget, number>;
    masks: Record<EditableChannelTarget, boolean>;
}

export interface ChannelFilterState extends ChannelControlState {
    mode: ChannelMode;
    target: ChannelTarget;
}

export type ChannelPreviewSource =
    | { kind: 'color'; color: string; opacity?: number }
    | { kind: 'image'; element: HTMLCanvasElement | HTMLImageElement; width?: number; height?: number };

type TaggedChannelFilter = FabricBaseFilter & {
    imageExpressChannelFilter?: boolean;
    imageExpressChannelMode?: Exclude<ChannelMode, 'composite'>;
    imageExpressChannelTarget?: EditableChannelTarget;
    imageExpressChannelOpacities?: Partial<Record<EditableChannelTarget, number>>;
    imageExpressChannelMasks?: Partial<Record<EditableChannelTarget, boolean>>;
};

type RgbaChannels = {
    r: number;
    g: number;
    b: number;
    a: number;
};

type ChannelMatrixRow = [number, number, number, number, number];

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

const rgbaToHex = ({ r, g, b }: Pick<RgbaChannels, 'r' | 'g' | 'b'>) => {
    const toHex = (value: number) => clampByte(value).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const getLuminosityValue = ({ r, g, b }: Pick<RgbaChannels, 'r' | 'g' | 'b'>) =>
    clampByte((r * 0.299) + (g * 0.587) + (b * 0.114));

const mixRow = (base: ChannelMatrixRow, overlay: ChannelMatrixRow, amount: number): ChannelMatrixRow => {
    const strength = clampUnit(amount);
    return [
        (base[0] * (1 - strength)) + (overlay[0] * strength),
        (base[1] * (1 - strength)) + (overlay[1] * strength),
        (base[2] * (1 - strength)) + (overlay[2] * strength),
        (base[3] * (1 - strength)) + (overlay[3] * strength),
        (base[4] * (1 - strength)) + (overlay[4] * strength),
    ];
};

const applyMatrixRow = (rgba: RgbaChannels, row: ChannelMatrixRow) =>
    clampByte(
        (rgba.r * row[0])
        + (rgba.g * row[1])
        + (rgba.b * row[2])
        + (rgba.a * row[3])
        + (row[4] * 255),
    );

export const DEFAULT_CHANNEL_OPACITIES: Record<EditableChannelTarget, number> = {
    r: 1,
    g: 1,
    b: 1,
    a: 1,
    lum: 0,
};

export const DEFAULT_CHANNEL_MASKS: Record<EditableChannelTarget, boolean> = {
    r: false,
    g: false,
    b: false,
    a: false,
    lum: false,
};

export const createDefaultChannelFilterState = (): ChannelFilterState => ({
    mode: 'composite',
    target: 'composite',
    opacities: { ...DEFAULT_CHANNEL_OPACITIES },
    masks: { ...DEFAULT_CHANNEL_MASKS },
});

export const normalizeChannelFilterState = (
    state?: Partial<ChannelFilterState> | null,
): ChannelFilterState => {
    const base = createDefaultChannelFilterState();
    const target = state?.target;
    const mode = state?.mode;
    const editableTargets: EditableChannelTarget[] = ['r', 'g', 'b', 'a', 'lum'];
    const opacities = editableTargets.reduce<Record<EditableChannelTarget, number>>((result, key) => {
        result[key] = clampUnit(state?.opacities?.[key] ?? base.opacities[key]);
        return result;
    }, { ...base.opacities });
    const masks = editableTargets.reduce<Record<EditableChannelTarget, boolean>>((result, key) => {
        result[key] = Boolean(state?.masks?.[key] ?? base.masks[key]);
        return result;
    }, { ...base.masks });

    return {
        mode: mode === 'isolate' || mode === 'invert' || mode === 'mask' ? mode : 'composite',
        target: target === 'r' || target === 'g' || target === 'b' || target === 'a' || target === 'lum' ? target : 'composite',
        opacities,
        masks,
    };
};

export const isDefaultChannelFilterState = (state: ChannelFilterState) => {
    const normalized = normalizeChannelFilterState(state);
    return normalized.mode === 'composite'
        && normalized.target === 'composite'
        && (Object.keys(DEFAULT_CHANNEL_OPACITIES) as EditableChannelTarget[]).every((key) => normalized.opacities[key] === DEFAULT_CHANNEL_OPACITIES[key])
        && (Object.keys(DEFAULT_CHANNEL_MASKS) as EditableChannelTarget[]).every((key) => normalized.masks[key] === DEFAULT_CHANNEL_MASKS[key]);
};

export const buildChannelFilterState = (
    target: EditableChannelTarget | 'composite',
    mode: ChannelMode,
    controls?: Partial<ChannelControlState>,
) => {
    const base = createDefaultChannelFilterState();
    return normalizeChannelFilterState({
        ...base,
        ...controls,
        target,
        mode,
    });
};

export const extractChannelsFromColor = (color: string, opacity = 1): RgbaChannels => {
    const parsed = parseColorWithAlpha(color);
    const normalized = normalizeColorValue(parsed.color) ?? '#000000';
    const hex = normalized.startsWith('#') ? normalized.slice(1) : '000000';
    const alpha = clampUnit(typeof opacity === 'number' ? opacity : parsed.alpha);

    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: clampByte(alpha * 255),
    };
};

export const getChannelValue = (color: string, opacity: number, target: EditableChannelTarget) => {
    const channels = extractChannelsFromColor(color, opacity);
    if (target === 'lum') {
        return getLuminosityValue(channels);
    }
    return channels[target];
};

export const setChannelValueInColor = (
    color: string,
    opacity: number,
    target: Exclude<EditableChannelTarget, 'lum'>,
    nextValue: number,
) => {
    const channels = extractChannelsFromColor(color, opacity);
    const clamped = clampByte(nextValue);
    if (target === 'a') {
        return {
            color: applyAlphaToColor(rgbaToHex(channels), clampUnit(clamped / 255)),
            opacity: clampUnit(clamped / 255),
            channels: { ...channels, a: clamped },
        };
    }

    const nextChannels = { ...channels, [target]: clamped };
    return {
        color: applyAlphaToColor(rgbaToHex(nextChannels), clampUnit(channels.a / 255)),
        opacity: clampUnit(channels.a / 255),
        channels: nextChannels,
    };
};

const getBaseChannelRows = (state: ChannelFilterState) => {
    const redWeight = state.masks.r ? 0 : state.opacities.r;
    const greenWeight = state.masks.g ? 0 : state.opacities.g;
    const blueWeight = state.masks.b ? 0 : state.opacities.b;
    const alphaWeight = state.masks.a ? 0 : state.opacities.a;
    const luminosityWeight = state.masks.lum ? 0 : state.opacities.lum;

    const redRow: ChannelMatrixRow = [
        ((1 - luminosityWeight) * redWeight) + (luminosityWeight * 0.299),
        luminosityWeight * 0.587,
        luminosityWeight * 0.114,
        0,
        0,
    ];
    const greenRow: ChannelMatrixRow = [
        luminosityWeight * 0.299,
        ((1 - luminosityWeight) * greenWeight) + (luminosityWeight * 0.587),
        luminosityWeight * 0.114,
        0,
        0,
    ];
    const blueRow: ChannelMatrixRow = [
        luminosityWeight * 0.299,
        luminosityWeight * 0.587,
        ((1 - luminosityWeight) * blueWeight) + (luminosityWeight * 0.114),
        0,
        0,
    ];
    const alphaRow: ChannelMatrixRow = [0, 0, 0, alphaWeight, 0];

    return { redRow, greenRow, blueRow, alphaRow };
};

const getGrayscaleSourceRow = (target: EditableChannelTarget): ChannelMatrixRow => {
    if (target === 'r') return [1, 0, 0, 0, 0];
    if (target === 'g') return [0, 1, 0, 0, 0];
    if (target === 'b') return [0, 0, 1, 0, 0];
    if (target === 'a') return [0, 0, 0, 1, 0];
    return [0.299, 0.587, 0.114, 0, 0];
};

const getInvertedSourceRow = (target: EditableChannelTarget): ChannelMatrixRow => {
    if (target === 'r') return [-1, 0, 0, 0, 1];
    if (target === 'g') return [0, -1, 0, 0, 1];
    if (target === 'b') return [0, 0, -1, 0, 1];
    if (target === 'a') return [0, 0, 0, -1, 1];
    return [-0.299, -0.587, -0.114, 0, 1];
};

const getChannelMatrixRows = (state: ChannelFilterState) => {
    const normalized = normalizeChannelFilterState(state);
    const base = getBaseChannelRows(normalized);

    if (normalized.mode === 'composite' || normalized.target === 'composite') {
        return base;
    }

    const target = normalized.target;
    const strength = normalized.opacities[target];

    if (normalized.mode === 'isolate') {
        const grayscaleRow = getGrayscaleSourceRow(target);
        return {
            redRow: mixRow(base.redRow, grayscaleRow, strength),
            greenRow: mixRow(base.greenRow, grayscaleRow, strength),
            blueRow: mixRow(base.blueRow, grayscaleRow, strength),
            alphaRow: target === 'a' ? mixRow(base.alphaRow, [0, 0, 0, 0, 1], strength) : base.alphaRow,
        };
    }

    if (normalized.mode === 'invert') {
        if (target === 'lum') {
            const invertedLuminosity = getInvertedSourceRow(target);
            return {
                redRow: mixRow(base.redRow, invertedLuminosity, strength),
                greenRow: mixRow(base.greenRow, invertedLuminosity, strength),
                blueRow: mixRow(base.blueRow, invertedLuminosity, strength),
                alphaRow: base.alphaRow,
            };
        }

        const invertedSource = getInvertedSourceRow(target);
        return {
            redRow: target === 'r' ? mixRow(base.redRow, invertedSource, strength) : base.redRow,
            greenRow: target === 'g' ? mixRow(base.greenRow, invertedSource, strength) : base.greenRow,
            blueRow: target === 'b' ? mixRow(base.blueRow, invertedSource, strength) : base.blueRow,
            alphaRow: target === 'a' ? mixRow(base.alphaRow, invertedSource, strength) : base.alphaRow,
        };
    }

    const maskRow = getGrayscaleSourceRow(target);
    return {
        redRow: base.redRow,
        greenRow: base.greenRow,
        blueRow: base.blueRow,
        alphaRow: mixRow(base.alphaRow, maskRow, strength),
    };
};

const flattenChannelMatrixRows = ({ redRow, greenRow, blueRow, alphaRow }: ReturnType<typeof getChannelMatrixRows>) => [
    ...redRow,
    ...greenRow,
    ...blueRow,
    ...alphaRow,
];

export const getChannelOperationMatrix = (state: ChannelFilterState) => flattenChannelMatrixRows(getChannelMatrixRows(state));

export const applyChannelStateToColor = (color: string, opacity: number, state: ChannelFilterState) => {
    const source = extractChannelsFromColor(color, opacity);
    const matrixRows = getChannelMatrixRows(state);
    const nextChannels: RgbaChannels = {
        r: applyMatrixRow(source, matrixRows.redRow),
        g: applyMatrixRow(source, matrixRows.greenRow),
        b: applyMatrixRow(source, matrixRows.blueRow),
        a: applyMatrixRow(source, matrixRows.alphaRow),
    };

    return {
        color: applyAlphaToColor(rgbaToHex(nextChannels), clampUnit(nextChannels.a / 255)),
        opacity: clampUnit(nextChannels.a / 255),
        channels: nextChannels,
    };
};

export const applyChannelOperationToColor = (
    color: string,
    opacity: number,
    target: EditableChannelTarget,
    mode: Exclude<ChannelMode, 'composite'>,
    controls?: Partial<ChannelControlState>,
) => applyChannelStateToColor(color, opacity, buildChannelFilterState(target, mode, controls));

export const createChannelColorMatrixFilter = (state: ChannelFilterState) => {
    const normalized = normalizeChannelFilterState(state);
    const filter = new fabric.filters.ColorMatrix({
        matrix: getChannelOperationMatrix(normalized),
    }) as TaggedChannelFilter;
    filter.imageExpressChannelFilter = true;
    if (normalized.mode !== 'composite' && normalized.target !== 'composite') {
        filter.imageExpressChannelMode = normalized.mode;
        filter.imageExpressChannelTarget = normalized.target;
    }
    filter.imageExpressChannelOpacities = { ...normalized.opacities };
    filter.imageExpressChannelMasks = { ...normalized.masks };
    return filter;
};

export const setChannelBaseFilters = (
    target: { baseFilters?: FabricBaseFilter[] },
    filters: FabricBaseFilter[],
) => {
    target.baseFilters = filters;
};

export const setChannelAdjustmentSettings = <T extends Record<string, unknown>>(
    target: { adjustmentSettings?: T },
    settings: T,
) => {
    target.adjustmentSettings = settings;
};

export const setChannelObjectState = <T extends {
    channelSettings?: {
        mode?: string;
        target?: string;
        opacities?: Record<string, number>;
        masks?: Record<string, boolean>;
    };
}>(
    target: T,
    state: ChannelFilterState,
) => {
    target.channelSettings = normalizeChannelFilterState(state);
};

export const stripChannelFilters = (filters: FabricBaseFilter[] = []) =>
    filters.filter((filter) => !(filter as TaggedChannelFilter).imageExpressChannelFilter);

export const readChannelFilterState = (filters: FabricBaseFilter[] = []): ChannelFilterState => {
    const taggedFilter = filters.find((filter) => (filter as TaggedChannelFilter).imageExpressChannelFilter) as TaggedChannelFilter | undefined;
    if (!taggedFilter) {
        return createDefaultChannelFilterState();
    }
    return normalizeChannelFilterState({
        mode: taggedFilter.imageExpressChannelMode,
        target: taggedFilter.imageExpressChannelTarget,
        opacities: taggedFilter.imageExpressChannelOpacities,
        masks: taggedFilter.imageExpressChannelMasks,
    });
};

export const transformPixelForChannel = (
    rgba: RgbaChannels,
    target: ChannelTarget,
): RgbaChannels => {
    if (target === 'composite') return rgba;
    if (target === 'a') {
        return { r: rgba.a, g: rgba.a, b: rgba.a, a: 255 };
    }
    if (target === 'lum') {
        const luminosity = getLuminosityValue(rgba);
        return { r: luminosity, g: luminosity, b: luminosity, a: rgba.a };
    }
    const value = rgba[target];
    return { r: value, g: value, b: value, a: rgba.a };
};

const drawCheckerboard = (context: CanvasRenderingContext2D, size: number) => {
    const square = Math.max(4, Math.round(size / 6));
    for (let y = 0; y < size; y += square) {
        for (let x = 0; x < size; x += square) {
            context.fillStyle = ((x / square) + (y / square)) % 2 === 0 ? '#f3f4f6' : '#d1d5db';
            context.fillRect(x, y, square, square);
        }
    }
};

export const buildChannelPreviewDataUrl = (
    source: ChannelPreviewSource,
    target: ChannelTarget,
    size = 56,
): string | null => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;

    drawCheckerboard(context, size);

    if (source.kind === 'color') {
        const transformed = transformPixelForChannel(extractChannelsFromColor(source.color, source.opacity ?? 1), target);
        context.fillStyle = applyAlphaToColor(rgbaToHex(transformed), clampUnit(transformed.a / 255));
        context.fillRect(0, 0, size, size);
        return canvas.toDataURL('image/png');
    }

    const image = source.element;
    const sourceWidth = source.width ?? ('naturalWidth' in image ? image.naturalWidth : image.width) ?? size;
    const sourceHeight = source.height ?? ('naturalHeight' in image ? image.naturalHeight : image.height) ?? size;
    const scale = Math.max(size / Math.max(1, sourceWidth), size / Math.max(1, sourceHeight));
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const offsetX = (size - drawWidth) / 2;
    const offsetY = (size - drawHeight) / 2;
    context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

    if (target !== 'composite') {
        const imageData = context.getImageData(0, 0, size, size);
        const { data } = imageData;
        for (let index = 0; index < data.length; index += 4) {
            const transformed = transformPixelForChannel(
                { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] },
                target,
            );
            data[index] = transformed.r;
            data[index + 1] = transformed.g;
            data[index + 2] = transformed.b;
            data[index + 3] = transformed.a;
        }
        context.putImageData(imageData, 0, 0);
    }

    return canvas.toDataURL('image/png');
};