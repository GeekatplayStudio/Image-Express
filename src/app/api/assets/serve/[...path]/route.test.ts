/**
 * @jest-environment node
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NextRequest } from 'next/server';

/**
 * This route serves every asset the user made in the app, so its behaviour is
 * the perceived speed of their own library. The properties pinned here are the
 * ones whose loss caused real complaints:
 *
 * - no validator meant "refetch the whole library on every vault open";
 * - no `?w=` meant a ~1 MB original per grid tile;
 * - `readFileSync` (not tested here, but replaced by streaming) stalled the
 *   whole event loop per request.
 */

// `mime` ships ESM only, which Jest's CommonJS transform cannot load.
jest.mock('mime', () => ({ getType: () => 'image/png' }));

let assetsDir: string;
jest.mock('@/lib/server/appPaths', () => ({
    getAssetsDir: () => assetsDir,
    // vaultThumbnails caches under the vault dir; point it at the temp dir too.
    getVaultDir: () => assetsDir,
    // Real implementation: modules under test join runtime paths through this.
    joinRuntimePath: (...segments: string[]) => path.join(...segments),
}));

import { GET } from '@/app/api/assets/serve/[...path]/route';

const BODY = '0123456789ABCDEF';

beforeAll(async () => {
    assetsDir = await mkdtemp(path.join(tmpdir(), 'serve-route-'));
    await writeFile(path.join(assetsDir, 'pic.png'), BODY, 'utf8');
});

afterAll(async () => {
    await rm(assetsDir, { recursive: true, force: true });
});

const request = (url: string, headers?: Record<string, string>) => (
    Object.assign(new Request(url, { headers }), {
        nextUrl: new URL(url),
    }) as unknown as NextRequest
);

const call = (segments: string[], headers?: Record<string, string>, query = '') => GET(
    request(`http://localhost/api/assets/serve/${segments.join('/')}${query}`, headers),
    { params: Promise.resolve({ path: segments }) },
);

describe('asset serve route', () => {
    it('serves the file with a validator and range support advertised', async () => {
        const response = await call(['pic.png']);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(BODY);
        // Without the ETag every vault open refetches the entire library;
        // without accept-ranges no server-hosted video can seek.
        expect(response.headers.get('etag')).toBeTruthy();
        expect(response.headers.get('accept-ranges')).toBe('bytes');
    });

    it('answers 304 with no body when the client already has this version', async () => {
        const first = await call(['pic.png']);
        const etag = first.headers.get('etag')!;
        const revalidated = await call(['pic.png'], { 'if-none-match': etag });
        expect(revalidated.status).toBe(304);
        expect(await revalidated.text()).toBe('');
    });

    it('changes the validator when the file changes', async () => {
        const before = (await call(['pic.png'])).headers.get('etag');
        await writeFile(path.join(assetsDir, 'pic.png'), `${BODY}!`, 'utf8');
        const after = (await call(['pic.png'])).headers.get('etag');
        // Same name, new content: a stale 304 here would pin the old image in
        // the grid with no way to refresh it.
        expect(after).not.toBe(before);
        await writeFile(path.join(assetsDir, 'pic.png'), BODY, 'utf8');
    });

    it('serves only the requested bytes for a range', async () => {
        const response = await call(['pic.png'], { range: 'bytes=4-7' });
        expect(response.status).toBe(206);
        expect(await response.text()).toBe('4567');
        expect(response.headers.get('content-range')).toBe(`bytes 4-7/${BODY.length}`);
    });

    it('answers 416 for a seek past the end of the file', async () => {
        const response = await call(['pic.png'], { range: 'bytes=999-' });
        expect(response.status).toBe(416);
        expect(response.headers.get('content-range')).toBe(`bytes */${BODY.length}`);
    });


    it('gives the thumbnail and the original different validators', async () => {
        // These are two representations of one URL. Sharing a validator meant a
        // revalidation of the original matched the thumbnail's tag and got a
        // bodiless 304 — so the browser rendered a cached WebP thumbnail as the
        // full-size image, or nothing at all. That is what a user saw as a
        // preview window opening empty, and only after enough browsing to have
        // cached a thumbnail first.
        const original = await call(['pic.png']);
        const thumbnail = await call(['pic.png'], undefined, '?w=256');
        expect(original.headers.get('etag')).toBeTruthy();
        expect(thumbnail.headers.get('etag')).not.toBe(original.headers.get('etag'));
    });

    it('does not answer 304 when the validator came from the other variant', async () => {
        const thumbnail = await call(['pic.png'], undefined, '?w=256');
        const thumbEtag = thumbnail.headers.get('etag')!;

        const response = await call(['pic.png'], { 'if-none-match': thumbEtag });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(BODY);
    });

    it('lets the browser cache a tile but keeps the original revalidating', async () => {
        // A grid tile is viewed over and over, so it must not cost a network
        // round trip per open — measured at 841 ms of pure revalidation for 54
        // tiles. The original is requested rarely and stays strict.
        const thumbnail = await call(['pic.png'], undefined, '?w=256');
        expect(thumbnail.headers.get('cache-control')).toContain('max-age=300');

        const original = await call(['pic.png']);
        expect(original.headers.get('cache-control')).toBe('private, no-cache');
    });

    it('still revalidates a tile against its own validator', async () => {
        const thumbnail = await call(['pic.png'], undefined, '?w=256');
        const etag = thumbnail.headers.get('etag')!;
        const again = await call(['pic.png'], { 'if-none-match': etag }, '?w=256');
        expect(again.status).toBe(304);
    });

    it('rejects path traversal', async () => {
        const response = await call(['..', 'secrets.txt']);
        expect(response.status).toBe(403);
    });

    it('404s a missing file without throwing', async () => {
        const response = await call(['nope.png']);
        expect(response.status).toBe(404);
    });

    it('falls back to the original when ?w= is asked of a file no codec reads', async () => {
        // The tiny text file is not a decodable image, so the thumbnail path
        // declines and the original must still be served — a tile is slow
        // before it is broken.
        const response = await call(['pic.png'], undefined, '?w=256');
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(BODY);
    });
});
