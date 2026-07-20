import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ensureDependencies } from './ensure-deps.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
process.chdir(rootDir);

const isWin = process.platform === 'win32';
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

function main() {
    banner();

    const updated = checkForUpdates();
    ensureDependencies(updated);

    const buildDir = path.join(rootDir, '.next');
    if (fs.existsSync(buildDir)) {
        log('Rebuilding to pick up the latest code...');
        // On Windows, antivirus/indexer file locks can cause a transient
        // ENOTEMPTY/EBUSY mid-delete; retry a few times before giving up.
        try {
            fs.rmSync(buildDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
        } catch (err) {
            log(`Could not fully clear .next (${err.code}); removing what remains...`);
            fs.rmSync(buildDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
        }
    }

    log('Starting Image Express...');
    const result = run(process.execPath, [path.join(__dirname, 'start-web.mjs'), 'prod']);
    process.exit(result.status || 0);
}

main();
