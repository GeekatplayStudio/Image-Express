/**
 * Node engine guard shared by every installer, launcher, updater, and build entry point.
 *
 * Problem it solves: a machine can have a perfectly good Node 24+ installed while a
 * version manager (nvm4w, nvm, volta, fnm, asdf) puts an older Node first on PATH.
 * npm then only emits an `EBADENGINE` *warning* and keeps going, producing an install
 * that is subtly wrong (or a build that fails much later with an unrelated error).
 *
 * This module detects that up front and either
 *   - re-executes the current script with a supported Node it found on disk, or
 *   - fails with a message that tells the user exactly what to do.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const nodeExeName = isWin ? 'node.exe' : 'node';
const REEXEC_FLAG = 'IMAGEEXPRESS_NODE_GUARD_REEXEC';

function readEngines() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
        return pkg.engines || {};
    } catch {
        return {};
    }
}

/** Minimum major version from an `engines.node` range such as ">=24" or "^24.0.0". */
export function requiredNodeMajor() {
    const range = readEngines().node;
    const match = typeof range === 'string' ? range.match(/(\d+)/) : null;
    return match ? Number.parseInt(match[1], 10) : 0;
}

function parseVersion(text) {
    const match = /v?(\d+)\.(\d+)\.(\d+)/.exec(String(text || '').trim());
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a, b) {
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

function probeNode(exePath) {
    if (!exePath || !fs.existsSync(exePath)) return null;
    const result = spawnSync(exePath, ['-v'], { encoding: 'utf8', timeout: 10_000 });
    if (result.status !== 0) return null;
    const version = parseVersion(result.stdout);
    return version ? { exePath, dir: path.dirname(exePath), version } : null;
}

function subdirs(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
            .map((entry) => path.join(dir, entry.name));
    } catch {
        return [];
    }
}

/** Directories that plausibly contain a `node` binary, across the common installers. */
function candidateNodeDirs() {
    const home = os.homedir();
    const dirs = [];
    const push = (...values) => values.forEach((value) => { if (value) dirs.push(value); });

    if (isWin) {
        push(
            path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs'),
            path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs'),
            path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Programs', 'nodejs'),
        );
        // nvm-windows: version folders (v24.14.1) live directly under the nvm root.
        const nvmRoots = [process.env.NVM_HOME, 'C:\\nvm4w', path.join(process.env.APPDATA || '', 'nvm')];
        nvmRoots.filter(Boolean).forEach((root) => push(...subdirs(root)));
        // volta / fnm
        push(...subdirs(path.join(process.env.LOCALAPPDATA || '', 'Volta', 'tools', 'image', 'node')));
        subdirs(path.join(process.env.APPDATA || '', 'fnm', 'node-versions'))
            .forEach((dir) => push(path.join(dir, 'installation')));
    } else {
        push('/usr/local/bin', '/opt/homebrew/bin', '/usr/bin');
        subdirs(path.join(process.env.NVM_DIR || path.join(home, '.nvm'), 'versions', 'node'))
            .forEach((dir) => push(path.join(dir, 'bin')));
        subdirs(path.join(home, '.volta', 'tools', 'image', 'node'))
            .forEach((dir) => push(path.join(dir, 'bin')));
        subdirs(path.join(home, '.local', 'share', 'fnm', 'node-versions'))
            .forEach((dir) => push(path.join(dir, 'installation', 'bin')));
        subdirs(path.join(home, '.asdf', 'installs', 'nodejs'))
            .forEach((dir) => push(path.join(dir, 'bin')));
        // Homebrew keg-only versioned formulae (node@24, node@26, ...).
        ['/opt/homebrew/opt', '/usr/local/opt'].forEach((base) => {
            subdirs(base)
                .filter((dir) => /node@\d+$/.test(dir))
                .forEach((dir) => push(path.join(dir, 'bin')));
        });
    }

    return Array.from(new Set(dirs));
}

/**
 * Highest installed Node that satisfies `minMajor`, ignoring the one currently running.
 * Returns `{ exePath, dir, version }` or null.
 */
export function findSupportedNode(minMajor = requiredNodeMajor()) {
    const running = path.resolve(process.execPath);
    const found = [];
    for (const dir of candidateNodeDirs()) {
        const exePath = path.join(dir, nodeExeName);
        if (path.resolve(exePath) === running) continue;
        const probed = probeNode(exePath);
        if (probed && probed.version[0] >= minMajor) found.push(probed);
    }
    found.sort((a, b) => compareVersions(b.version, a.version));
    return found[0] || null;
}

