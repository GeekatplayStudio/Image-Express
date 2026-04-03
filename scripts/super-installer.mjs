import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import {
    formatTaskLabel,
    parseInstallerFlags,
    readInstallerConfig,
    runNodeScript,
} from './installers/common.mjs';

function toModelDisplayList(models) {
    return models.map((model, index) => `${index + 1}. ${model.displayName || model.id} (${model.id})`).join('\n');
}

async function askYesNo(rl, prompt, defaultValue) {
    const suffix = defaultValue ? 'Y/n' : 'y/N';
    const answer = (await rl.question(`${prompt} [${suffix}]: `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    return answer === 'y' || answer === 'yes';
}

async function askModelSelection(rl, label, models) {
    if (models.length === 0) return [];
    console.log(`\n${label}`);
    console.log(toModelDisplayList(models));
    const answer = (await rl.question('Select models by number (comma separated, Enter = all): ')).trim();
    if (!answer) return models.map((model) => model.id);

    const selectedIndexes = answer
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= models.length);
    const selectedIds = Array.from(
        new Set(selectedIndexes.map((index) => models[index - 1].id)),
    );
    return selectedIds.length > 0 ? selectedIds : models.map((model) => model.id);
}

async function runStep({ label, scriptPath, args, continueOnError }) {
    console.log(formatTaskLabel(label));
    try {
        await runNodeScript(scriptPath, args, { dryRun: false });
        return true;
    } catch (error) {
        console.error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
        if (!continueOnError) {
            throw error;
        }
        return false;
    }
}

async function gatherSelections({ flags, config }) {
    const comfyModels = Array.isArray(config.comfyModels) ? config.comfyModels : [];
    const ollamaModels = Array.isArray(config.ollamaModels) ? config.ollamaModels : [];

    if (flags.yes) {
        return {
            installComfy: true,
            installCustomBundles: true,
            installComfyModels: false,
            comfyModelIds: [],
            installOllamaModels: false,
            ollamaModelIds: [],
            runQa: true,
            autoFix: true,
        };
    }

    const rl = createInterface({ input, output });
    try {
        console.log(formatTaskLabel('Image Express Super Installer'));
        console.log('Choose what to install/update for first-run readiness.');

        const installComfy = await askYesNo(rl, 'Install or update ComfyUI?', true);
        const installCustomBundles = await askYesNo(rl, 'Install or update bundled custom nodes/workflows?', true);
        const installComfyModels = await askYesNo(rl, 'Download Comfy models?', false);
        const comfyModelIds = installComfyModels
            ? await askModelSelection(rl, 'Available Comfy models:', comfyModels)
            : [];
        const installOllamaModels = await askYesNo(rl, 'Download Ollama models?', false);
        const ollamaModelIds = installOllamaModels
            ? await askModelSelection(rl, 'Available Ollama models:', ollamaModels)
            : [];
        const runQa = await askYesNo(rl, 'Run post-install QA checks?', true);
        const autoFix = runQa ? await askYesNo(rl, 'Allow QA auto-fix attempts?', true) : false;

        return {
            installComfy,
            installCustomBundles,
            installComfyModels,
            comfyModelIds,
            installOllamaModels,
            ollamaModelIds,
            runQa,
            autoFix,
        };
    } finally {
        rl.close();
    }
}

function buildSharedArgs(flags) {
    const args = [];
    if (flags.dryRun) args.push('--dry-run');
    if (flags.comfyDir) args.push(`--comfy-dir=${flags.comfyDir}`);
    if (flags.continueOnError) args.push('--continue-on-error');
    return args;
}

async function main() {
    const { flags } = parseInstallerFlags(process.argv.slice(2));
    const config = await readInstallerConfig();
    const selections = await gatherSelections({ flags, config });
    const sharedArgs = buildSharedArgs(flags);

    if (selections.installComfy) {
        await runStep({
            label: 'ComfyUI install/update',
            scriptPath: 'scripts/installers/comfy/install-comfy.mjs',
            args: sharedArgs,
            continueOnError: flags.continueOnError,
        });
    }

    if (selections.installCustomBundles) {
        await runStep({
            label: 'Custom nodes/workflows install/update',
            scriptPath: 'scripts/installers/comfy/install-custom-bundles.mjs',
            args: sharedArgs,
            continueOnError: flags.continueOnError,
        });
    }

    if (selections.installComfyModels && selections.comfyModelIds.length > 0) {
        await runStep({
            label: 'Comfy model download',
            scriptPath: 'scripts/installers/models/install-comfy-models.mjs',
            args: [...sharedArgs, `--models=${selections.comfyModelIds.join(',')}`, ...(flags.force ? ['--force'] : [])],
            continueOnError: flags.continueOnError,
        });
    }

    if (selections.installOllamaModels && selections.ollamaModelIds.length > 0) {
        await runStep({
            label: 'Ollama model download',
            scriptPath: 'scripts/installers/models/install-ollama-models.mjs',
            args: [...sharedArgs, `--models=${selections.ollamaModelIds.join(',')}`],
            continueOnError: flags.continueOnError,
        });
    }

    if (selections.runQa) {
        await runStep({
            label: 'Post-install QA',
            scriptPath: 'scripts/qa-installation.mjs',
            args: [
                ...sharedArgs,
                ...(selections.autoFix ? ['--auto-fix'] : []),
                ...(flags.skipTests ? ['--skip-tests'] : []),
            ],
            continueOnError: flags.continueOnError,
        });
    }

    console.log('\nSuper installer flow completed.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
