/**
 * @jest-environment node
 */

// The desktop shell's only redaction path. It guards the file users are asked
// to attach to support tickets, so the cost of a miss is a leaked credential in
// someone's inbox — worth testing directly rather than through Electron.
// CommonJS on purpose: the shell is CJS, and the test should load exactly the
// module Electron loads rather than a transpiled view of it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logRedaction = require('../electron/logRedaction');

const {
    LOG_TEXT_LIMIT,
    DIAGNOSTIC_VALUE_LIMIT,
    truncateForLog,
    redactSensitive,
    safeLogText,
    createDiagnosticRedactor,
} = logRedaction;

describe('truncateForLog', () => {
    it('returns non-strings as empty rather than throwing', () => {
        expect(truncateForLog(undefined)).toBe('');
        expect(truncateForLog(null)).toBe('');
        expect(truncateForLog(42)).toBe('');
    });

    it('trims but keeps text under the limit intact', () => {
        expect(truncateForLog('  server started  ')).toBe('server started');
    });

    it('caps long text and says how much was dropped', () => {
        const result = truncateForLog('x'.repeat(LOG_TEXT_LIMIT + 250));
        expect(result.startsWith('x'.repeat(LOG_TEXT_LIMIT))).toBe(true);
        expect(result).toContain('[250 more chars]');
    });
});

describe('redactSensitive', () => {
    it('strips bearer tokens but keeps the scheme visible', () => {
        expect(redactSensitive('Authorization: Bearer abcdef1234567890'))
            .toContain('Bearer [redacted]');
    });

    it('strips key=value credentials in unstructured output', () => {
        const out = redactSensitive('starting with API_KEY=sk-live-9f8e7d6c5b4a env ok');
        expect(out).not.toContain('9f8e7d6c5b4a');
        expect(out).toContain('[redacted]');
    });

    it('strips a bare sk- key with no surrounding label', () => {
        // The case the previous inline redactor missed: a key echoed on its own.
        expect(redactSensitive('using sk-abcd1234efgh5678 now')).toBe('using [redacted] now');
    });

    it('leaves ordinary output untouched', () => {
        expect(redactSensitive('Listening on http://127.0.0.1:3042'))
            .toBe('Listening on http://127.0.0.1:3042');
    });

    it('passes empty input through without throwing', () => {
        expect(redactSensitive('')).toBe('');
        expect(redactSensitive(undefined)).toBeUndefined();
    });
});

describe('safeLogText', () => {
    it('truncates and redacts together', () => {
        const noisy = `${'a'.repeat(LOG_TEXT_LIMIT)} Bearer abcdef1234567890`;
        const out = safeLogText(noisy);
        expect(out).toContain('more chars]');
        expect(out).not.toContain('abcdef1234567890');
    });
});

describe('createDiagnosticRedactor', () => {
    const redact = createDiagnosticRedactor(() => [
        { path: 'C:\\Users\\real-person', label: '<home>' },
        { path: 'C:\\Program Files\\Image Express', label: '<app-data>' },
    ]);

    it('masks user paths so a log cannot identify the person', () => {
        expect(redact('failed reading C:\\Users\\real-person\\vault\\a.png'))
            .toBe('failed reading <home>\\vault\\a.png');
    });

    it('masks the install path', () => {
        expect(redact('load C:\\Program Files\\Image Express\\server.js'))
            .toBe('load <app-data>\\server.js');
    });

    it('redacts values under sensitive keys whatever they hold', () => {
        expect(redact({ apiKey: 'anything', prompt: 'a cat', port: 3042 }))
            .toEqual({ apiKey: '[redacted]', prompt: '[redacted]', port: 3042 });
    });

    it('still pattern-redacts values under innocuous keys', () => {
        expect(redact({ note: 'Bearer abcdef1234567890' }).note)
            .toBe('Bearer [redacted]');
    });

    it('recurses into nested objects and arrays', () => {
        expect(redact({ outer: { inner: [{ token: 'x' }, 'plain'] } }))
            .toEqual({ outer: { inner: [{ token: '[redacted]' }, 'plain'] } });
    });

    it('stops recursing at depth 5 rather than following a cycle forever', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        // The guard is what makes a self-referential object loggable at all.
        expect(() => redact(cyclic)).not.toThrow();
        expect(JSON.stringify(redact(cyclic))).toContain('[truncated]');
    });

    it('caps arrays so one huge list cannot dominate a log entry', () => {
        expect(redact(Array.from({ length: 200 }, (_, i) => i))).toHaveLength(50);
    });

    it('caps string length per value', () => {
        expect(redact('y'.repeat(DIAGNOSTIC_VALUE_LIMIT + 500)))
            .toHaveLength(DIAGNOSTIC_VALUE_LIMIT);
    });

    it('passes primitives through unchanged', () => {
        expect(redact(7)).toBe(7);
        expect(redact(true)).toBe(true);
        expect(redact(null)).toBeNull();
    });

    it('works with no roots configured', () => {
        expect(createDiagnosticRedactor()('plain text')).toBe('plain text');
    });
});
