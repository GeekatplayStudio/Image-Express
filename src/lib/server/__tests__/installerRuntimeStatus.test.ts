/** @jest-environment node */

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

describe('installerRuntimeStatus', () => {
    const originalConfigFile = process.env.IMAGE_EXPRESS_INSTALLER_CONFIG_FILE;
    const originalComfyDir = process.env.IMAGE_EXPRESS_COMFY_DIR;

    let tmpDir = '';
    let configFile = '';
    let comfyDir = '';

    beforeEach(async () => {
        jest.resetModules();
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-express-installer-status-'));
        configFile = path.join(tmpDir, 'sources.json');
        comfyDir = path.join(tmpDir, 'ComfyUI');
        await fs.mkdir(comfyDir, { recursive: true });
        await fs.mkdir(path.join(comfyDir, '.git'), { recursive: true });
        await fs.mkdir(path.join(comfyDir, 'custom_nodes', 'bundle-a'), { recursive: true });
        await fs.mkdir(path.join(comfyDir, 'user', 'default', 'workflows', 'bundle-workflows'), { recursive: true });
        await fs.mkdir(path.join(comfyDir, 'models', 'checkpoints'), { recursive: true });
        await fs.writeFile(path.join(comfyDir, 'models', 'checkpoints', 'sdxl.safetensors'), 'stub');

        await fs.writeFile(configFile, JSON.stringify({
            comfyUi: { targetDir: 'unused-in-test' },
            customBundles: [
                {
                    name: 'Bundle A',
                    targetPath: 'custom_nodes/bundle-a',
                    bundleType: 'custom-node',
                },
                {
                    name: 'Workflow Bundle',
                    targetPath: 'user/default/workflows/bundle-workflows',
                    bundleType: 'workflow-library',
                },
            ],
            comfyModels: [
                {
                    id: 'sdxl-base',
                    displayName: 'SDXL Base',
                    targetPath: 'models/checkpoints/sdxl.safetensors',
                },
                {
                    id: 'missing-model',
                    displayName: 'Missing Model',
                    targetPath: 'models/checkpoints/missing.safetensors',
                },
            ],
            ollamaModels: [
                { id: 'llava:13b', displayName: 'LLaVA 13B' },
            ],
        }), 'utf8');

        process.env.IMAGE_EXPRESS_INSTALLER_CONFIG_FILE = configFile;
        process.env.IMAGE_EXPRESS_COMFY_DIR = comfyDir;
    });

    afterEach(async () => {
        if (originalConfigFile === undefined) delete process.env.IMAGE_EXPRESS_INSTALLER_CONFIG_FILE;
        else process.env.IMAGE_EXPRESS_INSTALLER_CONFIG_FILE = originalConfigFile;

        if (originalComfyDir === undefined) delete process.env.IMAGE_EXPRESS_COMFY_DIR;
        else process.env.IMAGE_EXPRESS_COMFY_DIR = originalComfyDir;

        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('returns installer runtime status with missing summaries', async () => {
        const { getInstallerRuntimeStatus } = await import('@/lib/server/installerRuntimeStatus');
        const status = await getInstallerRuntimeStatus();

        expect(status.comfyDirectory.exists).toBe(true);
        expect(status.comfyDirectory.gitRepo).toBe(true);
        expect(status.customBundles).toHaveLength(2);
        expect(status.customBundles.every((bundle) => bundle.exists)).toBe(true);
        expect(status.comfyModels).toHaveLength(2);
        expect(status.comfyModels.find((model) => model.id === 'sdxl-base')?.exists).toBe(true);
        expect(status.comfyModels.find((model) => model.id === 'missing-model')?.exists).toBe(false);
        expect(status.summary.ready).toBe(false);
        expect(status.summary.missing.some((entry) => entry.includes('missing-model'))).toBe(true);
    });
});
