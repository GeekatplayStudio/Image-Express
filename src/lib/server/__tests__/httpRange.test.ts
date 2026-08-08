/**
 * @jest-environment node
 */

import {
    contentRangeHeader,
    parseRangeHeader,
    unsatisfiedRangeHeader,
} from '@/lib/server/httpRange';

const SIZE = 1000;

describe('parseRangeHeader', () => {
    it('returns null when there is no header, so the whole file is served', () => {
        expect(parseRangeHeader(null, SIZE)).toBeNull();
    });

    it('reads the open-ended form a media element sends first', () => {
        // Chrome opens every <video> with "bytes=0-". Getting this wrong means
        // no video ever plays.
        expect(parseRangeHeader('bytes=0-', SIZE)).toEqual({ start: 0, end: 999 });
    });

    it('reads an explicit window', () => {
        expect(parseRangeHeader('bytes=100-199', SIZE)).toEqual({ start: 100, end: 199 });
    });

    it('reads the suffix form as the last N bytes', () => {
        expect(parseRangeHeader('bytes=-300', SIZE)).toEqual({ start: 700, end: 999 });
    });

    it('clamps a suffix longer than the file to the whole file', () => {
        expect(parseRangeHeader('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 });
    });

    it('clamps an end past the last byte rather than rejecting it', () => {
        // Browsers routinely ask for more than exists; RFC 9110 requires the
        // server to clamp, and rejecting would break seeking near the end.
        expect(parseRangeHeader('bytes=900-99999', SIZE)).toEqual({ start: 900, end: 999 });
    });

    it('reports a start past the end as unsatisfiable', () => {
        // Must be 416, not a clamp: a client seeking past the end would
        // otherwise be handed bytes it did not ask for and treat them as valid.
        expect(parseRangeHeader('bytes=1000-1100', SIZE)).toBe('unsatisfiable');
        expect(parseRangeHeader('bytes=5000-', SIZE)).toBe('unsatisfiable');
    });

    it('reports any range against an empty file as unsatisfiable', () => {
        expect(parseRangeHeader('bytes=0-', 0)).toBe('unsatisfiable');
    });

    it('treats a zero-length suffix as unsatisfiable', () => {
        expect(parseRangeHeader('bytes=-0', SIZE)).toBe('unsatisfiable');
    });

    it('ignores multi-range requests so the whole file is sent', () => {
        // Answering these needs multipart/byteranges. No media element asks for
        // them, and ignoring Range entirely is a valid server response.
        expect(parseRangeHeader('bytes=0-99,200-299', SIZE)).toBeNull();
    });

    it.each([
        'bytes=abc-def',
        'items=0-99',
        'bytes=0',
        'bytes=200-100',
        'bytes=-abc',
        '',
    ])('ignores the malformed header %p', (header) => {
        const result = parseRangeHeader(header, SIZE);
        expect(result === null || result === 'unsatisfiable').toBe(true);
    });

    it('accepts a case-insensitive unit and surrounding whitespace', () => {
        expect(parseRangeHeader('  BYTES=10-20 ', SIZE)).toEqual({ start: 10, end: 20 });
    });

    it('rejects a fractional start rather than truncating it', () => {
        expect(parseRangeHeader('bytes=1.5-20', SIZE)).toBeNull();
    });
});

describe('range response headers', () => {
    it('formats Content-Range for a partial response', () => {
        expect(contentRangeHeader({ start: 100, end: 199 }, SIZE)).toBe('bytes 100-199/1000');
    });

    it('names the real size when a range cannot be satisfied', () => {
        // Without the size a client cannot correct its next request.
        expect(unsatisfiedRangeHeader(SIZE)).toBe('bytes */1000');
    });
});
