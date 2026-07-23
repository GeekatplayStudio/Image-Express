/** @jest-environment node */

import {
    authorizeLocalRuntimeCapability,
    getRuntimeProfile,
} from '@/lib/server/runtimeProfile';

describe('runtimeProfile', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        process.env.NODE_ENV = 'test';
        delete process.env.IMAGE_EXPRESS_RUNTIME;
        delete process.env.IMAGE_EXPRESS_LOCAL_CAPABILITY_TOKEN;
        delete process.env.NEXT_DESKTOP;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('defaults tests and local development to developer-local', () => {
        expect(getRuntimeProfile()).toBe('developer-local');
    });

    it('denies machine maintenance in self-hosted mode', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'self-hosted';
        const response = authorizeLocalRuntimeCapability(
            new Request('http://localhost:3000/api/system/update'),
            'app:update',
        );
        expect(response?.status).toBe(403);
        await expect(response?.json()).resolves.toEqual(expect.objectContaining({
            message: expect.stringContaining('disabled in self-hosted mode'),
        }));
    });

    it('requires the per-launch capability in desktop mode', () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'desktop-local';
        process.env.IMAGE_EXPRESS_LOCAL_CAPABILITY_TOKEN = 'desktop-secret';

        expect(authorizeLocalRuntimeCapability(
            new Request('http://127.0.0.1:3927/api/runtime/installer/run'),
            'runtime:install',
        )?.status).toBe(403);

        expect(authorizeLocalRuntimeCapability(
            new Request('http://127.0.0.1:3927/api/runtime/installer/run', {
                headers: { 'x-image-express-capability': 'desktop-secret' },
            }),
            'runtime:install',
        )).toBeNull();
    });

    it('rejects non-loopback developer requests', () => {
        expect(authorizeLocalRuntimeCapability(
            new Request('http://192.168.1.25:3000/api/runtime/dependencies/run'),
            'dependencies:manage',
        )?.status).toBe(403);
    });
});
