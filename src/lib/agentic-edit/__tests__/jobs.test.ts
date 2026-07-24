/** @jest-environment node */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

jest.mock('@/lib/agentic-edit/providers', () => ({
    resolveModelProvider: jest.fn(),
}));

describe('agentic edit job persistence', () => {
    let temporaryRoot = '';
    const originalDataDir = process.env.IMAGE_EXPRESS_DATA_DIR;
    const originalAssetsDir = process.env.IMAGE_EXPRESS_ASSETS_DIR;

    beforeEach(async () => {
        jest.resetModules();
        temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-express-jobs-'));
        process.env.IMAGE_EXPRESS_DATA_DIR = path.join(temporaryRoot, 'data');
        process.env.IMAGE_EXPRESS_ASSETS_DIR = path.join(temporaryRoot, 'assets');
    });

    afterEach(async () => {
        if (originalDataDir === undefined) delete process.env.IMAGE_EXPRESS_DATA_DIR;
        else process.env.IMAGE_EXPRESS_DATA_DIR = originalDataDir;
        if (originalAssetsDir === undefined) delete process.env.IMAGE_EXPRESS_ASSETS_DIR;
        else process.env.IMAGE_EXPRESS_ASSETS_DIR = originalAssetsDir;
        await fs.rm(temporaryRoot, { recursive: true, force: true });
    });

    it('uses configured paths, versions records, and redacts provider secrets', async () => {
        const { File: NodeFile } = await import('node:buffer');
        const { createGenerateJob } = await import('../jobs');
        const state = await createGenerateJob({
            original: new NodeFile(
                [Buffer.from('image')],
                'source.png',
                { type: 'image/png' },
            ) as unknown as File,
            annotationsJson: {
                image: { id: 'image-1', width: 1, height: 1 },
                annotations: [],
                globalPrompt: { positive: 'test', negative: '' },
                references: [],
                provider: { name: 'mock', model: 'mock-v1', params: {} },
            },
            promptPositive: 'test',
            promptNegative: '',
            providerName: 'mock',
            providerModel: 'mock-v1',
            providerParams: {
                apiKey: 'must-not-persist',
                nested: { accessToken: 'must-not-persist', steps: 4 },
            },
            references: [],
        });

        const storedPath = path.join(
            temporaryRoot,
            'data',
            'ai-jobs',
            `${state.id}.json`,
        );
        const stored = JSON.parse(await fs.readFile(storedPath, 'utf8'));
        expect(stored.schemaVersion).toBe(1);
        expect(stored.provider.params).toEqual({
            apiKey: '[redacted]',
            nested: { accessToken: '[redacted]', steps: 4 },
        });
    });

    it('rejects path traversal identifiers before filesystem access', async () => {
        const { readGenerateJob } = await import('../jobs');
        await expect(readGenerateJob('../../outside')).resolves.toBeNull();
    });
});
