import path from 'path';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import type {
    InstallerRuntimeStatus,
    RuntimeBundleStatus,
    RuntimeModelStatus,
    RuntimePathVerificationStatus,
} from '@/lib/installerRuntimeStatus';
import {
    collectInstallerComfyModels,
    countInstallerWorkspaceWorkflowFiles,
    listInstallerWorkspaceSyncDirectories,
    readInstallerConfig,
    resolveConfigFilePath,
    resolveInstallerComfyDirectory,
    resolveInstallerLocalWorkspaceDirectory,
} from '@/lib/server/comfyInstallerCatalog';

async function pathExists(targetPath: string) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Probing the CLI means launching a process, which is the slowest thing this
 * module does and the only part that can block indefinitely — an installed but
 * wedged `ollama` would hang the status endpoint with no timeout of its own.
 * Bounded, and memoised so polling the endpoint does not respawn it each time.
 */
const OLLAMA_PROBE_TIMEOUT_MS = 2000;
const OLLAMA_PROBE_TTL_MS = 30_000;
let ollamaProbe: { available: boolean; checkedAt: number } | null = null;

function checkOllamaCliAvailable(now = Date.now()) {
    if (ollamaProbe && now - ollamaProbe.checkedAt < OLLAMA_PROBE_TTL_MS) {
        return ollamaProbe.available;
    }
    let available = false;
    try {
        const result = spawnSync('ollama', ['--version'], {
            stdio: 'ignore',
            timeout: OLLAMA_PROBE_TIMEOUT_MS,
            windowsHide: true,
        });
        // A timeout kills the child and reports a signal, not status 0, so the
        // strict check below already treats "wedged" as "unavailable".
        available = result.status === 0;
    } catch {
        available = false;
    }
    ollamaProbe = { available, checkedAt: now };
    return available;
}

/** Drop the memoised probe. Exported for tests and for post-install refresh. */
export function resetOllamaProbeCache() {
    ollamaProbe = null;
}

export async function getInstallerRuntimeStatus(comfyDirOverride = ''): Promise<InstallerRuntimeStatus> {
    const configFile = resolveConfigFilePath();
    const config = await readInstallerConfig(configFile);
    const comfyDir = await resolveInstallerComfyDirectory(config, comfyDirOverride);
    const comfyExists = await pathExists(comfyDir);
    const gitRepo = comfyExists && await pathExists(path.join(comfyDir, '.git'));
    const customNodesPath = comfyDir ? path.join(comfyDir, 'custom_nodes') : '';
    const modelsPath = comfyDir ? path.join(comfyDir, 'models') : '';
    const workflowLibraryPaths = comfyDir
        ? [path.join(comfyDir, 'user', 'default', 'workflows')]
        : [];
    const pathStatuses: RuntimePathVerificationStatus[] = [
        {
            label: 'Install Folder',
            path: comfyDir,
            exists: comfyExists,
            note: 'Expected ComfyUI root folder.',
        },
        {
            label: 'Custom Nodes Folder',
            path: customNodesPath,
            exists: customNodesPath ? await pathExists(customNodesPath) : false,
            note: 'Expected standard custom_nodes folder under the install root.',
        },
        {
            label: 'Models Folder',
            path: modelsPath,
            exists: modelsPath ? await pathExists(modelsPath) : false,
            note: 'Expected standard models folder under the install root.',
        },
        ...await Promise.all(workflowLibraryPaths.map(async (workflowLibraryPath, index) => ({
            label: workflowLibraryPaths.length > 1 ? `Workflow Folder ${index + 1}` : 'Workflow Folder',
            path: workflowLibraryPath,
            exists: await pathExists(workflowLibraryPath),
            note: 'Expected standard workflow folder under user/default/workflows.',
        } satisfies RuntimePathVerificationStatus))),
    ];

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
        paths: {
            customNodesPath,
            modelsPath,
            workflowLibraryPaths,
            statuses: pathStatuses,
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
