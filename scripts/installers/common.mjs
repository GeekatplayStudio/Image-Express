import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const INSTALLER_CONFIG_FILE = path.join(__dirname, 'config', 'sources.json');

export function parseInstallerFlags(argv) {
    const flags = {
        dryRun: false,
        yes: false,
        autoFix: false,
        force: false,
        skipTests: false,
        continueOnError: false,
        comfyDir: '',
        models: '',
    };
    const positional = [];

    for (const arg of argv) {
        if (arg === '--dry-run') {
            flags.dryRun = true;
            continue;
        }
        if (arg === '--yes') {
            flags.yes = true;
            continue;
        }
        if (arg === '--auto-fix') {
            flags.autoFix = true;
            continue;
        }
        if (arg === '--force') {
            flags.force = true;
            continue;
        }
        if (arg === '--skip-tests') {
            flags.skipTests = true;
            continue;
        }
        if (arg === '--continue-on-error') {
            flags.continueOnError = true;
            continue;
        }
        if (arg.startsWith('--comfy-dir=')) {
            flags.comfyDir = arg.slice('--comfy-dir='.length).trim();
            continue;
        }
        if (arg.startsWith('--models=')) {
            flags.models = arg.slice('--models='.length).trim();
            continue;
        }
        positional.push(arg);
    }

    return { flags, positional };
}

export function parseModelIdList(csvValue) {
    if (!csvValue) return [];
    return csvValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
}

export async function readInstallerConfig() {
    const raw = await fs.readFile(INSTALLER_CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
}

export async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

export async function ensureDir(targetPath) {
    await fs.mkdir(targetPath, { recursive: true });
}

export async function runCommand(command, args = [], options = {}) {
    const {
        cwd = REPO_ROOT,
        dryRun = false,
        allowFailure = false,
        env = process.env,
        stdio = 'inherit',
    } = options;
    const printable = [command, ...args].join(' ');
    if (dryRun) {
        console.log(`[dry-run] ${printable}`);
        return { code: 0 };
    }

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env,
            stdio,
        });

        child.on('error', (error) => {
            if (allowFailure) {
                resolve({ code: 1, error });
                return;
            }
            reject(error);
        });

        child.on('close', (code) => {
            if (code === 0 || allowFailure) {
                resolve({ code: code ?? 0 });
                return;
            }
            reject(new Error(`Command failed (${code ?? 'unknown'}): ${printable}`));
        });
    });
}

export async function runNodeScript(scriptRelativePath, scriptArgs = [], options = {}) {
    const scriptPath = path.join(REPO_ROOT, scriptRelativePath);
    return runCommand(process.execPath, [scriptPath, ...scriptArgs], options);
}

export function formatTaskLabel(label) {
    return `\n=== ${label} ===`;
}
