/** @jest-environment node */

import path from 'node:path';
import {
    getAssetsDir,
    getBundledPublicDir,
    getDataDir,
    getLogsDir,
    getProjectRoot,
} from '@/lib/server/appPaths';

describe('appPaths', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.IMAGE_EXPRESS_PROJECT_ROOT;
        delete process.env.IMAGE_EXPRESS_DATA_DIR;
        delete process.env.IMAGE_EXPRESS_ASSETS_DIR;
        delete process.env.IMAGE_EXPRESS_LOGS_DIR;
        delete process.env.IMAGE_EXPRESS_BUNDLED_PUBLIC_DIR;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('keeps source-development paths backward compatible', () => {
        expect(getProjectRoot()).toBe(process.cwd());
        expect(getDataDir()).toBe(path.join(process.cwd(), 'data'));
        expect(getAssetsDir()).toBe(path.join(process.cwd(), 'public', 'assets'));
        expect(getLogsDir()).toBe(path.join(process.cwd(), 'logs'));
        expect(getBundledPublicDir()).toBe(path.join(process.cwd(), 'public'));
    });

    it('uses explicit packaged runtime paths', () => {
        process.env.IMAGE_EXPRESS_PROJECT_ROOT = '/opt/image-express/app';
        process.env.IMAGE_EXPRESS_DATA_DIR = '/var/lib/image-express/data';
        process.env.IMAGE_EXPRESS_ASSETS_DIR = '/var/lib/image-express/assets';
        process.env.IMAGE_EXPRESS_LOGS_DIR = '/var/log/image-express';
        process.env.IMAGE_EXPRESS_BUNDLED_PUBLIC_DIR = '/opt/image-express/public';

        expect(getProjectRoot()).toBe('/opt/image-express/app');
        expect(getDataDir()).toBe('/var/lib/image-express/data');
        expect(getAssetsDir()).toBe('/var/lib/image-express/assets');
        expect(getLogsDir()).toBe('/var/log/image-express');
        expect(getBundledPublicDir()).toBe('/opt/image-express/public');
    });
});
