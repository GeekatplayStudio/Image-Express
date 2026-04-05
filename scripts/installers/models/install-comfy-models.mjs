import path from 'path';
import { createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import {
    ensureDir,
    formatTaskLabel,
    parseInstallerFlags,
    parseModelIdList,
    pathExists,
    readInstallerConfig,
    resolveComfyDirectory,
    resolveLocalWorkspaceDirectory,
} from '../common.mjs';

const MANIFEST_SUFFIX = '.manifest.json';

const isRecord = (value) => typeof value === 'object' && value !== null;

function normalizeWorkflowModelTargetPath(directory, name) {
    const normalizedDirectory = String(directory || '')
        .replace(/[\\/]+/g, path.sep)
        .replace(/^models[\\/]+/i, '')
        .replace(new RegExp(`^${path.sep}+`), '');

    return path.join('models', normalizedDirectory, name);
}

function collectInstallableModelsFromGraph(graph, models, visitedSubgraphs) {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];

    for (const node of nodes) {
        const properties = isRecord(node.properties) ? node.properties : null;
        const modelEntries = Array.isArray(properties?.models) ? properties.models : [];

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
        ? graph.definitions.subgraphs
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

function extractInstallableModelsFromEditorGraph(graph) {
    if (!isRecord(graph)) {
        return [];
    }

    const models = new Map();
    collectInstallableModelsFromGraph(graph, models, new Set());
    return Array.from(models.values());
}

async function walkWorkflowJsonFiles(directoryPath) {
    if (!directoryPath || !(await pathExists(directoryPath))) {
        return [];
    }

    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walkWorkflowJsonFiles(entryPath));
            continue;
        }

        const lowerName = entry.name.toLowerCase();
        if (!lowerName.endsWith('.json') || lowerName.endsWith(MANIFEST_SUFFIX)) {
            continue;
        }

        files.push(entryPath);
    }

    return files;
}

function mergeCatalogModel(bucket, nextModel) {
    const normalizedTargetPath = nextModel.targetPath.replace(/\\/g, '/').toLowerCase();
    const existing = bucket.get(normalizedTargetPath);
    if (!existing) {
        bucket.set(normalizedTargetPath, nextModel);
        return;
    }

    bucket.set(normalizedTargetPath, {
        ...existing,
        downloadUrl: existing.downloadUrl || nextModel.downloadUrl,
        displayName: existing.displayName || nextModel.displayName,
    });
}

async function collectWorkflowCatalogModels(bucket, workflowDirectory) {
    const workflowFiles = await walkWorkflowJsonFiles(workflowDirectory);
    for (const workflowFile of workflowFiles) {
        const raw = await fs.readFile(workflowFile, 'utf8').catch(() => '');
        if (!raw) {
            continue;
        }

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            continue;
        }
        const installableModels = extractInstallableModelsFromEditorGraph(parsed);
        for (const model of installableModels) {
            const targetPath = normalizeWorkflowModelTargetPath(model.directory, model.name);
            mergeCatalogModel(bucket, {
                id: `workflow:${targetPath.replace(/\\/g, '/')}`,
                displayName: model.name,
                downloadUrl: model.downloadUrl,
                targetPath,
            });
        }
    }
}

async function buildComfyModelCatalog(config) {
    const bucket = new Map();

    for (const model of Array.isArray(config.comfyModels) ? config.comfyModels : []) {
        if (!model?.id || !model?.targetPath) {
            continue;
        }

        mergeCatalogModel(bucket, {
            id: model.id,
            displayName: model.displayName || model.id,
            downloadUrl: model.downloadUrl,
            targetPath: model.targetPath,
        });
    }

    await collectWorkflowCatalogModels(bucket, path.join(process.cwd(), 'src', 'lib', 'comfyui', 'workflows'));
    await collectWorkflowCatalogModels(bucket, resolveLocalWorkspaceDirectory(config));
    return Array.from(bucket.values());
}

async function downloadFile(url, destination) {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new Error(`Download failed (${response.status}) for ${url}`);
    }
    await ensureDir(path.dirname(destination));
    await pipeline(response.body, createWriteStream(destination));
}

async function main() {
    const { flags } = parseInstallerFlags(process.argv.slice(2));
    const config = await readInstallerConfig();
    const comfyConfig = config.comfyUi;
    const allModels = await buildComfyModelCatalog(config);
    if (!comfyConfig?.targetDir) {
        throw new Error('Missing comfyUi targetDir in installer config.');
    }
    if (allModels.length === 0) {
        console.log('No Comfy models configured. Skipping.');
        return;
    }

    const requestedIds = parseModelIdList(flags.models);
    const selectedModels = requestedIds.length === 0
        ? allModels
        : allModels.filter((model) => requestedIds.includes(model.id));
    if (selectedModels.length === 0) {
        console.log('No matching Comfy models selected. Skipping.');
        return;
    }

    const comfyDir = resolveComfyDirectory(config, flags.comfyDir);
    if (!(await pathExists(comfyDir))) {
        throw new Error(`Comfy directory not found: ${comfyDir}. Run install-comfy first.`);
    }

    console.log(formatTaskLabel('Comfy Model Download'));
    for (const model of selectedModels) {
        if (!model?.downloadUrl || !model?.targetPath) {
            console.warn(`Skipping invalid model entry: ${model?.id || '(missing id)'}`);
            continue;
        }
        const targetFile = path.join(comfyDir, model.targetPath);
        const targetExists = await pathExists(targetFile);
        if (targetExists && !flags.force) {
            console.log(`Skipping existing model ${model.id} (${targetFile})`);
            continue;
        }
        if (flags.dryRun) {
            console.log(`[dry-run] Download ${model.id} -> ${targetFile}`);
            continue;
        }

        console.log(`Downloading ${model.id} -> ${targetFile}`);
        const tempFile = `${targetFile}.partial`;
        await downloadFile(model.downloadUrl, tempFile);
        await fs.rename(tempFile, targetFile);
    }

    console.log('Comfy model download step complete.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
