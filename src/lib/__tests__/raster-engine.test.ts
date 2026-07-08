import {
    PAINT_BRUSH_PRESET_OPTIONS,
    commitStroke,
    getBrushSpacing,
    normalizePaintBrushConfig,
    normalizeRasterBrushPreset,
    stampBrushTip,
    type PaintBrushConfig,
} from '@/lib/raster-engine';

const baseConfig: PaintBrushConfig = {
    preset: 'soft-round',
    size: 24,
    hardness: 60,
    flow: 80,
    opacity: 90,
    smoothing: 50,
    color: '#ff0000',
    blendMode: 'source-over',
};

const createMockContext = () => ({
    save: jest.fn(),
    restore: jest.fn(),
    drawImage: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    clearRect: jest.fn(),
    canvas: { width: 100, height: 100 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
});

describe('raster-engine', () => {
    it('normalizes legacy preset names onto the new tips', () => {
        expect(normalizeRasterBrushPreset('Pencil')).toBe('hard-round');
        expect(normalizeRasterBrushPreset('Spray')).toBe('spray');
        expect(normalizeRasterBrushPreset('Oil')).toBe('marker');
        expect(normalizeRasterBrushPreset('Watercolor')).toBe('soft-round');
        expect(normalizeRasterBrushPreset('calligraphy')).toBe('calligraphy');
        expect(normalizeRasterBrushPreset('bogus')).toBe('soft-round');
        expect(normalizeRasterBrushPreset(null)).toBe('soft-round');
    });

    it('exposes six brush presets', () => {
        expect(PAINT_BRUSH_PRESET_OPTIONS.map((option) => option.value)).toEqual([
            'soft-round', 'hard-round', 'calligraphy', 'chalk', 'spray', 'marker',
        ]);
    });

    it('clamps config values into valid ranges', () => {
        const normalized = normalizePaintBrushConfig({
            ...baseConfig,
            size: 5000,
            hardness: -10,
            flow: 0.5,
            opacity: 500,
            color: '',
        });
        expect(normalized.size).toBe(1000);
        expect(normalized.hardness).toBe(0);
        expect(normalized.flow).toBe(1);
        expect(normalized.opacity).toBe(100);
        expect(normalized.color).toBe('#000000');
    });

    it('spaces dabs by preset and smoothing', () => {
        const tight = getBrushSpacing({ ...baseConfig, preset: 'hard-round', smoothing: 0 });
        const loose = getBrushSpacing({ ...baseConfig, preset: 'spray', smoothing: 0 });
        expect(loose).toBeGreaterThan(tight);

        const smoothed = getBrushSpacing({ ...baseConfig, preset: 'hard-round', smoothing: 100 });
        expect(smoothed).toBeCloseTo(tight * 2, 5);
    });

    it('stamps a tip centered on the dab point with flow alpha', () => {
        const ctx = createMockContext();
        const tip = { width: 24, height: 24 } as HTMLCanvasElement;
        stampBrushTip(ctx as unknown as CanvasRenderingContext2D, tip, baseConfig, 50, 60);

        expect(ctx.drawImage).toHaveBeenCalledWith(tip, 50 - 12, 60 - 12);
        expect(ctx.globalAlpha).toBeCloseTo(0.8);
        expect(ctx.save).toHaveBeenCalled();
        expect(ctx.restore).toHaveBeenCalled();
    });

    it('sprays scattered dots instead of using a fixed tip', () => {
        const ctx = createMockContext();
        stampBrushTip(ctx as unknown as CanvasRenderingContext2D, null, { ...baseConfig, preset: 'spray' }, 10, 10);
        expect(ctx.arc).toHaveBeenCalled();
        expect(ctx.fill).toHaveBeenCalled();
        expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('commits the stroke buffer with stroke opacity and blend mode', () => {
        const ctx = createMockContext();
        const buffer = { width: 100, height: 100 } as HTMLCanvasElement;
        commitStroke(ctx as unknown as CanvasRenderingContext2D, buffer, { ...baseConfig, opacity: 50, blendMode: 'multiply' });

        expect(ctx.globalAlpha).toBeCloseTo(0.5);
        expect(ctx.globalCompositeOperation).toBe('multiply');
        expect(ctx.drawImage).toHaveBeenCalledWith(buffer, 0, 0);
    });
});
