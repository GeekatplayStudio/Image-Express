import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import mime from 'mime';
import { getAssetsDir } from '@/lib/server/appPaths';
import { getVaultThumbnail } from '@/lib/server/vaultThumbnails';
import {
    contentRangeHeader,
    parseRangeHeader,
    unsatisfiedRangeHeader,
} from '@/lib/server/httpRange';

/**
 * Serves the app's own assets — everything under `public/assets`: uploads,
 * generated images, rendered video.
 *
 * This route is the artwork for every library tile, so its behaviour *is* the
 * perceived speed of the user's own work. Three properties are load-bearing:
 *
 * - **Grid requests carry `?w=` and get a cached WebP rendition** from the same
 *   thumbnail store the drive-indexed vault uses. Before this, every generated
 *   image was sent at full size — measured ~1 MB per tile, ~50 MB for one page
 *   of 48.
 * - **Conditional caching via ETag.** The old header was `max-age=0,
 *   must-revalidate` with no validator, which is "refetch everything, every
 *   time" — reopening the vault re-downloaded the entire library. The ETag is
 *   size+mtime, so an unchanged file costs a 304 with no body, and an edited
 *   file is picked up immediately. `max-age` stays 0 deliberately: names can be
 *   reused (rename, re-upload), so correctness comes from the validator, speed
 *   from the 304.
 * - **Streaming with byte ranges.** The old route read whole files with
 *   `readFileSync` — synchronous, so one page of tiles stalled the event loop
 *   48 times, and every other request (including the queue stream) waited.
 *   Ranges are what let a `<video>` seek.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
) {
    try {
        const pathParams = (await params).path;
        if (!pathParams || pathParams.length === 0) {
            return new NextResponse('File not found', { status: 404 });
        }

        // Security: the joined path must stay inside the assets directory.
        const safePath = path.posix.normalize(pathParams.join('/'));
        if (safePath.includes('..')) {
            return new NextResponse('Invalid path', { status: 403 });
        }
        const filePath = path.join(getAssetsDir(), safePath);

        let stats;
        try {
            stats = await stat(filePath);
        } catch {
            return new NextResponse('File not found', { status: 404 });
        }
        if (!stats.isFile()) {
            return new NextResponse('Not a file', { status: 400 });
        }

        const requestedWidth = Number(request.nextUrl.searchParams.get('w') || '');
        const isThumbnailRequest = requestedWidth > 0;

        /**
         * Weak validator from size+mtime — plus the width, because `?w=256`
         * and the full-size request are *different representations of the same
         * URL*. Sharing one validator between them lets a revalidation of the
         * original match the thumbnail's tag and receive a 304, at which point
         * the browser renders cached WebP bytes as if they were the original.
         */
        const etag = `W/"${stats.size.toString(16)}-${Math.round(stats.mtimeMs).toString(16)}`
            + `${isThumbnailRequest ? `-w${requestedWidth}` : ''}"`;

        /**
         * Thumbnails are cacheable for a short window; originals revalidate
         * every time.
         *
         * `no-cache` on tiles was measured as a network round trip *per tile,
         * per fresh open* — 54 tiles cost 841 ms of pure revalidation here, and
         * a library of 200 pays that queued six-at-a-time behind whatever else
         * the browser is fetching. A grid tile is the one thing viewed over and
         * over, so it is the one thing that must not pay that.
         *
         * Five minutes rather than a day: the URL does not change when the file
         * does, so the max-age is the window in which an edited image can look
         * stale. Long enough to make browsing free, short enough that a re-save
         * shows up while you are still looking at it.
         */
        const baseHeaders: Record<string, string> = {
            etag,
            'accept-ranges': 'bytes',
            'cache-control': isThumbnailRequest
                ? 'private, max-age=300, must-revalidate'
                : 'private, no-cache',
            'x-content-type-options': 'nosniff',
        };

        if (request.headers.get('if-none-match') === etag) {
            return new NextResponse(null, { status: 304, headers: baseHeaders });
        }

        // A grid tile asks for a width. Same cache as the drive-indexed vault,
        // so the precache pass and this route never generate twice.
        if (isThumbnailRequest) {
            const thumbnail = await getVaultThumbnail(filePath, requestedWidth);
            if (thumbnail) {
                return new NextResponse(new Uint8Array(thumbnail.body), {
                    headers: {
                        ...baseHeaders,
                        'content-type': thumbnail.contentType,
                        'content-length': String(thumbnail.body.byteLength),
                    },
                });
            }
            // No codec, or not a still image — fall through to the original.
        }

        const contentType = mime.getType(filePath) || 'application/octet-stream';
        const range = parseRangeHeader(request.headers.get('range'), stats.size);

        if (range === 'unsatisfiable') {
            return new NextResponse(null, {
                status: 416,
                headers: { ...baseHeaders, 'content-range': unsatisfiedRangeHeader(stats.size) },
            });
        }

        if (range) {
            const stream = Readable.toWeb(
                createReadStream(filePath, { start: range.start, end: range.end }),
            ) as ReadableStream;
            return new NextResponse(stream, {
                status: 206,
                headers: {
                    ...baseHeaders,
                    'content-type': contentType,
                    'content-length': String(range.end - range.start + 1),
                    'content-range': contentRangeHeader(range, stats.size),
                },
            });
        }

        const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
        return new NextResponse(stream, {
            headers: {
                ...baseHeaders,
                'content-type': contentType,
                'content-length': String(stats.size),
            },
        });
    } catch (e) {
        console.error('Error serving asset:', e);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
