import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
process.chdir(rootDir);

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const gitCmd = 'git';

function log(msg) {
    console.log(`[LAUNCH] ${msg}`);
}

function run(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}

function runQuiet(cmd, args) {
    return spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });
}

function banner() {
    console.log('===================================================');
    console.log('              Image Express Launcher                ');
    console.log('===================================================');
}

function checkForUpdates() {
    if (!fs.existsSync(path.join(rootDir, '.git'))) {
        log('Not a git checkout, skipping update check.');
        return false;
    }

    const remote = runQuiet(gitCmd, ['remote']);
    if (remote.status !== 0 || !remote.stdout.trim()) {
        log('No git remote configured, skipping update check.');
        return false;
    }

    log('Checking for updates...');
    const fetch = runQuiet(gitCmd, ['fetch', '--quiet']);
    if (fetch.status !== 0) {
        log('Could not reach remote (offline?). Skipping update.');
        return false;
    }

    const status = runQuiet(gitCmd, ['status', '-uno']);
    const isBehind = status.stdout.includes('is behind');
    const isDiverged = status.stdout.includes('and have') && status.stdout.includes('different commits');
    const isDirty = runQuiet(gitCmd, ['status', '--porcelain']).stdout.trim().length > 0;

    if (isDiverged) {
        log('Local branch has diverged from remote. Skipping auto-update to avoid conflicts.');
        return false;
    }
    if (isDirty) {
        log('Local changes detected. Skipping auto-update to avoid overwriting your work.');
        return false;
    }
    if (!isBehind) {
        log('Already up to date.');
        return false;
    }

    log('Update available. Pulling latest changes...');
    const pull = run(gitCmd, ['pull', '--ff-only']);
    if (pull.status !== 0) {
        log('Update failed, continuing with current version.');
        return false;
    }
    log('Updated successfully.');
    return true;
}

function ensureDependencies(forceInstall) {
    const nodeModulesPath = path.join(rootDir, 'node_modules');
    const markerPath = path.join(nodeModulesPath, '.install-complete');
    const lockPath = path.join(rootDir, 'package-lock.json');

    const needsInstall =
        forceInstall ||
        !fs.existsSync(nodeModulesPath) ||
        !fs.existsSync(markerPath) ||
        (fs.existsSync(lockPath) &&
            fs.statSync(lockPath).mtimeMs > (fs.existsSync(markerPath) ? fs.statSync(markerPath).mtimeMs : 0));

    if (!needsInstall) {
        log('Dependencies already up to date.');
        return;
    }

    log('Installing dependencies (this may take a few minutes on first run)...');
    // Electron's postinstall downloads a large binary and is only needed for
    // the desktop app shell, not the web app. Skipping it avoids failures
    // behind corporate proxies/firewalls with custom SSL certs.
    const installEnv = { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' };
    const install = run(npmCmd, ['install'], { env: installEnv });

    if (install.status !== 0) {
        console.error('[ERROR] npm install failed. See output above for details.');
        process.exit(install.status || 1);
    }

    fs.writeFileSync(markerPath, new Date().toISOString());
    log('Dependencies installed.');
}

function main() {
    banner();

    const updated = checkForUpdates();
    ensureDependencies(updated);

    if (updated) {
        const buildDir = path.join(rootDir, '.next');
        if (fs.existsSync(buildDir)) {
            log('Clearing previous build so the update takes effect...');
            fs.rmSync(buildDir, { recursive: true, force: true });
        }
    }

    log('Starting Image Express...');
    const result = run(process.execPath, [path.join(__dirname, 'start-web.mjs'), 'prod']);
    process.exit(result.status || 0);
}

main();
