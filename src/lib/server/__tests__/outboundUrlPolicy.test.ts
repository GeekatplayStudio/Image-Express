/**
 * @jest-environment node
 */

import { OutboundUrlError, assertFetchableUrl, isFetchableUrl } from '@/lib/server/outboundUrlPolicy';

const ORIGINAL_PROFILE = process.env.IMAGE_EXPRESS_RUNTIME;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

const asProfile = (profile: string) => {
    process.env.IMAGE_EXPRESS_RUNTIME = profile;
};

afterEach(() => {
    if (ORIGINAL_PROFILE === undefined) delete process.env.IMAGE_EXPRESS_RUNTIME;
    else process.env.IMAGE_EXPRESS_RUNTIME = ORIGINAL_PROFILE;
    if (ORIGINAL_NODE_ENV !== undefined) process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

const rejects = (url: string) => {
    expect(() => assertFetchableUrl(url)).toThrow(OutboundUrlError);
};

describe('assertFetchableUrl — refused everywhere', () => {
    beforeEach(() => asProfile('desktop-local'));

    it.each([
        'http://169.254.169.254/latest/meta-data/',
        'http://169.254.169.254',
        'https://169.254.1.1/',
    ])('refuses link-local %s, where cloud credentials live', (url) => rejects(url));

    it('refuses IPv6 link-local', () => rejects('http://[fe80::1]/'));

    it.each([
        'file:///etc/passwd',
        'data:text/plain,hello',
        'ftp://example.com/x',
        'javascript:alert(1)',
    ])('refuses non-http scheme %s', (url) => rejects(url));

    it('refuses embedded credentials, which would be sent to the host', () => {
        rejects('http://user:pass@example.com/x');
    });

    it.each(['not a url', '', 'example.com/no-scheme', '///'])(
        'refuses unparseable input %p', (url) => rejects(url),
    );

    it('describes the category refused, never whether a host exists', () => {
        // A message that differed per host would make this a port scanner.
        try {
            assertFetchableUrl('http://169.254.169.254/');
        } catch (error) {
            expect((error as Error).message).not.toContain('169.254');
        }
    });
});

describe('assertFetchableUrl — allowed on a local install', () => {
    beforeEach(() => asProfile('desktop-local'));

    it('allows ordinary public URLs', () => {
        expect(assertFetchableUrl('https://cdn.example.com/a.png').hostname).toBe('cdn.example.com');
    });

    it('allows loopback, because that is the user\'s own ComfyUI', () => {
        // Blocking this would break saving a locally generated image — an
        // attack that already requires code on the machine is not worth that.
        expect(isFetchableUrl('http://127.0.0.1:8188/view?filename=out.png')).toBe(true);
        expect(isFetchableUrl('http://localhost:11434/api/tags')).toBe(true);
    });

    it('allows a LAN address on a local install', () => {
        expect(isFetchableUrl('http://192.168.1.50:8188/view')).toBe(true);
    });

    it('preserves the parsed URL for the caller', () => {
        const parsed = assertFetchableUrl('https://example.com/a/b?c=d');
        expect(parsed.pathname).toBe('/a/b');
        expect(parsed.search).toBe('?c=d');
    });
});

describe('assertFetchableUrl — self-hosted is stricter', () => {
    beforeEach(() => asProfile('self-hosted'));

    it.each([
        'http://127.0.0.1:8188/view',
        'http://localhost/admin',
        'http://[::1]/',
        'http://10.0.0.5/',
        'http://192.168.1.1/',
        'http://172.16.0.1/',
        'http://100.64.0.1/',
        'http://db.internal/',
        'http://printer.local/',
    ])('refuses internal address %s', (url) => rejects(url));

    it('refuses IPv6 unique-local', () => rejects('http://[fd00::1]/'));

    it('still allows public URLs', () => {
        expect(isFetchableUrl('https://cdn.example.com/a.png')).toBe(true);
    });

    it('gives a reason that names the deployment, not the target', () => {
        try {
            assertFetchableUrl('http://10.0.0.5/');
        } catch (error) {
            expect((error as Error).message).toContain('deployment');
            expect((error as Error).message).not.toContain('10.0.0.5');
        }
    });
});

describe('isFetchableUrl', () => {
    beforeEach(() => asProfile('desktop-local'));

    it('answers without throwing', () => {
        expect(isFetchableUrl('https://example.com')).toBe(true);
        expect(isFetchableUrl('file:///etc/passwd')).toBe(false);
        expect(isFetchableUrl('nonsense')).toBe(false);
    });
});
