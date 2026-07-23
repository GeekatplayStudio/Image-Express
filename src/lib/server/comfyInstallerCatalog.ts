import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';
import { comfyWorkflowRegistry } from '@/lib/comfyui/registry';
import { ensureComfyWorkflowCatalogRegistered } from '@/lib/comfyui/workflows/catalog';
import { getProjectRoot } from '@/lib/server/appPaths';

export type InstallerConfigModel = {
    id: string;
    displayName?: string;
    targetPath?: string;
    downloadUrl?: string;
    category?: string;
    recommendedFor?: string[];
};

export type InstallerConfigBundle = {
    name?: string;
    targetPath?: string;
    bundleType?: string;
};

type InstallerLocalWorkspaceConfig = {
    sourceDir?: string;
};

export type InstallerConfig = {
    comfyUi?: {
        targetDir?: string;
    };
    customBundles?: InstallerConfigBundle[];
    comfyModels?: InstallerConfigModel[];
    ollamaModels?: InstallerConfigModel[];
    localWorkspace?: InstallerLocalWorkspaceConfig;
};

const WORKFLOW_JSON_SUFFIX = '.json';
const MANIFEST_SUFFIX = '.manifest.json';
const LOCAL_WORKSPACE_FALLBACK_DIR = 'ComfyUI workflows';
const WORKFLOW_SYNC_DIRECTORIES = ['custom_nodes', 'user', 'models'] as const;
const DEFAULT_CONFIG_FILE = path.join(getProjectRoot(), 'scripts', 'installers', 'config', 'sources.json');
const DEFAULT_COMFY_TARGET_DIR = 'external/ComfyUI';
const WINDOWS_STANDARD_COMFY_DRIVE_LETTERS = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const MODEL_CATEGORY_LABELS: Record<string, string> = {
    checkpoints: 'Checkpoints',
    diffusion_models: 'Diffusion Models',
    embeddings: 'Embeddings',
    loras: 'LoRAs',
    text_encoders: 'Text Encoders',
    upscale_models: 'Upscale Models',
    vae: 'VAEs',
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

export async function pathExists(targetPath: string) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

export function resolveConfigFilePath() {
    const configured = process.env.IMAGE_EXPRESS_INSTALLER_CONFIG_FILE?.trim();
    if (configured) {
        return path.resolve(configured);
    }
    return DEFAULT_CONFIG_FILE;
}

export async function readInstallerConfig(filePath = resolveConfigFilePath()): Promise<InstallerConfig> {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as InstallerConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
}

export function resolveInstallerPath(targetPath: string): string {
    const trimmed = targetPath.trim();
    if (!trimmed) {
        return '';
    }
    if (path.isAbsolute(trimmed)) {
        return path.normalize(trimmed);
    }
    return path.resolve(getProjectRoot(), trimmed);
}

function expandComfyInstallCandidates(targetPath: string): string[] {
    const resolved = resolveInstallerPath(targetPath);
    if (!resolved) {
        return [];
    }

    const candidates = [resolved];
    if (path.basename(resolved).toLowerCase() !== 'comfyui') {
        candidates.push(path.join(resolved, 'ComfyUI'));
    }

    return Array.from(new Set(candidates.map((value) => path.normalize(value))));
}

async function isLikelyComfyInstallDirectory(targetPath: string): Promise<boolean> {
    if (!targetPath || !(await pathExists(targetPath))) {
        return false;
    }

    const installMarkers = [
        path.join(targetPath, 'main.py'),
        path.join(targetPath, 'nodes.py'),
        path.join(targetPath, 'custom_nodes'),
        path.join(targetPath, 'models'),
        path.join(targetPath, 'user'),
    ];

    for (const marker of installMarkers) {
        if (await pathExists(marker)) {
            return true;
        }
    }

    return false;
}

function resolveStandardComfyInstallCandidates(): string[] {
    const candidates = [
        DEFAULT_COMFY_TARGET_DIR,
        'ComfyUI',
        path.join('..', 'ComfyUI'),
        path.join(os.homedir(), 'ComfyUI'),
        path.join(os.homedir(), 'ComfyUI_windows_portable', 'ComfyUI'),
        path.join(os.homedir(), 'Documents', 'ComfyUI'),
        path.join(os.homedir(), 'Documents', 'ComfyUI_windows_portable', 'ComfyUI'),
    ];

    if (process.platform === 'win32') {
        for (const driveLetter of WINDOWS_STANDARD_COMFY_DRIVE_LETTERS) {
            candidates.push(`${driveLetter}:\\ComfyUI`);
            candidates.push(`${driveLetter}:\\ComfyUI_windows_portable\\ComfyUI`);
        }
    }

    return Array.from(new Set(candidates.flatMap(expandComfyInstallCandidates)));
}

export async function resolveInstallerComfyDirectory(config: InstallerConfig, override = ''): Promise<string> {
    const envOverride = process.env.IMAGE_EXPRESS_COMFY_DIR?.trim() || '';
    const configured = override.trim() || envOverride || config.comfyUi?.targetDir || DEFAULT_COMFY_TARGET_DIR;

    const preferredCandidates = [override, envOverride, config.comfyUi?.targetDir || '', DEFAULT_COMFY_TARGET_DIR]
        .map((value) => value.trim())
        .filter(Boolean)
        .flatMap(expandComfyInstallCandidates);

    for (const candidate of preferredCandidates) {
        if (await isLikelyComfyInstallDirectory(candidate)) {
            return candidate;
        }
    }

    for (const candidate of resolveStandardComfyInstallCandidates()) {
        if (await isLikelyComfyInstallDirectory(candidate)) {
            return candidate;
        }
    }

    return resolveInstallerPath(configured);
}

export function resolveInstallerLocalWorkspaceDirectory(config: InstallerConfig): string {
    const configured = config.localWorkspace?.sourceDir?.trim() || LOCAL_WORKSPACE_FALLBACK_DIR;
    return resolveInstallerPath(configured);
}

function collectInstallableModelsFromGraph(
    graph: Record<string, unknown>,
    models: Map<string, ComfyWorkflowInstallableModel>,
    visitedSubgraphs: Set<string>,
) {
    const nodes = Array.isArray(graph.nodes)
        ? graph.nodes as Array<Record<string, unknown>>
        : [];

    for (const node of nodes) {
        const properties = isRecord(node.properties)
            ? node.properties as Record<string, unknown>
            : null;
        const modelEntries = Array.isArray(properties?.models)
            ? properties.models as Array<Record<string, unknown>>
            : [];

        for (const entry of modelEntries) {
            const name = typeof entry.name === 'string' ? entry.name.trim() : '';
            const downloadUrl = typeof entry.url === 'string' ? entry.url.trim() : '';
            const directory = typeof entry.directory === 'string' ? entry.directory.trim() : '';
            if (!name || !downloadUrl || !directory) {
                continue;
            }

            const key = `${directory}/${name}`.toLowerCase();
            if (!models.has(key)) {
                models.set(key, { name, downloadUrl, directory });
            }
        }
    }

    const subgraphs = isRecord(graph.definitions) && Array.isArray(graph.definitions.subgraphs)
        ? graph.definitions.subgraphs as Array<Record<string, unknown>>
        : [];

    for (const subgraph of subgraphs) {
        const subgraphId = typeof subgraph.id === 'string' ? subgraph.id : '';
        if (subgraphId && visitedSubgraphs.has(subgraphId)) {
            continue;
        }
        if (subgraphId) {
            visitedSubgraphs.add(subgraphId);
        }
        collectInstallableModelsFromGraph(subgraph, models, visitedSubgraphs);
    }
}

function extractInstallableModelsFromEditorGraph(graph: unknown): ComfyWorkflowInstallableModel[] {
    if (!isRecord(graph)) {
        return [];
    }

    const models = new Map<string, ComfyWorkflowInstallableModel>();
    collectInstallableModelsFromGraph(graph, models, new Set<string>());
    return Array.from(models.values());
}

function normalizeWorkflowModelTargetPath(directory: string, name: string): string {
    const normalizedDirectory = directory
        .replace(/[\\/]+/g, path.sep)
        .replace(new RegExp(`^models[\\/]+`, 'i'), '')
        .replace(new RegExp(`^${path.sep}+`), '');

    return path.join('models', normalizedDirectory, name);
}

function inferModelCategory(targetPath: string): string {
    const normalizedTarget = targetPath.replace(/\\/g, '/');
    const segments = normalizedTarget.split('/').filter(Boolean);
    const categoryKey = segments[1] || segments[0] || 'models';
    return MODEL_CATEGORY_LABELS[categoryKey] || categoryKey.replace(/[_-]+/g, ' ');
}

function humanizeIdentifier(value: string): string {
    return value
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

type InstallerCatalogModelRecord = InstallerConfigModel & {
    source: 'config' | 'workflow';
    recommendedFor: string[];
};

function mergeCatalogModel(
    bucket: Map<string, InstallerCatalogModelRecord>,
    nextModel: InstallerCatalogModelRecord,
) {
    const normalizedTargetPath = (nextModel.targetPath || '').replace(/\\/g, '/').toLowerCase();
    if (!normalizedTargetPath) {
        return;
    }

    const existing = bucket.get(normalizedTargetPath);
    if (!existing) {
        bucket.set(normalizedTargetPath, {
            ...nextModel,
            recommendedFor: Array.from(new Set(nextModel.recommendedFor)).sort((left, right) => left.localeCompare(right)),
        });
        return;
    }

    bucket.set(normalizedTargetPath, {
        ...existing,
        id: existing.source === 'config' ? existing.id : nextModel.id,
        displayName: existing.displayName || nextModel.displayName,
        downloadUrl: existing.downloadUrl || nextModel.downloadUrl,
        category: existing.category || nextModel.category,
        source: existing.source === 'config' ? 'config' : nextModel.source,
        recommendedFor: Array.from(new Set([
            ...existing.recommendedFor,
            ...nextModel.recommendedFor,
        ])).sort((left, right) => left.localeCompare(right)),
    });
}

async function walkWorkflowJsonFiles(directoryPath: string): Promise<string[]> {
    if (!directoryPath || !(await pathExists(directoryPath))) {
        return [];
    }

    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walkWorkflowJsonFiles(entryPath));
            continue;
        }

        const lowerName = entry.name.toLowerCase();
        if (!lowerName.endsWith(WORKFLOW_JSON_SUFFIX) || lowerName.endsWith(MANIFEST_SUFFIX)) {
            continue;
        }

        files.push(entryPath);
    }

    return files;
}

