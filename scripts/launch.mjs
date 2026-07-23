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

    // Bail out before touching .next: if a dev server is live it owns that
    // folder, and clearing it would break the running server AND produce a
    // corrupt build here.
    assertNoConflictingServer('prod');

    const updated = checkForUpdates();
    ensureDependencies(updated);

    const buildDir = path.join(rootDir, '.next');
    if (fs.existsSync(buildDir)) {
        log('Rebuilding to pick up the latest code...');
        // On Windows, a lingering process (e.g. a dev server from a previous
        // run) can hold a persistent lock on a file inside .next, which makes
        // even a retried rmSync fail forever. Renaming the directory out of
        // the way only requires the PARENT directory entry to be free, which
        // works even while a file inside is still locked; `next build`
        // recreates .next fresh either way. The stale copy is then cleaned
        // up best-effort in the background so a stubborn lock never blocks
        // the launch.
        const staleDir = `${buildDir}.stale-${Date.now()}`;
        try {
            fs.renameSync(buildDir, staleDir);
        } catch {
            // Rename itself failed (e.g. cross-device or exotic lock) — fall
            // back to an in-place retrying delete.
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
                // Leave it; harmless leftover, cleaned up on a future run.
                log(`Left ${path.basename(staleDir)} behind for later cleanup (still locked).`);
            }
        }
    }

    log('Starting Image Express...');
    const result = run(process.execPath, [path.join(__dirname, 'start-web.mjs'), 'prod']);
    process.exit(result.status || 0);
}

main();
