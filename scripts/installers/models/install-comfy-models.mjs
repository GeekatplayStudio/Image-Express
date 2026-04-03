import path from 'path';
import { createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import {
    REPO_ROOT,
    ensureDir,
    formatTaskLabel,
    parseInstallerFlags,
    parseModelIdList,
    pathExists,
    readInstallerConfig,
} from '../common.mjs';

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
    const allModels = Array.isArray(config.comfyModels) ? config.comfyModels : [];
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

    const comfyDir = flags.comfyDir
        ? path.resolve(REPO_ROOT, flags.comfyDir)
        : path.resolve(REPO_ROOT, comfyConfig.targetDir);
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
