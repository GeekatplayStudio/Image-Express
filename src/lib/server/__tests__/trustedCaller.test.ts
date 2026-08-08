/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ApiRequestError } from '@/lib/server/apiContract';
import { assertTrustedCaller, classifyCaller } from '@/lib/server/trustedCaller';
import {
    ensureLocalApiToken,
    getLocalApiTokenPath,
    readLocalApiToken,
    requestHasLocalApiToken,
    resetLocalApiTokenCache,
} from '@/lib/server/localApiToken';

const ORIGINAL_DATA_DIR = process.env.IMAGE_EXPRESS_DATA_DIR;
let tempDir: string;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-token-'));
    process.env.IMAGE_EXPRESS_DATA_DIR = tempDir;
    resetLocalApiTokenCache();
});

afterEach(async () => {
    resetLocalApiTokenCache();
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.IMAGE_EXPRESS_DATA_DIR;
    else process.env.IMAGE_EXPRESS_DATA_DIR = ORIGINAL_DATA_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
});

const request = (headers: Record<string, string> = {}) =>
    new Request('http://localhost:3457/api/designs/delete', { method: 'POST', headers });

describe('local API token', () => {
    it('creates a token on first use and reuses it', () => {
        const first = ensureLocalApiToken();
        expect(first).toBeTruthy();
        expect(first!.length).toBeGreaterThanOrEqual(32);

        resetLocalApiTokenCache();
        expect(ensureLocalApiToken()).toBe(first);
    });

    it('writes it inside the data directory, beside the other secrets', async () => {
        ensureLocalApiToken();
        await expect(fs.stat(getLocalApiTokenPath())).resolves.toBeTruthy();
    });

    it('replaces a truncated token rather than running with a weak secret', async () => {
        await fs.mkdir(path.dirname(getLocalApiTokenPath()), { recursive: true });
        await fs.writeFile(getLocalApiTokenPath(), 'short', 'utf8');
        resetLocalApiTokenCache();

        const token = ensureLocalApiToken();
        expect(token).toBeTruthy();
        expect(token!.length).toBeGreaterThanOrEqual(32);
        expect(token).not.toBe('short');
    });

    it('reads nothing when no token has been created', () => {
        expect(readLocalApiToken()).toBeNull();
    });

    it('accepts a request carrying the token', () => {
        const token = ensureLocalApiToken();
        expect(requestHasLocalApiToken(request({ authorization: `Bearer ${token}` }))).toBe(true);
    });

    it('is case-insensitive about the Bearer scheme', () => {
        const token = ensureLocalApiToken();
        expect(requestHasLocalApiToken(request({ authorization: `bearer ${token}` }))).toBe(true);
    });

    it.each([
        ['a wrong token', 'Bearer not-the-right-token-but-long-enough-to-compare'],
        ['a prefix of the real token', 'Bearer short'],
        ['no scheme', 'justthetoken'],
        ['an empty header', ''],
    ])('rejects %s', (_label, header) => {
        ensureLocalApiToken();
        expect(requestHasLocalApiToken(request({ authorization: header }))).toBe(false);
    });

    it('rejects any token when none has been established', () => {
        // Otherwise an absent token file would mean "everything authenticates".
        expect(requestHasLocalApiToken(request({ authorization: 'Bearer anything-at-all-here' }))).toBe(false);
    });
});

describe('classifyCaller', () => {
    it('recognises the app\'s own UI by the header a page cannot forge', () => {
        expect(classifyCaller(request({ 'sec-fetch-site': 'same-origin' }))).toBe('ui');
        expect(classifyCaller(request({ 'sec-fetch-site': 'none' }))).toBe('ui');
    });

    it('recognises an authorised local tool by its token', () => {
        const token = ensureLocalApiToken();
        expect(classifyCaller(request({ authorization: `Bearer ${token}` }))).toBe('local-tool');
    });

    it('prefers the token even when a site label is present', () => {
        const token = ensureLocalApiToken();
        const kind = classifyCaller(request({
            authorization: `Bearer ${token}`,
            'sec-fetch-site': 'cross-site',
        }));
        expect(kind).toBe('local-tool');
    });

    it('treats an unlabelled request as a local script, not an attack', () => {
        // curl and the test suite send no Sec-Fetch-Site. A local process can
        // already touch the files directly, so refusing these buys nothing.
        expect(classifyCaller(request())).toBe('unlabelled');
    });

    it.each(['cross-site', 'same-site'])('flags %s as driven by another origin', (site) => {
        expect(classifyCaller(request({ 'sec-fetch-site': site }))).toBe('cross-site');
    });
});

describe('assertTrustedCaller', () => {
    it('refuses a cross-site request with 403', () => {
        // The attack this exists for: another page cannot read the reply, but
        // the deletion would still have happened.
        try {
            assertTrustedCaller(request({ 'sec-fetch-site': 'cross-site' }));
            throw new Error('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(ApiRequestError);
            expect((error as ApiRequestError).status).toBe(403);
            expect((error as ApiRequestError).code).toBe('cross_site_request_blocked');
        }
    });

    it.each([
        ['the UI', { 'sec-fetch-site': 'same-origin' }],
        ['an unlabelled local caller', {}],
    ])('allows %s', (_label, headers) => {
        expect(() => assertTrustedCaller(request(headers))).not.toThrow();
    });

    it('allows an authorised local tool', () => {
        const token = ensureLocalApiToken();
        expect(() => assertTrustedCaller(request({
            authorization: `Bearer ${token}`,
            'sec-fetch-site': 'cross-site',
        }))).not.toThrow();
    });
});
