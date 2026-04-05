import path from 'path';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import type {
    InstallerRuntimeStatus,
    RuntimeBundleStatus,
    RuntimeModelStatus,
} from '@/lib/installerRuntimeStatus';
import {
    collectInstallerComfyModels,
    countInstallerWorkspaceWorkflowFiles,
    listInstallerWorkspaceSyncDirectories,
    readInstallerConfig,
    resolveConfigFilePath,
    resolveInstallerComfyDirectory,
    resolveInstallerLocalWorkspaceDirectory,
    type InstallerConfig,
} from '@/lib/server/comfyInstallerCatalog';

async function pathExists(targetPath: string) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function checkOllamaCliAvailable() {
    try {
        const result = spawnSync('ollama', ['--version'], { stdio: 'ignore' });
        return result.status === 0;
    } catch {
        return false;
    }
}

export async function getInstallerRuntimeStatus(comfyDirOverride = ''): Promise<InstallerRuntimeStatus> {
    const configFile = resolveConfigFilePath();
    const config = await readInstallerConfig(configFile);
    const comfyDir = resolveInstallerComfyDirectory(config, comfyDirOverride);
    const comfyExists = await pathExists(comfyDir);
    const gitRepo = comfyExists && await pathExists(path.join(comfyDir, '.git'));

    const customBundles = await Promise.all(
        (Array.isArray(config.customBundles) ? config.customBundles : [])
            .filter((bundle) => typeof bundle?.targetPath === 'string' && bundle.targetPath.trim())
            .map(async (bundle) => {
                const targetPath = bundle.targetPath!.trim();
                const absolutePath = path.join(comfyDir, targetPath);
                return {
                    name: bundle.name?.trim() || targetPath,
                    bundleType: bundle.bundleType?.trim() || 'custom',
                    targetPath,
                    exists: await pathExists(absolutePath),
                } satisfies RuntimeBundleStatus;
            }),
    );

    const comfyModels = await Promise.all(
        (await collectInstallerComfyModels(config))
            .filter((model) => typeof model?.targetPath === 'string' && model.targetPath.trim())
            .map(async (model) => {
                const targetPath = model.targetPath!.trim();
                const absolutePath = path.join(comfyDir, targetPath);
                return {
                    id: model.id,
                    displayName: model.displayName || model.id,
                    targetPath,
                    exists: await pathExists(absolutePath),
                    category: model.category,
                    recommendedFor: model.recommendedFor,
                    source: model.source,
                } satisfies RuntimeModelStatus;
            }),
    );

    const localWorkspacePath = resolveInstallerLocalWorkspaceDirectory(config);
    const localWorkspaceExists = await pathExists(localWorkspacePath);
    const localWorkspace = {
        path: localWorkspacePath,
        exists: localWorkspaceExists,
        installTargetPath: comfyDir,
        workflowFileCount: localWorkspaceExists ? await countInstallerWorkspaceWorkflowFiles(localWorkspacePath) : 0,
        syncedDirectories: localWorkspaceExists ? await listInstallerWorkspaceSyncDirectories(localWorkspacePath) : [],
    };

    const ollama = {
        cliAvailable: checkOllamaCliAvailable(),
        configuredModels: (Array.isArray(config.ollamaModels) ? config.ollamaModels : [])
            .filter((model) => typeof model?.id === 'string' && model.id.trim())
            .map((model) => ({
                id: model.id.trim(),
                displayName: model.displayName?.trim() || model.id.trim(),
            })),
    };

    const missing: string[] = [];
    if (!comfyExists) {
        missing.push('ComfyUI directory is missing');
    }
    if (!gitRepo) {
        missing.push('ComfyUI git checkout is missing');
    }
    customBundles.forEach((bundle) => {
        if (!bundle.exists) {
            missing.push(`Bundle missing: ${bundle.name}`);
        }
    });
    comfyModels.forEach((model) => {
        if (!model.exists) {
            missing.push(`Comfy model missing: ${model.id}`);
        }
    });
    if (!ollama.cliAvailable) {
        missing.push('Ollama CLI is unavailable');
    }

    return {
        configFile,
        comfyDirectory: {
            path: comfyDir,
            exists: comfyExists,
            gitRepo,
        },
        customBundles,
        comfyModels,
        localWorkspace,
        ollama,
        summary: {
            ready: missing.length === 0,
            missing,
        },
    };
}
