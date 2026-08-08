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

    // Needs more than jest's generic 5s: this reloads the module graph after
    // resetModules and probes the ollama CLI, so it launches a real process.
    // Both get slow under parallel workers on Windows, and it timed out
    // intermittently at the default while passing every time with --runInBand.
    const RUNTIME_PROBE_TIMEOUT_MS = 20_000;

    it('returns installer runtime status with missing summaries', async () => {
        const { getInstallerRuntimeStatus } = await import('@/lib/server/installerRuntimeStatus');
        const status = await getInstallerRuntimeStatus();
        const configuredModels = status.comfyModels.filter((model) => model.source === 'config');

        expect(status.comfyDirectory.exists).toBe(true);
        expect(status.comfyDirectory.gitRepo).toBe(true);
        expect(status.paths.customNodesPath).toBe(path.join(comfyDir, 'custom_nodes'));
        expect(status.paths.modelsPath).toBe(path.join(comfyDir, 'models'));
        expect(status.paths.workflowLibraryPaths).toEqual([path.join(comfyDir, 'user', 'default', 'workflows')]);
        expect(status.paths.statuses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                label: 'Install Folder',
                path: comfyDir,
                exists: true,
            }),
            expect.objectContaining({
                label: 'Custom Nodes Folder',
                path: path.join(comfyDir, 'custom_nodes'),
                exists: true,
            }),
            expect.objectContaining({
                label: 'Models Folder',
                path: path.join(comfyDir, 'models'),
                exists: true,
            }),
            expect.objectContaining({
                label: 'Workflow Folder',
                path: path.join(comfyDir, 'user', 'default', 'workflows'),
                exists: true,
            }),
        ]));
        expect(status.customBundles).toHaveLength(2);
        expect(status.customBundles.every((bundle) => bundle.exists)).toBe(true);
        expect(status.comfyModels.length).toBeGreaterThanOrEqual(2);
        expect(configuredModels).toHaveLength(2);
        expect(status.comfyModels.find((model) => model.id === 'sdxl-base')?.exists).toBe(true);
        expect(status.comfyModels.find((model) => model.id === 'missing-model')?.exists).toBe(false);
        expect(status.comfyModels.some((model) => model.source === 'workflow')).toBe(true);
        expect(status.summary.ready).toBe(false);
        expect(status.summary.missing.some((entry) => entry.includes('missing-model'))).toBe(true);
    }, RUNTIME_PROBE_TIMEOUT_MS);

    it('detects a standard ComfyUI folder from the current workspace when the configured default is missing', async () => {
        delete process.env.IMAGE_EXPRESS_COMFY_DIR;

        const detectedComfyDir = path.join(tmpDir, 'ComfyUI');
        await fs.mkdir(path.join(detectedComfyDir, '.git'), { recursive: true });
        await fs.mkdir(path.join(detectedComfyDir, 'custom_nodes'), { recursive: true });
        await fs.mkdir(path.join(detectedComfyDir, 'user', 'default', 'workflows'), { recursive: true });
        await fs.mkdir(path.join(detectedComfyDir, 'models'), { recursive: true });
        await fs.writeFile(configFile, JSON.stringify({
            comfyUi: { targetDir: 'external/ComfyUI' },
            customBundles: [],
            comfyModels: [],
            ollamaModels: [],
        }), 'utf8');

        const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);

        try {
            jest.resetModules();
            const { getInstallerRuntimeStatus } = await import('@/lib/server/installerRuntimeStatus');
            const status = await getInstallerRuntimeStatus();

            expect(status.comfyDirectory.path).toBe(detectedComfyDir);
            expect(status.comfyDirectory.exists).toBe(true);
            expect(status.paths.customNodesPath).toBe(path.join(detectedComfyDir, 'custom_nodes'));
            expect(status.paths.modelsPath).toBe(path.join(detectedComfyDir, 'models'));
            expect(status.paths.workflowLibraryPaths).toEqual([path.join(detectedComfyDir, 'user', 'default', 'workflows')]);
            expect(status.paths.statuses.every((entry) => entry.exists)).toBe(true);
        } finally {
            cwdSpy.mockRestore();
        }
    }, RUNTIME_PROBE_TIMEOUT_MS);
});
