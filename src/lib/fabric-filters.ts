import * as fabric from 'fabric';
import { CurvePoint, CurvesChannel } from '@/types';

export class CurvesFilter extends fabric.filters.BaseFilter<'Curves', { points: CurvePoint[]; channel?: CurvesChannel; intensity?: number }, { points: CurvePoint[]; channel?: CurvesChannel; intensity?: number }> {
    static type = 'Curves';
    declare points: CurvePoint[];
    declare channel?: CurvesChannel;
    declare intensity?: number;
    private lut: Uint8ClampedArray | null = null;

    constructor(options: { points: CurvePoint[]; channel?: CurvesChannel; intensity?: number }) {
        super(options);
        this.points = options.points;
        this.channel = options.channel;
        this.intensity = options.intensity;
    }

    /**
     * Build Look Up Table (LUT) for the curve.
     * Uses spline interpolation to map 0..255 input to 0..255 output.
     */
    private buildLut(points: CurvePoint[]) {
        const lut = new Uint8ClampedArray(256);
        const clamped = [...points]
            .map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }))
            .sort((a, b) => a.x - b.x);
        
        if (clamped.length === 0) {
            for (let i = 0; i < 256; i += 1) lut[i] = i;
            return lut;
        }

        const normalized = clamped[0].x !== 0 || clamped[0].y !== 0
            ? [{ x: 0, y: 0 }, ...clamped]
            : clamped;
        const withEnd = normalized[normalized.length - 1].x !== 1 || normalized[normalized.length - 1].y !== 1
            ? [...normalized, { x: 1, y: 1 }]
            : normalized;

        const getPoint = (idx: number) => {
            if (idx < 0) return withEnd[0];
            if (idx >= withEnd.length) return withEnd[withEnd.length - 1];
            return withEnd[idx];
        };

        for (let i = 0; i < withEnd.length - 1; i += 1) {
            const p0 = getPoint(i - 1);
            const p1 = getPoint(i);
            const p2 = getPoint(i + 1);
            const p3 = getPoint(i + 2);
            
            // Map x from 0..1 to 0..255
            const start = Math.round(p1.x * 255);
            const end = Math.round(p2.x * 255);
            const span = Math.max(1, end - start);
            
            for (let xi = start; xi <= end; xi += 1) {
                const t = (xi - start) / span;
                const t2 = t * t;
                const t3 = t2 * t;
                
                // Catmull-Rom Spline
                const y = 0.5 * (
                    2 * p1.y +
                    (-p0.y + p2.y) * t +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
                );
                
                lut[xi] = Math.max(0, Math.min(255, Math.round(y * 255)));
            }
        }

        return lut;
    }

    applyTo2d(options: { imageData: ImageData }) {
        if (!this.lut) {
            this.lut = this.buildLut(this.points);
        }
        const data = options.imageData.data;
        const lut = this.lut;
        const channel = this.channel || 'rgb';
        const intensity = typeof this.intensity === 'number' ? Math.min(1, Math.max(0, this.intensity)) : 1;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            if (channel === 'r') {
                const mapped = lut[r];
                data[i] = Math.round(r + (mapped - r) * intensity);
            } else if (channel === 'g') {
                const mapped = lut[g];
                data[i + 1] = Math.round(g + (mapped - g) * intensity);
            } else if (channel === 'b') {
                const mapped = lut[b];
                data[i + 2] = Math.round(b + (mapped - b) * intensity);
            } else if (channel === 'luminosity') {
                 // Master RGB
                 const mappedR = lut[r];
                 const mappedG = lut[g];
                 const mappedB = lut[b];
                 
                 data[i] = Math.round(r + (mappedR - r) * intensity);
                 data[i + 1] = Math.round(g + (mappedG - g) * intensity);
                 data[i + 2] = Math.round(b + (mappedB - b) * intensity);

            } else {
                 // Master RGB
                const mappedR = lut[r];
                const mappedG = lut[g];
                const mappedB = lut[b];
                data[i] = Math.round(r + (mappedR - r) * intensity);
                data[i + 1] = Math.round(g + (mappedG - g) * intensity);
                data[i + 2] = Math.round(b + (mappedB - b) * intensity);
            }
        }
    }
    
    // Ensure Fabric recognizes the type
    get type() { return 'Curves' as const; }

    toObject(): { type: 'Curves'; points: CurvePoint[]; channel?: CurvesChannel; intensity?: number } {
        return { type: 'Curves', points: this.points, channel: this.channel, intensity: this.intensity };
    }
}
