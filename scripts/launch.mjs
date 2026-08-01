import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ensureDependencies } from './ensure-deps.mjs';
import { assertNoConflictingServer } from './server-lock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
process.chdir(rootDir);

const gitCmd = 'git';
const isWin = process.platform === 'win32';

function log(msg) {
    console.log(`[LAUNCH] ${msg}`);
}

function run(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}

function runQuiet(cmd, args) {
    return spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', cwd: rootDir });
}

function banner() {
    console.log('===================================================');
    console.log('              Image Express Launcher                ');
    console.log('===================================================');
}

/**
 * Soft self-update: ff-only pull when clean + behind origin.
 * Returns true when code changed (caller should force-deps).
 */
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

    const branchResult = runQuiet(gitCmd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = (branchResult.stdout || 'main').trim() || 'main';
    const behindResult = runQuiet(gitCmd, ['rev-list', '--count', `HEAD..origin/${branch}`]);
    let behind = Number.parseInt((behindResult.stdout || '0').trim(), 10);
    if (!Number.isFinite(behind)) behind = 0;

    const isDirty = runQuiet(gitCmd, ['status', '--porcelain']).stdout.trim().length > 0;
    const status = runQuiet(gitCmd, ['status', '-uno']);
    const isDiverged = status.stdout.includes('and have') && status.stdout.includes('different commits');

    if (isDiverged) {
        log('Local branch has diverged from remote. Skipping auto-update to avoid conflicts.');
        return false;
    }
    if (isDirty) {
        log('Local changes detected. Skipping auto-update to avoid overwriting your work.');
        return false;
    }
    if (behind <= 0) {
        log('Already up to date.');
        return false;
    }

    log(`Update available (${behind} commit(s)). Pulling latest changes...`);
    const pull = run(gitCmd, ['pull', '--ff-only', 'origin', branch]);
    if (pull.status !== 0) {
        log('Update failed, continuing with current version.');
        return false;
    }
    log('Updated successfully.');
    return true;
}

function main() {
    banner();

    assertNoConflictingServer('prod');

    const updated = checkForUpdates();
    // Always verify deps; force reinstall after a successful code pull.
    ensureDependencies(updated);

    const buildDir = path.join(rootDir, '.next');
    if (fs.existsSync(buildDir)) {
        log('Rebuilding to pick up the latest code...');
        const staleDir = `${buildDir}.stale-${Date.now()}`;
        try {
            fs.renameSync(buildDir, staleDir);
        } catch {
            try {
                fs.rmSync(buildDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
            } catch (err) {
                log(`Could not fully clear .next (${err.code}); continuing anyway — the build will overwrite it.`);
            }
        }
        if (fs.existsSync(staleDir)) {
            try {
                fs.rmSync(staleDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
            } catch {
                log(`Left ${path.basename(staleDir)} behind for later cleanup (still locked).`);
            }
        }
    }

    log('Starting Image Express...');
    const result = run(process.execPath, [path.join(__dirname, 'start-web.mjs'), 'prod']);
    process.exit(result.status || 0);
}

main();
