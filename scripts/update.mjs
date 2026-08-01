#!/usr/bin/env node
/**
 * Self-update for Image Express (source installs).
 *
 * Usage:
 *   npm run update              — pull latest code, refresh deps, apply safe library updates
 *   npm run update -- --check   — report only (exit 2 if updates available)
 *   npm run update -- --libs    — also run `npm update` for in-range dependency bumps
 *   npm run update -- --force-deps — reinstall node_modules even if lockfile unchanged
 *
 * Safe by design:
 * - Refuses to update if the working tree has uncommitted changes
 * - Uses `git pull --ff-only` (never creates merge conflicts)
 * - Reinstalls dependencies when package-lock / package.json change
 */
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ensureDependencies } from './ensure-deps.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

function git(args, options = {}) {
    const output = execFileSync('git', args, { encoding: 'utf8', cwd: rootDir, ...options });
    return typeof output === 'string' ? output.trim() : '';
}

function fail(message) {
    console.error(`[update] ERROR: ${message}`);
    process.exit(1);
}

function fileFingerprint(relativePath) {
    const full = path.join(rootDir, relativePath);
    if (!fs.existsSync(full)) return 'missing';
    return createHash('sha1').update(fs.readFileSync(full)).digest('hex');
}

function runNpm(args, label) {
    console.log(`[update] ${label}...`);
    const result = spawnSync(npmCmd, args, {
        cwd: rootDir,
        stdio: 'inherit',
        shell: isWindows,
        env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
    });
    if (result.status !== 0) {
        fail(`${label} failed. See output above.`);
    }
}

function main() {
    const checkOnly = process.argv.includes('--check');
    const updateLibs = process.argv.includes('--libs');
    const forceDeps = process.argv.includes('--force-deps');

    try {
        git(['rev-parse', '--is-inside-work-tree']);
    } catch {
        fail('This folder is not a git checkout. Re-install from https://github.com/GeekatplayStudio/Image-Express instead.');
    }

    let branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    console.log(`[update] Current branch: ${branch}`);

    // Prefer tracking main for everyday source installs (skip on intentional feature branches).
    if (branch !== 'main' && process.argv.includes('--main')) {
        console.log('[update] Switching to main...');
        try {
            git(['checkout', 'main'], { stdio: ['ignore', 'inherit', 'inherit'] });
            branch = 'main';
        } catch {
            fail('Could not switch to main. Resolve local branch issues, then retry.');
        }
    }

    console.log('[update] Fetching latest version info...');
    try {
        git(['fetch', '--quiet', 'origin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    } catch {
        fail('Could not reach the git remote. Check your network connection.');
    }

    let behind = 0;
    try {
        behind = Number.parseInt(git(['rev-list', '--count', `HEAD..origin/${branch}`]), 10) || 0;
    } catch {
        // Untracked branch — try origin/main as the update target for source installs.
        try {
            behind = Number.parseInt(git(['rev-list', '--count', 'HEAD..origin/main']), 10) || 0;
            if (behind > 0 && !checkOnly) {
                console.log('[update] Branch has no origin twin; fast-forwarding toward origin/main...');
            }
        } catch {
            fail(`Branch "${branch}" has no origin counterpart to compare against.`);
        }
    }

    const localCommit = git(['rev-parse', '--short', 'HEAD']);
    if (behind === 0 && !forceDeps && !updateLibs) {
        console.log(`[update] Already up to date (commit ${localCommit}).`);
        ensureDependencies(false);
        console.log('[update] Dependencies verified.');
        return;
    }

    if (behind > 0) {
        console.log(`[update] ${behind} new commit(s) available.`);
    }
    if (checkOnly) {
        process.exitCode = behind > 0 ? 2 : 0;
        return;
    }

    const dirty = git(['status', '--porcelain']);
    if (dirty && behind > 0) {
        fail('You have local uncommitted changes. Commit or stash them first, then run the update again.');
    }

    const lockBefore = fileFingerprint('package-lock.json');
    const pkgBefore = fileFingerprint('package.json');

    if (behind > 0) {
        console.log('[update] Pulling latest code (fast-forward only)...');
        try {
            git(['pull', '--ff-only', 'origin', branch], { stdio: ['ignore', 'inherit', 'inherit'] });
        } catch {
            // Fallback: merge origin/main with ff-only when on a local-only branch.
            try {
                git(['merge', '--ff-only', 'origin/main'], { stdio: ['ignore', 'inherit', 'inherit'] });
            } catch {
                fail('Fast-forward pull failed. Your branch has diverged from the remote; resolve manually with git.');
            }
        }
    }

    const lockAfter = fileFingerprint('package-lock.json');
    const pkgAfter = fileFingerprint('package.json');
    const depsChanged = forceDeps || lockAfter !== lockBefore || pkgAfter !== pkgBefore || behind > 0;

    if (depsChanged) {
        ensureDependencies(true);
    } else {
        ensureDependencies(false);
    }

    if (updateLibs) {
        runNpm(['update'], 'Updating libraries within package ranges (npm update)');
        // Re-verify install marker after library bumps.
        ensureDependencies(false);
    }

    const newCommit = git(['rev-parse', '--short', 'HEAD']);
    console.log(`[update] Ready at ${newCommit}${localCommit !== newCommit ? ` (was ${localCommit})` : ''}.`);
    console.log('[update] Restart with start.bat / start.command / npm run launch to load the new version.');
}

main();