function formatVersion(version) {
    return `v${version.join('.')}`;
}

function guidance(minMajor) {
    const lines = [
        `Image Express requires Node.js ${minMajor} or newer (see .nvmrc: ${
            fs.existsSync(path.join(rootDir, '.nvmrc'))
                ? fs.readFileSync(path.join(rootDir, '.nvmrc'), 'utf8').trim()
                : minMajor
        }).`,
        `You are running Node ${process.version}.`,
        '',
        'Fix it with whichever applies to you:',
    ];
    if (isWin) {
        lines.push(
            `  nvm-windows :  nvm install ${minMajor} && nvm use ${minMajor}`,
            '  winget      :  winget install --id OpenJS.NodeJS -e',
            '  manual      :  https://nodejs.org/  (then open a NEW terminal)',
        );
    } else {
        lines.push(
            `  nvm      :  nvm install ${minMajor} && nvm use ${minMajor}`,
            `  homebrew :  brew install node@${minMajor} && brew link --overwrite node@${minMajor}`,
            '  manual   :  https://nodejs.org/  (then open a NEW terminal)',
        );
    }
    return lines.join('\n');
}

/**
 * Returns a PATH-patched env that puts a supported Node (and its matching npm) first,
 * so any `npm` we spawn runs under the right engine even if we could not re-exec.
 */
export function envWithSupportedNode(env = process.env, minMajor = requiredNodeMajor()) {
    const patched = { ...env };
    if (Number(process.versions.node.split('.')[0]) >= minMajor) return patched;
    const better = findSupportedNode(minMajor);
    if (!better) return patched;

    // Windows env vars are case-insensitive; a plain spread can leave both PATH and Path.
    const existing = env.PATH || env.Path || '';
    for (const key of Object.keys(patched)) {
        if (key.toLowerCase() === 'path') delete patched[key];
    }
    patched.PATH = `${better.dir}${path.delimiter}${existing}`;
    return patched;
}

/**
 * Assert the running Node satisfies package.json engines.
 *
 * @param {object} options
 * @param {boolean} options.reexec  Re-run the current script under a supported Node when found.
 * @param {boolean} options.exitOnFailure  Exit(1) with guidance when nothing usable is found.
 * @returns {{ ok: boolean, currentMajor: number, minMajor: number, better: object|null }}
 */
export function enforceSupportedNode({ reexec = true, exitOnFailure = true, label = 'DEPS' } = {}) {
    const minMajor = requiredNodeMajor();
    const currentMajor = Number(process.versions.node.split('.')[0]);
    if (!minMajor || currentMajor >= minMajor) {
        return { ok: true, currentMajor, minMajor, better: null };
    }

    const alreadyReexeced = process.env[REEXEC_FLAG] === '1';
    const better = findSupportedNode(minMajor);

    if (better && reexec && !alreadyReexeced) {
        console.log(
            `[${label}] Node ${process.version} is too old — switching to ${formatVersion(better.version)} at ${better.dir}.`,
        );
        const script = process.argv[1];
        const result = spawnSync(better.exePath, [script, ...process.argv.slice(2)], {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: {
                ...process.env,
                [REEXEC_FLAG]: '1',
                PATH: `${better.dir}${path.delimiter}${process.env.PATH || ''}`,
            },
        });
        process.exit(result.status === null ? 1 : result.status);
    }

    if (better) {
        // Re-exec was either not requested or already attempted; the caller decides
        // whether to continue with a PATH-patched child process or stop.
        if (reexec) {
            console.warn(
                `[${label}] Node ${process.version} is too old; using ${formatVersion(better.version)} from ${better.dir} for child processes.`,
            );
        }
        return { ok: false, currentMajor, minMajor, better };
    }

    if (exitOnFailure) {
        console.error(`\n[${label}] ERROR: unsupported Node.js version.\n`);
        console.error(guidance(minMajor));
        console.error('');
        process.exit(1);
    }
    return { ok: false, currentMajor, minMajor, better: null };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    const minMajor = requiredNodeMajor();
    const currentMajor = Number(process.versions.node.split('.')[0]);
    console.log(`node        : ${process.version} (${process.execPath})`);
    console.log(`required    : >=${minMajor}`);
    if (currentMajor >= minMajor) {
        console.log('status      : OK');
    } else {
        const better = findSupportedNode(minMajor);
        console.log(`status      : TOO OLD${better ? ` — usable ${formatVersion(better.version)} at ${better.dir}` : ''}`);
        if (!better) {
            console.log('');
            console.log(guidance(minMajor));
        }
        process.exitCode = 1;
    }
}
