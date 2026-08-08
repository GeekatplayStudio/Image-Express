/**
 * @jest-environment node
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The behaviour under test is byte-range serving.
 *
 * Before it existed, every whole-file request over 64 MB answered 413 — which
 * on a real drive of render output meant 11,620 of 16,136 videos could not be
 * previewed at all, and a `<video>` could never seek because the browser had to
 * download from byte zero to reach any other point.
 */

// `mime` ships ESM only, which Jest's CommonJS transform cannot load.
jest.mock('mime', () => ({ getType: () => 'video/mp4' }));

jest.mock('@/lib/server/vaultFilesystemPolicy', () => ({
    decideVaultPathAccess: (p: string) => ({ allowed: true, resolvedPath: p }),
    fileUriToPath: (uri: string) => uri.replace('file:///', ''),
    isPathInside: () => true,
}));

jest.mock('@/lib/server/vaultWatchStore', () => ({
    readWatchRootStore: async () => ({ version: 1, roots: [{ id: 'r', rootUri: '/' }] }),
}));

jest.mock('@/lib/server/vaultThumbnails', () => ({
    getVaultThumbnail: async () => null,
}));

import { GET } from '@/app/api/assets/vault/file/route';

const BODY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let directory: string;
let filePath: string;

beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'vault-file-route-'));
    filePath = path.join(directory, 'clip.bin');
    await writeFile(filePath, BODY, 'utf8');
});

afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
});

const request = (headers?: Record<string, string>) => new Request(
    `http://localhost/api/assets/vault/file?uri=${encodeURIComponent(filePath)}`,
    { headers },
);

describe('vault file route', () => {
    it('serves the whole file when nothing asks for a range', async () => {
        const response = await GET(request());
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(BODY);
        expect(response.headers.get('content-length')).toBe(String(BODY.length));
    });

    it('advertises range support even on a full response', async () => {
        // A media element will not attempt a range request without this, so
        // omitting it silently disables seeking.
        const response = await GET(request());
        expect(response.headers.get('accept-ranges')).toBe('bytes');
    });

    it('returns 206 with only the requested bytes', async () => {
        const response = await GET(request({ range: 'bytes=4-8' }));
        expect(response.status).toBe(206);
        expect(await response.text()).toBe('EFGHI');
        expect(response.headers.get('content-range')).toBe('bytes 4-8/26');
        expect(response.headers.get('content-length')).toBe('5');
    });

    it('answers the open-ended request a player opens with', async () => {
        const response = await GET(request({ range: 'bytes=0-' }));
        expect(response.status).toBe(206);
        expect(await response.text()).toBe(BODY);
        expect(response.headers.get('content-range')).toBe('bytes 0-25/26');
    });

    it('answers a suffix request with the tail of the file', async () => {
        // How a player finds an MP4 whose moov atom sits at the end — which is
        // most render output.
        const response = await GET(request({ range: 'bytes=-4' }));
        expect(response.status).toBe(206);
        expect(await response.text()).toBe('WXYZ');
    });

    it('answers 416 rather than sending bytes for an out-of-range seek', async () => {
        const response = await GET(request({ range: 'bytes=500-600' }));
        expect(response.status).toBe(416);
        expect(response.headers.get('content-range')).toBe('bytes */26');
        expect(await response.text()).toBe('');
    });

    it('falls back to the whole file for a multi-range request', async () => {
        // Answering these needs multipart/byteranges; ignoring Range is valid.
        const response = await GET(request({ range: 'bytes=0-3,10-13' }));
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(BODY);
    });
});
