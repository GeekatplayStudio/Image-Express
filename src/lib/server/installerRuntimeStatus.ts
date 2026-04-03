import path from 'path';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import type {
    InstallerRuntimeStatus,
    RuntimeBundleStatus,
    RuntimeModelStatus,
} from '@/lib/installerRuntimeStatus';

type InstallerConfigModel = {
    id: string;
    displayName?: string;
    targetPath?: string;
};

type InstallerConfigBundle = {
    name?: string;
    targetPath?: string;
    bundleType?: string;
};

type InstallerConfig = {
    comfyUi?: {
        targetDir?: string;
    };
    customBundles?: InstallerConfigBundle[];
    comfyModels?: InstallerConfigModel[];
    ollamaModels?: InstallerConfigModel[];
};

const DEFAULT_CONFIG_FILE = path.join(process.cwd(), 'scripts', 'installers', 'config', 'sources.json');

async function pathExists(targetPath: string) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function resolveConfigFilePath() {
    const configured = process.env.IMAGE_EXPRESS_INSTALLER_CONFIG_FILE?.trim();
    if (configured) {
        return path.resolve(configured);
    }
    return DEFAULT_CONFIG_FILE;
}

function resolveComfyDirectory(config: InstallerConfig) {
    const configured = process.env.IMAGE_EXPRESS_COMFY_DIR?.trim();
    if (configured) {
        return path.resolve(configured);
    }
    const fallback = config.comfyUi?.targetDir || 'external/ComfyUI';
    return path.resolve(process.cwd(), fallback);
}

async function readConfig(filePath: string): Promise<InstallerConfig> {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as InstallerConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
}

function checkOllamaCliAvailable() {
    try {
        const result = spawnSync('ollama', ['--version'], { stdio: 'ignore' });
        return result.status === 0;
    } catch {
        return false;
    }
}

export async function getInstallerRuntimeStatus(): Promise<InstallerRuntimeStatus> {
    const configFile = resolveConfigFilePath();
    const config = await readConfig(configFile);
    const comfyDir = resolveComfyDirectory(config);
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
        (Array.isArray(config.comfyModels) ? config.comfyModels : [])
            .filter((model) => typeof model?.targetPath === 'string' && model.targetPath.trim())
            .map(async (model) => {
                const targetPath = model.targetPath!.trim();
                const absolutePath = path.join(comfyDir, targetPath);
                return {
                    id: model.id,
                    displayName: model.displayName || model.id,
                    targetPath,
                    exists: await pathExists(absolutePath),
                } satisfies RuntimeModelStatus;
            }),
    );

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
        ollama,
        summary: {
            ready: missing.length === 0,
            missing,
        },
    };
}
