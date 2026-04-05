import path from 'path';
import {
    ensureDir,
    formatTaskLabel,
    parseInstallerFlags,
    pathExists,
    readInstallerConfig,
    resolveComfyDirectory,
    runCommand,
} from '../common.mjs';

async function syncComfyRepo({ comfyDir, repo, branch, dryRun }) {
    const gitDir = path.join(comfyDir, '.git');
    if (await pathExists(gitDir)) {
        await runCommand('git', ['-C', comfyDir, 'fetch', '--all'], { dryRun });
        await runCommand('git', ['-C', comfyDir, 'checkout', branch], { dryRun });
        await runCommand('git', ['-C', comfyDir, 'pull', '--ff-only', 'origin', branch], { dryRun });
        return;
    }

    await ensureDir(path.dirname(comfyDir));
    await runCommand('git', ['clone', '--branch', branch, repo, comfyDir], { dryRun });
}

async function installComfyPythonDependencies({ comfyDir, dryRun }) {
    const pythonCandidates = [
        { command: 'python', pipArgsPrefix: ['-m', 'pip'], versionArgs: ['--version'] },
        { command: 'py', pipArgsPrefix: ['-3', '-m', 'pip'], versionArgs: ['-3', '--version'] },
        { command: 'python3', pipArgsPrefix: ['-m', 'pip'], versionArgs: ['--version'] },
    ];

    let resolvedPython = pythonCandidates[0];
    let foundPython = false;
    for (const candidate of pythonCandidates) {
        const pythonCheck = await runCommand(candidate.command, candidate.versionArgs, {
            dryRun,
            allowFailure: true,
            stdio: 'pipe',
        });
        if (pythonCheck.code === 0 || dryRun) {
            resolvedPython = candidate;
            foundPython = true;
            break;
        }
    }

    if (!foundPython && !dryRun) {
        console.warn('Skipping python dependency install because no supported Python executable was found.');
        return;
    }

    await runCommand(resolvedPython.command, [...resolvedPython.pipArgsPrefix, 'install', '--upgrade', 'pip'], {
        dryRun,
        allowFailure: true,
    });
    await runCommand(resolvedPython.command, [...resolvedPython.pipArgsPrefix, 'install', '-r', 'requirements.txt'], {
        cwd: comfyDir,
        dryRun,
        allowFailure: true,
    });
}

async function main() {
    const { flags } = parseInstallerFlags(process.argv.slice(2));
    const config = await readInstallerConfig();
    const comfyConfig = config.comfyUi;
    if (!comfyConfig?.repo || !comfyConfig?.targetDir) {
        throw new Error('Missing comfyUi repo/targetDir in installer config.');
    }

    const comfyDir = resolveComfyDirectory(config, flags.comfyDir);

    console.log(formatTaskLabel('ComfyUI Install/Update'));
    console.log(`Target directory: ${comfyDir}`);
    console.log(`Repository: ${comfyConfig.repo}`);
    console.log(`Branch: ${comfyConfig.branch || 'master'}`);

    await syncComfyRepo({
        comfyDir,
        repo: comfyConfig.repo,
        branch: comfyConfig.branch || 'master',
        dryRun: flags.dryRun,
    });
    await installComfyPythonDependencies({
        comfyDir,
        dryRun: flags.dryRun,
    });

    console.log('ComfyUI install/update step complete.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
