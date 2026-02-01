// src/lib/fabric-utils.ts
import * as fabric from 'fabric';
import { ExtendedFabricObject, LayerNode, AdjustmentLayerType, AdjustmentLayerSettings, CurvesAdjustmentSettings, LevelsAdjustmentSettings, SaturationVibranceSettings, HueSaturationSettings, ExposureSettings } from '@/types';

export const ensureObjectId = (obj: fabric.Object) => {
    const extendedObj = obj as ExtendedFabricObject;
    if (!extendedObj.id) {
        const fallback = extendedObj.cacheKey ? `obj-${extendedObj.cacheKey}` : `obj-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        extendedObj.id = fallback;
    }
    return extendedObj.id;
};

export const getNextIndexedName = (base: string, names: string[]) => {
    const matcher = new RegExp(`^${base}\\s*(\\d+)?$`, 'i');
    let max = 0;
    names.forEach((name) => {
        const trimmed = name.trim();
        const match = trimmed.match(matcher);
        if (match) {
            const num = match[1] ? parseInt(match[1], 10) : 1;
            if (!Number.isNaN(num)) max = Math.max(max, num);
        }
    });
    return `${base} ${max + 1}`;
};

export const getGroupNames = (canvas: fabric.Canvas) => {
    return canvas.getObjects().filter((obj) => obj.type === 'group').map((obj) => {
        const name = (obj as ExtendedFabricObject).name;
        return name ?? 'Folder';
    });
};

export const addToGroup = (group: fabric.Group, obj: fabric.Object) => {
    const groupWithUpdate = group as fabric.Group & { addWithUpdate?: (obj: fabric.Object) => void };
    if (typeof groupWithUpdate.addWithUpdate === 'function') {
        groupWithUpdate.addWithUpdate(obj);
    } else {
        group.add(obj);
        group.setCoords();
    }
};

export const moveObjectToGroup = (obj: fabric.Object, group: fabric.Group, targetCanvas: fabric.Canvas) => {
    const objMatrix = obj.calcTransformMatrix();
    const parentGroup = obj.group as fabric.Group | undefined;
    if (parentGroup) {
        parentGroup.remove(obj);
        parentGroup.setCoords();
    } else {
        targetCanvas.remove(obj);
    }

    const groupMatrix = group.calcTransformMatrix();
    const inverseGroup = fabric.util.invertTransform(groupMatrix);
    const finalMatrix = fabric.util.multiplyTransformMatrices(inverseGroup, objMatrix);
    fabric.util.applyTransformToObject(obj, finalMatrix);
    obj.setCoords();

    addToGroup(group, obj);
};

export const moveObjectToCanvas = (obj: fabric.Object, parentGroup: fabric.Group, targetCanvas: fabric.Canvas) => {
    const objMatrix = obj.calcTransformMatrix();
    const groupMatrix = parentGroup.calcTransformMatrix();
    const finalMatrix = fabric.util.multiplyTransformMatrices(groupMatrix, objMatrix);
    fabric.util.applyTransformToObject(obj, finalMatrix);
    obj.setCoords();

    parentGroup.remove(obj);
    parentGroup.setCoords();
    targetCanvas.add(obj);
};

export const normalizeColorValue = (value?: string) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (trimmed.startsWith('#')) {
        if (trimmed.length === 4) {
            const r = trimmed[1];
            const g = trimmed[2];
            const b = trimmed[3];
            return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
        }
        return trimmed.toLowerCase();
    }

    const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    const channelToHex = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10);
        const g = parseInt(rgbMatch[2], 10);
        const b = parseInt(rgbMatch[3], 10);
        return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
    }

    return trimmed;
};

export const parseColorWithAlpha = (value?: string) => {
    const channelToHex = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
    if (!value) return { color: '#000000', alpha: 1 };
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'transparent') return { color: '#000000', alpha: 0 };
    const rgbaMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/i);
    if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1], 10);
        const g = parseInt(rgbaMatch[2], 10);
        const b = parseInt(rgbaMatch[3], 10);
        const alpha = rgbaMatch[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(rgbaMatch[4]))) : 1;
        return { color: `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`, alpha };
    }

    const normalized = normalizeColorValue(trimmed);
    return { color: normalized ?? trimmed, alpha: 1 };
};

export const applyAlphaToColor = (color: string, alpha: number) => {
    const normalized = normalizeColorValue(color) ?? color;
    if (!normalized.startsWith('#')) return normalized;
    const hex = normalized.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
};

export const getAdjustmentLabel = (type?: AdjustmentLayerType) => {
    if (type === 'curves') return 'Curves';
    if (type === 'levels') return 'Levels';
    if (type === 'saturation-vibrance') return 'Saturation / Vibrance';
    if (type === 'hue-saturation') return 'Hue / Saturation';
    if (type === 'exposure') return 'Exposure';
    if (type === 'black-white') return 'Black & White';
    return 'Adjustment';
};

export const getDefaultAdjustmentSettings = (type: AdjustmentLayerType): AdjustmentLayerSettings => {
    if (type === 'curves') return { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], channel: 'rgb' } as CurvesAdjustmentSettings;
    if (type === 'levels') return { black: 0, mid: 1, white: 1 } as LevelsAdjustmentSettings;
    if (type === 'hue-saturation') return { hue: 0, saturation: 0, lightness: 0 } as HueSaturationSettings;
    if (type === 'exposure') return { exposure: 0, contrast: 0 } as ExposureSettings;
    return { saturation: 0, vibrance: 0 } as SaturationVibranceSettings;
};