async function collectWorkflowMetadataModels(
    bucket: Map<string, InstallerCatalogModelRecord>,
    workflowDirectory: string,
) {
    const workflowFiles = await walkWorkflowJsonFiles(workflowDirectory);
    for (const workflowFile of workflowFiles) {
        const raw = await fs.readFile(workflowFile, 'utf8').catch(() => '');
        if (!raw) {
            continue;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw) as unknown;
        } catch {
            continue;
        }
        const installableModels = extractInstallableModelsFromEditorGraph(parsed);
        if (installableModels.length === 0) {
            continue;
        }

        const workflowLabel = humanizeIdentifier(path.basename(workflowFile, '.json'));
        for (const model of installableModels) {
            const targetPath = normalizeWorkflowModelTargetPath(model.directory, model.name);
            mergeCatalogModel(bucket, {
                id: `workflow:${targetPath.replace(/\\/g, '/')}`,
                displayName: humanizeIdentifier(model.name),
                targetPath,
                downloadUrl: model.downloadUrl,
                category: inferModelCategory(targetPath),
                recommendedFor: [workflowLabel],
                source: 'workflow',
            });
        }
    }
}

export async function collectInstallerComfyModels(config: InstallerConfig): Promise<InstallerCatalogModelRecord[]> {
    const models = new Map<string, InstallerCatalogModelRecord>();

    for (const configuredModel of Array.isArray(config.comfyModels) ? config.comfyModels : []) {
        const targetPath = typeof configuredModel?.targetPath === 'string'
            ? configuredModel.targetPath.trim()
            : '';
        if (!configuredModel?.id || !targetPath) {
            continue;
        }

        mergeCatalogModel(models, {
            id: configuredModel.id,
            displayName: configuredModel.displayName?.trim() || humanizeIdentifier(path.basename(targetPath)),
            targetPath,
            downloadUrl: configuredModel.downloadUrl?.trim(),
            category: configuredModel.category?.trim() || inferModelCategory(targetPath),
            recommendedFor: Array.isArray(configuredModel.recommendedFor)
                ? configuredModel.recommendedFor.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
                : [],
            source: 'config',
        });
    }

    ensureComfyWorkflowCatalogRegistered();
    for (const workflow of comfyWorkflowRegistry.getAllWorkflows()) {
        for (const model of workflow.setupRequirements?.models || []) {
            const targetPath = normalizeWorkflowModelTargetPath(model.directory, model.name);
            mergeCatalogModel(models, {
                id: `workflow:${targetPath.replace(/\\/g, '/')}`,
                displayName: humanizeIdentifier(model.name),
                targetPath,
                downloadUrl: model.downloadUrl,
                category: inferModelCategory(targetPath),
                recommendedFor: [workflow.name],
                source: 'workflow',
            });
        }
    }

    const localWorkspacePath = resolveInstallerLocalWorkspaceDirectory(config);
    await collectWorkflowMetadataModels(models, localWorkspacePath);

    return Array.from(models.values()).sort((left, right) => {
        const leftCategory = left.category || '';
        const rightCategory = right.category || '';
        const categoryOrder = leftCategory.localeCompare(rightCategory);
        if (categoryOrder !== 0) {
            return categoryOrder;
        }
        return (left.displayName || left.id).localeCompare(right.displayName || right.id);
    });
}

export async function countInstallerWorkspaceWorkflowFiles(workspacePath: string): Promise<number> {
    return (await walkWorkflowJsonFiles(workspacePath)).length;
}

export async function listInstallerWorkspaceSyncDirectories(workspacePath: string): Promise<string[]> {
    const syncedDirectories: string[] = [];
    for (const directoryName of WORKFLOW_SYNC_DIRECTORIES) {
        const targetPath = path.join(workspacePath, directoryName);
        if (await pathExists(targetPath)) {
            syncedDirectories.push(directoryName);
        }
    }
    return syncedDirectories;
}
