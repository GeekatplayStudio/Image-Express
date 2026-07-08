import {
    formatTaskLabel,
    parseInstallerFlags,
    parseModelIdList,
    readInstallerConfig,
    runCommand,
} from '../common.mjs';

async function main() {
    const { flags } = parseInstallerFlags(process.argv.slice(2));
    const config = await readInstallerConfig();
    const allModels = Array.isArray(config.ollamaModels) ? config.ollamaModels : [];
    if (allModels.length === 0) {
        console.log('No Ollama models configured. Skipping.');
        return;
    }

    const requestedIds = parseModelIdList(flags.models);
    const selectedModels = requestedIds.length === 0
        ? allModels
        : allModels.filter((model) => requestedIds.includes(model.id));
    if (selectedModels.length === 0) {
        console.log('No matching Ollama models selected. Skipping.');
        return;
    }

    const ollamaCheck = await runCommand('ollama', ['--version'], {
        dryRun: flags.dryRun,
        allowFailure: true,
        stdio: 'pipe',
    });
    if (ollamaCheck.code !== 0) {
        throw new Error('Ollama CLI was not found. Install Ollama before pulling models.');
    }

    console.log(formatTaskLabel('Ollama Model Download'));
    for (const model of selectedModels) {
        if (!model?.id) continue;
        console.log(`Pulling ${model.id}`);
        await runCommand('ollama', ['pull', model.id], { dryRun: flags.dryRun });
    }

    console.log('Ollama model download step complete.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
