import type * as fabric from 'fabric';
import { normalizeColorValue, parseColorWithAlpha } from '@/lib/fabric-utils';
import type { ExtendedFabricObject } from '@/types';
import { isPointInsideBounds, type RectBounds } from '@/components/Editor/selectionGeometry';

type Rgb = { r: number; g: number; b: number };

export function toRgbColor(value: unknown): Rgb | null {
    if (typeof value !== 'string') return null;

    const parsed = parseColorWithAlpha(value);
    if (parsed.alpha <= 0) return null;

    const normalized = (normalizeColorValue(parsed.color) || parsed.color).trim();
    const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
    if (shortHex) {
        const digits = shortHex[1];
        return {
            r: Number.parseInt(`${digits[0]}${digits[0]}`, 16),
            g: Number.parseInt(`${digits[1]}${digits[1]}`, 16),
            b: Number.parseInt(`${digits[2]}${digits[2]}`, 16),
        };
    }

    const fullHex = normalized.match(/^#([0-9a-f]{6})$/i);
    if (fullHex) {
        const digits = fullHex[1];
        return {
            r: Number.parseInt(digits.slice(0, 2), 16),
            g: Number.parseInt(digits.slice(2, 4), 16),
            b: Number.parseInt(digits.slice(4, 6), 16),
        };
    }

    const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const channels = rgbMatch[1]
            .split(',')
            .slice(0, 3)
            .map((part) => Number.parseFloat(part.trim()));
        if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) {
            return {
                r: Math.max(0, Math.min(255, Math.round(channels[0]))),
                g: Math.max(0, Math.min(255, Math.round(channels[1]))),
                b: Math.max(0, Math.min(255, Math.round(channels[2]))),
            };
        }
    }

    return null;
}

export function getObjectRepresentativeColor(obj: fabric.Object): Rgb | null {
    const ext = obj as ExtendedFabricObject;
    return toRgbColor(ext.fill) || toRgbColor(ext.stroke) || null;
}

export function colorDistance(a: Rgb, b: Rgb) {
    return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Skip artboard / chrome: not user design content. */
export function isSelectionChromeObject(obj: fabric.Object): boolean {
    const ext = obj as ExtendedFabricObject & {
        isSelectionOverlayHelper?: boolean;
        isPenDraftAnchor?: boolean;
    };
    if (ext.isSelectionOverlayHelper || ext.isPenDraftAnchor) return true;
    if (ext.name === 'Artboard' || ext.name === 'WorkspaceBackground') return true;
    if (obj.type === 'activeSelection' || obj.type === 'selection') return true;
    // DesignCanvas artboard is selectable:false + evented:false + excludeFromExport
    if (obj.selectable === false && obj.evented === false) return true;
    return false;
}

export function objectContainsPointer(obj: fabric.Object, pointer: fabric.Point): boolean {
    const withContains = obj as fabric.Object & {
        containsPoint?: (point: fabric.Point) => boolean;
        getBoundingRect?: () => RectBounds;
    };

    if (typeof withContains.containsPoint === 'function') {
        try {
            if (withContains.containsPoint(pointer)) return true;
        } catch {
            // Fall through to AABB if Fabric rejects the point shape.
        }
    }

    if (typeof withContains.getBoundingRect === 'function') {
        return isPointInsideBounds(pointer, withContains.getBoundingRect());
    }

    return false;
}

/**
 * Top-most design object under the pointer.
 * Decision: with skipTargetFind enabled, Fabric leaves opt.target empty — we must hit-test ourselves.
 */
export function findTopObjectAtPointer(
    objects: fabric.Object[],
    pointer: fabric.Point,
    preferred?: fabric.Object | null,
): fabric.Object | null {
    const candidates = objects.filter((obj) => !isSelectionChromeObject(obj));
    if (preferred && candidates.includes(preferred) && objectContainsPointer(preferred, pointer)) {
        return preferred;
    }

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const obj = candidates[index];
        if (objectContainsPointer(obj, pointer)) return obj;
    }

    return null;
}

/**
 * Magic-wand object pick:
 * - Seed = top object under click
 * - If seed has fill/stroke and threshold > 0 → also pick similarly colored objects
 * - Images / no fill → select the seed object (Photoshop users at least get the layer)
 */
export function resolveWandSelection(
    objects: fabric.Object[],
    pointer: fabric.Point,
    threshold: number,
    preferredTarget?: fabric.Object | null,
): fabric.Object[] {
    const seed = findTopObjectAtPointer(objects, pointer, preferredTarget ?? null);
    if (!seed) return [];

    const normalizedThreshold = Math.max(0, Math.min(180, Math.round(threshold)));
    const seedColor = getObjectRepresentativeColor(seed);

    // No representative color (typical for photos) or zero tolerance → seed only.
    if (!seedColor || normalizedThreshold <= 0) {
        return [seed];
    }

    const candidates = objects.filter((obj) => !isSelectionChromeObject(obj));
    const matched = candidates.filter((obj) => {
        const objectColor = getObjectRepresentativeColor(obj);
        if (!objectColor) return obj === seed;
        return colorDistance(seedColor, objectColor) <= normalizedThreshold;
    });

    if (!matched.includes(seed)) matched.push(seed);
    return matched;
}
