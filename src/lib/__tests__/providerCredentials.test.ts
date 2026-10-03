import { isMissingSanitizedKey, sanitizeHeaderValue } from '@/lib/providerCredentials';

describe('sanitizeHeaderValue', () => {
    it('strips a pasted Bearer prefix in any case', () => {
        expect(sanitizeHeaderValue('Bearer abc123')).toBe('abc123');
        expect(sanitizeHeaderValue('bearer abc123')).toBe('abc123');
        expect(sanitizeHeaderValue('BEARER abc123')).toBe('abc123');
    });

    it('strips quotes copied along with the key', () => {
        expect(sanitizeHeaderValue('"abc123"')).toBe('abc123');
        expect(sanitizeHeaderValue("'abc123'")).toBe('abc123');
    });

    it('trims surrounding whitespace and newlines', () => {
        expect(sanitizeHeaderValue('  abc123\n')).toBe('abc123');
    });

    it('leaves a clean key, including an ak:sk pair, untouched', () => {
        expect(sanitizeHeaderValue('ak_live:sk_live-9')).toBe('ak_live:sk_live-9');
    });
});

describe('isMissingSanitizedKey', () => {
    it.each(['', '   ', 'undefined', 'null', 'NaN', 'Bearer', ' NULL '])(
        'treats %p as no key at all',
        (value) => {
            expect(isMissingSanitizedKey(value)).toBe(true);
        },
    );

    it('accepts a real key, even one that merely contains a placeholder word', () => {
        expect(isMissingSanitizedKey('abc123')).toBe(false);
        expect(isMissingSanitizedKey('nullable-key-1')).toBe(false);
    });

    it('catches a lone Bearer prefix once it has been sanitised', () => {
        // "Bearer " with nothing after it sanitises to '', not to "bearer".
        expect(isMissingSanitizedKey(sanitizeHeaderValue('Bearer '))).toBe(true);
    });
});
