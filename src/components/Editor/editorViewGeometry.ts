import * as fabric from 'fabric';
import type { RectBounds } from '@/components/Editor/editorView.types';

type SourceRect = { left: number; top: number; width: number; height: number };

export function parseAspectRatioPreset(preset: string): number | null {
    if (preset === 'free') return null;
    const [widthToken, heightToken] = preset.split(':');
    const width = Number(widthToken);
    const height = Number(heightToken);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }
    return width / height;
}

export function buildAspectCropRect(sourceRect: SourceRect, aspectRatio: number | null): RectBounds {
    if (!aspectRatio) {
        return {
            left: sourceRect.left,
            top: sourceRect.top,
            width: Math.max(1, sourceRect.width),
            height: Math.max(1, sourceRect.height),
        };
    }

    const sourceRatio = sourceRect.width / sourceRect.height;
    let width = sourceRect.width;
    let height = sourceRect.height;
    if (sourceRatio > aspectRatio) {
        width = sourceRect.height * aspectRatio;
    } else {
        height = sourceRect.width / aspectRatio;
    }
    return {
        left: sourceRect.left + (sourceRect.width - width) / 2,
        top: sourceRect.top + (sourceRect.height - height) / 2,
        width: Math.max(1, width),
        height: Math.max(1, height),
    };
}

export function buildMediaOverlayStorageKey(
    designId: string | null,
    designName: string,
    keyPrefix: string,
): string {
    const rawId = (designId || designName || 'untitled').trim().toLowerCase();
    const safeId = rawId.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
    return `${keyPrefix}:${safeId}`;
}

export function getFrameBounds(frame: fabric.Rect): RectBounds {
    const angle = typeof frame.angle === 'number' ? frame.angle : 0;
    const skewX = typeof frame.skewX === 'number' ? frame.skewX : 0;
    const skewY = typeof frame.skewY === 'number' ? frame.skewY : 0;
    const hasAxisAlignedGeometry = angle === 0 && skewX === 0 && skewY === 0;

    if (hasAxisAlignedGeometry) {
        return {
            left: frame.left || 0,
            top: frame.top || 0,
            width: Math.max(1, (frame.width || 1) * (frame.scaleX || 1)),
            height: Math.max(1, (frame.height || 1) * (frame.scaleY || 1)),
        };
    }

    if (typeof frame.getCoords === 'function') {
        const coords = frame.getCoords();
        if (Array.isArray(coords) && coords.length > 0) {
            const xs = coords.map((point) => point.x).filter((value) => Number.isFinite(value));
            const ys = coords.map((point) => point.y).filter((value) => Number.isFinite(value));
            if (xs.length > 0 && ys.length > 0) {
                const left = Math.min(...xs);
                const top = Math.min(...ys);
                const right = Math.max(...xs);
                const bottom = Math.max(...ys);
                return {
                    left,
                    top,
                    width: Math.max(1, right - left),
                    height: Math.max(1, bottom - top),
                };
            }
        }
    }

    return {
        left: frame.left || 0,
        top: frame.top || 0,
        width: Math.max(1, frame.getScaledWidth?.() ?? ((frame.width || 1) * (frame.scaleX || 1))),
        height: Math.max(1, frame.getScaledHeight?.() ?? ((frame.height || 1) * (frame.scaleY || 1))),
    };
}

export function normalizeFrameOrigin(frame: fabric.Rect) {
    const originX = frame.originX || 'left';
    const originY = frame.originY || 'top';
    if (originX === 'left' && originY === 'top') return;
    const bounds = getFrameBounds(frame);
    frame.set({
        originX: 'left',
        originY: 'top',
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        scaleX: 1,
        scaleY: 1,
    });
    frame.setCoords();
}