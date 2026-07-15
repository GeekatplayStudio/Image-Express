#!/usr/bin/env node
/**
 * Self-update script for Image Express.
 *
 * Usage:
 *   npm run update          — check + pull latest code + install deps
 *   npm run update -- --check   — only report whether an update exists
 *
 * Safe by design:
 * - Refuses to update if the working tree has uncommitted changes
 *   (never destroys local edits).
 * - Uses `git pull --ff-only` so it can never create merge conflicts.
 * - Reinstalls dependencies only when package-lock.json changed.
 */
import { execFileSync, spawnSync } from 'child_process';

const isWindows = process.platform === 'win32';

function git(args, options = {}) {
    const output = execFileSync('git', args, { encoding: 'utf8', ...options });
    // Output is null when the caller redirects stdio (e.g. 'inherit'/'ignore').
    return typeof output === 'string' ? output.trim() : '';
}

function fail(message) {
    console.error(`[update] ERROR: ${message}`);
    process.exit(1);
}

function main() {
    const checkOnly = process.argv.includes('--check');

    try {
        git(['rev-parse', '--is-inside-work-tree']);
    } catch {
        fail('This folder is not a git checkout. Re-install from https://github.com/GeekatplayStudio/Image-Express instead.');
    }

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    console.log(`[update] Current branch: ${branch}`);

    console.log('[update] Fetching latest version info...');
    try {
        git(['fetch', '--quiet'], { stdio: ['ignore', 'ignore', 'inherit'] });
    } catch {
        fail('Could not reach the git remote. Check your network connection.');
    }

    let behind = 0;
    try {
        behind = Number.parseInt(git(['rev-list', '--count', `HEAD..origin/${branch}`]), 10) || 0;
    } catch {
        fail(`Branch "${branch}" has no origin counterpart to compare against.`);
    }

    const localCommit = git(['rev-parse', '--short', 'HEAD']);
    if (behind === 0) {
        console.log(`[update] Already up to date (commit ${localCommit}).`);
        return;
    }

    console.log(`[update] ${behind} new commit(s) available.`);
    if (checkOnly) {
        process.exitCode = 2; // Distinct code so callers can detect "update available".
        return;
    }

    const dirty = git(['status', '--porcelain']);
    if (dirty) {
        fail('You have local uncommitted changes. Commit or stash them first, then run the update again.');
    }

    const lockBefore = git(['rev-parse', 'HEAD:package-lock.json']);
    console.log('[update] Pulling latest code (fast-forward only)...');
    try {
        git(['pull', '--ff-only'], { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch {
        fail('Fast-forward pull failed. Your branch has diverged from the remote; resolve manually with git.');
    }

    let lockAfter = lockBefore;
    try {
        lockAfter = git(['rev-parse', 'HEAD:package-lock.json']);
    } catch {
        // Lock file may not exist in edge cases; force reinstall to be safe.
        lockAfter = `${lockBefore}-changed`;
    }

    if (lockAfter !== lockBefore) {
        console.log('[update] Dependencies changed — running npm install...');
        const install = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['install'], {
            stdio: 'inherit',
            shell: isWindows,
        });
        if (install.status !== 0) {
            fail('npm install failed. Run it manually and check the output.');
        }
    } else {
        console.log('[update] Dependencies unchanged — skipping npm install.');
    }

    const newCommit = git(['rev-parse', '--short', 'HEAD']);
    console.log(`[update] Updated ${localCommit} -> ${newCommit}.`);
    console.log('[update] Restart the app (start.bat / start.sh / npm run dev) to load the new version.');
}

main();
