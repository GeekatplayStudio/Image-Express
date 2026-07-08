import {
    applyRuntimePerformanceShim,
    buildRuntimePerformanceShimSource,
} from '../runtimePerformanceShim';

describe('runtimePerformanceShim', () => {
    it('adds missing performance methods without overwriting existing ones', () => {
        const clearMarks = jest.fn();
        const target = {
            performance: {
                clearMarks,
            },
        };

        applyRuntimePerformanceShim(target);

        expect(target.performance.clearMarks).toBe(clearMarks);
        expect(typeof target.performance.clearMeasures).toBe('function');
        expect(typeof target.performance.mark).toBe('function');
        expect(typeof target.performance.measure).toBe('function');
        expect(target.performance.getEntriesByName?.('test')).toEqual([]);
        expect(target.performance.getEntriesByType?.('mark')).toEqual([]);
    });

    it('does nothing when no performance object exists', () => {
        expect(() => applyRuntimePerformanceShim({})).not.toThrow();
        expect(() => applyRuntimePerformanceShim({ performance: undefined })).not.toThrow();
    });

    it('builds a startup-safe inline script', () => {
        const source = buildRuntimePerformanceShimSource();

        expect(source).toContain('perf.clearMarks');
        expect(source).toContain('perf.clearMeasures');
        expect(source).toContain('perf.getEntriesByName');
        expect(source).toContain('try');
    });
});