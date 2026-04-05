import path from 'path';
import { cp } from 'fs/promises';
import {
    ensureDir,
    formatTaskLabel,
    parseInstallerFlags,
    pathExists,
    readInstallerConfig,
    resolveComfyDirectory,
    resolveLocalWorkspaceDirectory,
    runCommand,
} from '../common.mjs';

const LOCAL_SYNC_DIRECTORIES = ['custom_nodes', 'user', 'models'];

async function syncGitRepo({ targetDir, repo, branch, dryRun }) {
    const gitDir = path.join(targetDir, '.git');
    if (await pathExists(gitDir)) {
        await runCommand('git', ['-C', targetDir, 'fetch', '--all'], { dryRun });
        await runCommand('git', ['-C', targetDir, 'checkout', branch], { dryRun });
        await runCommand('git', ['-C', targetDir, 'pull', '--ff-only', 'origin', branch], { dryRun });
        return;
    }

    await ensureDir(path.dirname(targetDir));
    await runCommand('git', ['clone', '--branch', branch, repo, targetDir], { dryRun });
}

async function main() {
    const { flags } = parseInstallerFlags(process.argv.slice(2));
    const config = await readInstallerConfig();
    const comfyConfig = config.comfyUi;
    const bundles = Array.isArray(config.customBundles) ? config.customBundles : [];
    if (!comfyConfig?.targetDir) {
        throw new Error('Missing comfyUi targetDir in installer config.');
    }
    if (bundles.length === 0) {
        console.log('No custom bundles defined. Skipping.');
        return;
    }

    const comfyDir = resolveComfyDirectory(config, flags.comfyDir);
    if (!(await pathExists(comfyDir)) && !flags.dryRun) {
        throw new Error(`Comfy directory not found: ${comfyDir}. Run install-comfy first.`);
    }
    if (!(await pathExists(comfyDir)) && flags.dryRun) {
        console.log(`[dry-run] Comfy directory ${comfyDir} does not exist yet; proceeding with planned bundle sync.`);
    }

    console.log(formatTaskLabel('Comfy Custom Bundles Install/Update'));
    for (const bundle of bundles) {
        if (!bundle?.repo || !bundle?.targetPath) {
            console.warn('Skipping invalid bundle entry in installer config.');
            continue;
        }
        const targetDir = path.join(comfyDir, bundle.targetPath);
        console.log(`Syncing ${bundle.name || bundle.targetPath} -> ${targetDir}`);
        await syncGitRepo({
            targetDir,
            repo: bundle.repo,
            branch: bundle.branch || 'main',
            dryRun: flags.dryRun,
        });
    }

    const localWorkspacePath = resolveLocalWorkspaceDirectory(config);
    if (!(await pathExists(localWorkspacePath)) && flags.dryRun) {
        console.log(`[dry-run] Local workspace ${localWorkspacePath} does not exist yet; skipping workspace sync.`);
    }

    if (await pathExists(localWorkspacePath)) {
        for (const directoryName of LOCAL_SYNC_DIRECTORIES) {
            const sourcePath = path.join(localWorkspacePath, directoryName);
            if (!(await pathExists(sourcePath))) {
                continue;
            }

            const targetPath = path.join(comfyDir, directoryName);
            if (flags.dryRun) {
                console.log(`[dry-run] Sync local workspace ${sourcePath} -> ${targetPath}`);
                continue;
            }

            console.log(`Syncing local workspace ${sourcePath} -> ${targetPath}`);
            await ensureDir(path.dirname(targetPath));
            await cp(sourcePath, targetPath, { recursive: true, force: true });
        }
    }

    console.log('Custom bundle install/update step complete.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
