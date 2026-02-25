import * as fabric from 'fabric';
import {
    computeRetouchBrushProfile,
    resolveNextCloneSourcePoint,
    interpolateStrokePoints,
    isLocalPointInsideBounds,
    toLocalRetouchPoint,
} from '@/lib/retouch-engine';

describe('retouch-engine', () => {
    it('converts scene point to local retouch coordinates', () => {
        const scenePoint = new fabric.Point(220, 145);
        const localPoint = toLocalRetouchPoint(scenePoint, {
            left: 100,
            top: 40,
            width: 400,
            height: 300,
        });

        expect(localPoint.x).toBe(120);
        expect(localPoint.y).toBe(105);
    });

    it('checks local point bounds correctly', () => {
        const bounds = { left: 0, top: 0, width: 120, height: 80 };
        expect(isLocalPointInsideBounds(new fabric.Point(0, 0), bounds)).toBe(true);
        expect(isLocalPointInsideBounds(new fabric.Point(120, 80), bounds)).toBe(true);
        expect(isLocalPointInsideBounds(new fabric.Point(-1, 12), bounds)).toBe(false);
        expect(isLocalPointInsideBounds(new fabric.Point(60, 81), bounds)).toBe(false);
    });

    it('interpolates stroke points based on spacing', () => {
        const from = new fabric.Point(0, 0);
        const to = new fabric.Point(100, 0);
        const points = interpolateStrokePoints(from, to, 20);

        expect(points.length).toBeGreaterThan(1);
        expect(points[0]?.x).toBeGreaterThan(0);
        expect(points.at(-1)?.x).toBe(100);
    });

    it('returns the target point when movement is smaller than spacing', () => {
        const from = new fabric.Point(10, 10);
        const to = new fabric.Point(12, 11);
        const points = interpolateStrokePoints(from, to, 10);

        expect(points).toHaveLength(1);
        expect(points[0]?.x).toBe(12);
        expect(points[0]?.y).toBe(11);
    });

    it('computes next aligned clone source point only for mutated aligned strokes', () => {
        const endPoint = new fabric.Point(40, 25);
        const cloneOffset = new fabric.Point(12, -3);

        const next = resolveNextCloneSourcePoint({
            aligned: true,
            strokeMutated: true,
            endPoint,
            cloneOffset,
        });
        expect(next).toBeTruthy();
        expect(next?.x).toBe(52);
        expect(next?.y).toBe(22);

        expect(resolveNextCloneSourcePoint({
            aligned: false,
            strokeMutated: true,
            endPoint,
            cloneOffset,
        })).toBeNull();

        expect(resolveNextCloneSourcePoint({
            aligned: true,
            strokeMutated: false,
            endPoint,
            cloneOffset,
        })).toBeNull();
    });

    it('calibrates healing profile softness and secondary blend pass by hardness', () => {
        const soft = computeRetouchBrushProfile({
            mode: 'healing',
            size: 36,
            hardness: 10,
        });
        const hard = computeRetouchBrushProfile({
            mode: 'healing',
            size: 36,
            hardness: 90,
        });

        expect(soft.blurPx).toBeGreaterThan(hard.blurPx);
        expect(hard.maskHardness).toBeGreaterThan(soft.maskHardness);
        expect(hard.secondaryPass).not.toBeNull();
        expect(hard.secondaryPass?.opacity ?? 1).toBeLessThan(hard.opacity);
        expect(hard.secondaryPass?.compositeOperation).toBe('soft-light');
    });

    it('scales blur profile by strength', () => {
        const weak = computeRetouchBrushProfile({
            mode: 'blur',
            size: 48,
            strength: 12,
        });
        const strong = computeRetouchBrushProfile({
            mode: 'blur',
            size: 48,
            strength: 92,
        });

        expect(strong.blurPx).toBeGreaterThan(weak.blurPx);
        expect(strong.opacity).toBeGreaterThan(weak.opacity);
        expect(strong.spacing).toBeLessThan(weak.spacing);
    });

    it('attenuates sharpen impact for very large brush sizes', () => {
        const compact = computeRetouchBrushProfile({
            mode: 'sharpen',
            size: 24,
            strength: 80,
        });
        const large = computeRetouchBrushProfile({
            mode: 'sharpen',
            size: 240,
            strength: 80,
        });

        expect(compact.sharpenAmount).toBeGreaterThan(large.sharpenAmount);
        expect(compact.opacity).toBeGreaterThan(large.opacity);
    });

    it('reduces dodge intensity when protect tones is enabled', () => {
        const regular = computeRetouchBrushProfile({
            mode: 'dodge',
            size: 42,
            exposure: 60,
            protectTones: false,
        });
        const protectedTones = computeRetouchBrushProfile({
            mode: 'dodge',
            size: 42,
            exposure: 60,
            protectTones: true,
        });

        expect(protectedTones.opacity).toBeLessThan(regular.opacity);
        expect(protectedTones.maskHardness).toBeGreaterThan(regular.maskHardness);
        expect(protectedTones.spacing).toBeGreaterThan(regular.spacing);
        expect(protectedTones.compositeOperation).toBe('screen');
    });
});
