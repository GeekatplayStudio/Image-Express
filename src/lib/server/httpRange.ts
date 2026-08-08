/**
 * `Range` header parsing for byte-range file serving.
 *
 * The vault serves indexed files straight off disk, and without range support a
 * `<video>` element cannot seek: the browser has to download from byte zero to
 * wherever it wants to be. Against a real drive of render output — 16,136 videos,
 * 11,620 of them over 64 MB — that is the difference between a poster frame
 * costing a few hundred kilobytes and costing the whole file.
 *
 * Deliberately narrow: a single range only. Multi-range responses need
 * multipart/byteranges, which no media element asks for, so the caller treats
 * multiple ranges as "no range" and sends the whole file — allowed by RFC 9110,
 * which lets a server ignore Range entirely.
 */

export type ByteRange = { start: number; end: number };

/**
 * `null` — no usable range, serve the whole file.
 * `'unsatisfiable'` — a syntactically valid range that falls outside the file,
 * which must be answered with 416 rather than silently clamped, otherwise a
 * client seeking past the end receives bytes it did not ask for.
 */
export type RangeResult = ByteRange | 'unsatisfiable' | null;

export function parseRangeHeader(header: string | null, size: number): RangeResult {
    if (!header) return null;

    const match = /^bytes=(.*)$/i.exec(header.trim());
    if (!match) return null;

    const specs = match[1].split(',');
    // Multipart responses are not worth the complexity for a local file server.
    if (specs.length !== 1) return null;

    const spec = specs[0].trim();
    const [rawStart, rawEnd] = spec.split('-', 2);
    // "bytes=0" has no dash at all and is malformed.
    if (rawEnd === undefined) return null;

    // A zero-length file cannot satisfy any range.
    if (size <= 0) return 'unsatisfiable';

    // Suffix form: "bytes=-500" means the last 500 bytes.
    if (rawStart === '') {
        const suffixLength = Number(rawEnd);
        if (!Number.isInteger(suffixLength) || suffixLength <= 0) return 'unsatisfiable';
        return { start: Math.max(0, size - suffixLength), end: size - 1 };
    }

    const start = Number(rawStart);
    if (!Number.isInteger(start) || start < 0) return null;
    if (start >= size) return 'unsatisfiable';

    // Open-ended "bytes=0-" is what media elements send first.
    if (rawEnd === '') return { start, end: size - 1 };

    const end = Number(rawEnd);
    if (!Number.isInteger(end) || end < start) return null;
    // A range that overshoots the end is clamped rather than rejected: the spec
    // requires it, and browsers routinely ask for more than exists.
    return { start, end: Math.min(end, size - 1) };
}

/** The `Content-Range` value for a 206 response. */
export function contentRangeHeader(range: ByteRange, size: number): string {
    return `bytes ${range.start}-${range.end}/${size}`;
}

/** The `Content-Range` value for a 416 response, which names the real size. */
export function unsatisfiedRangeHeader(size: number): string {
    return `bytes */${size}`;
}
