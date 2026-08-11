import path from 'path';
import {
    formatTaskLabel,
    parseInstallerFlags,
    pathExists,
    readInstallerConfig,
    resolveComfyDirectory,
    runCommand,
    runNodeScript,
} from './installers/common.mjs';

async function ensureComfyInstall({ comfyDir, autoFix, dryRun }) {
    if (await pathExists(comfyDir)) {
        return true;
    }
    console.warn(`Comfy directory missing: ${comfyDir}`);
    if (!autoFix) return false;
    console.log('Auto-fix enabled: running install-comfy.');
    await runNodeScript(
        'scripts/installers/comfy/install-comfy.mjs',
        [`--comfy-dir=${comfyDir}`, ...(dryRun ? ['--dry-run'] : [])],
        { dryRun: false },
    );
    if (dryRun) return true;
    return pathExists(comfyDir);
}

async function ensureCustomBundles({ comfyDir, bundles, autoFix, dryRun }) {
    const missing = [];
    for (const bundle of bundles) {
        const bundlePath = path.join(comfyDir, bundle.targetPath || '');
        if (!(await pathExists(bundlePath))) {
            missing.push(bundle);
        }
    }

    if (missing.length === 0) {
        return true;
    }
    console.warn(`Missing ${missing.length} custom bundle(s).`);
    if (!autoFix) return false;

    console.log('Auto-fix enabled: running install-custom-bundles.');
    await runNodeScript(
        'scripts/installers/comfy/install-custom-bundles.mjs',
        [`--comfy-dir=${comfyDir}`, ...(dryRun ? ['--dry-run'] : [])],
        { dryRun: false },
    );
    if (dryRun) return true;

    for (const bundle of missing) {
        const bundlePath = path.join(comfyDir, bundle.targetPath || '');
        if (!(await pathExists(bundlePath))) {
            return false;
        }
    }
    return true;
}

async function main() {
    const { flags } = parseInstallerFlags(process.argv.slice(2));
    const config = await readInstallerConfig();
    const comfyDir = resolveComfyDirectory(config, flags.comfyDir);
    const bundles = Array.isArray(config.customBundles) ? config.customBundles : [];

    console.log(formatTaskLabel('Installation QA'));
    const comfyOk = await ensureComfyInstall({
        comfyDir,
        autoFix: flags.autoFix,
        dryRun: flags.dryRun,
    });
    const bundlesOk = await ensureCustomBundles({
        comfyDir,
        bundles,
        autoFix: flags.autoFix,
        dryRun: flags.dryRun,
    });

    if (!comfyOk || !bundlesOk) {
        throw new Error('Installation QA failed: required Comfy runtime/components are still missing.');
    }

    // The packaged desktop app ships only the compiled Next standalone output, not the
    // source tree/devDependencies these commands need — running them there always fails.
    const isDesktopPackage = process.env.IMAGE_EXPRESS_RUNTIME === 'desktop-local';
    if (!flags.skipTests && !isDesktopPackage) {
        await runCommand('npm', ['run', 'build'], { dryRun: flags.dryRun });
        await runCommand(
            'npm',
            ['test', '--', '--runInBand', 'src/lib/server/__tests__/user-key-vault.test.ts'],
            { dryRun: flags.dryRun },
        );
    } else if (isDesktopPackage) {
        console.log('Desktop package runtime detected: skipping source-tree build/test verification.');
    }

    console.log('Installation QA completed successfully.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
