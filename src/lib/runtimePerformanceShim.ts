type PerformanceLike = {
    clearMarks?: (() => void) | ((name?: string) => void);
    clearMeasures?: (() => void) | ((name?: string) => void);
    mark?: (name: string, options?: Record<string, unknown>) => void;
    measure?: (
        measureName: string,
        startOrMeasureOptions?: string | Record<string, unknown>,
        endMark?: string,
    ) => void;
    getEntriesByName?: (name: string, type?: string) => unknown[];
    getEntriesByType?: (type: string) => unknown[];
};

type PerformanceTarget = {
    performance?: PerformanceLike;
};

const noop = () => {};
const emptyEntries = () => [] as unknown[];

export function applyRuntimePerformanceShim(target: PerformanceTarget) {
    const perf = target?.performance;
    if (!perf || typeof perf !== 'object') {
        return;
    }

    if (typeof perf.clearMarks !== 'function') {
        perf.clearMarks = noop;
    }

    if (typeof perf.clearMeasures !== 'function') {
        perf.clearMeasures = noop;
    }

    if (typeof perf.mark !== 'function') {
        perf.mark = noop;
    }

    if (typeof perf.measure !== 'function') {
        perf.measure = noop;
    }

    if (typeof perf.getEntriesByName !== 'function') {
        perf.getEntriesByName = emptyEntries;
    }

    if (typeof perf.getEntriesByType !== 'function') {
        perf.getEntriesByType = emptyEntries;
    }
}

export function buildRuntimePerformanceShimSource() {
    return `(() => {
  const noop = () => {};
  const emptyEntries = () => [];
  try {
    const perf = window.performance;
    if (!perf || typeof perf !== 'object') {
      return;
    }

    if (typeof perf.clearMarks !== 'function') perf.clearMarks = noop;
    if (typeof perf.clearMeasures !== 'function') perf.clearMeasures = noop;
    if (typeof perf.mark !== 'function') perf.mark = noop;
    if (typeof perf.measure !== 'function') perf.measure = noop;
    if (typeof perf.getEntriesByName !== 'function') perf.getEntriesByName = emptyEntries;
    if (typeof perf.getEntriesByType !== 'function') perf.getEntriesByType = emptyEntries;
  } catch {}
})();`;
}