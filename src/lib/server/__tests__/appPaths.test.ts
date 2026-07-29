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
        const root = path.resolve('/opt/image-express/app');
        const data = path.resolve('/var/lib/image-express/data');
        const assets = path.resolve('/var/lib/image-express/assets');
        const logs = path.resolve('/var/log/image-express');
        const publicDir = path.resolve('/opt/image-express/public');

        process.env.IMAGE_EXPRESS_PROJECT_ROOT = root;
        process.env.IMAGE_EXPRESS_DATA_DIR = data;
        process.env.IMAGE_EXPRESS_ASSETS_DIR = assets;
        process.env.IMAGE_EXPRESS_LOGS_DIR = logs;
        process.env.IMAGE_EXPRESS_BUNDLED_PUBLIC_DIR = publicDir;

        expect(getProjectRoot()).toBe(root);
        expect(getDataDir()).toBe(data);
        expect(getAssetsDir()).toBe(assets);
        expect(getLogsDir()).toBe(logs);
        expect(getBundledPublicDir()).toBe(publicDir);
    });
});
