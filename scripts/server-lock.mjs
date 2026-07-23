// Tracks which Image Express server currently owns the .next build directory.
//
// Why this exists: a `next dev` server continuously owns and rewrites .next.
// If a production build/start runs in the same checkout at the same time, dev
// wipes the production output mid-flight and the prod server dies with
// confusing errors (ENOTEMPTY clearing .next, "No production build found",
// or a missing .next/server/middleware-manifest.json). Detecting the conflict
// up front turns a corrupt build into a clear, actionable message.

import fs from 'fs';
import path from 'path';

// Kept OUTSIDE .next on purpose — the launcher clears/renames .next, which
// would otherwise destroy the lock it needs to read.
const LOCK_DIR = path.join(process.cwd(), 'node_modules', '.cache');
const LOCK_FILE = path.join(LOCK_DIR, 'image-express-server.lock');

function isAlive(pid) {
    try {
        process.kill(pid, 0); // signal 0 = existence check, doesn't kill
        return true;
    } catch (err) {
        return err.code === 'EPERM'; // exists but owned by another user
    }
}

/** The live server holding the lock, or null if none (stale locks are ignored). */
export function readServerLock() {
    try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        if (Number.isInteger(lock?.pid) && isAlive(lock.pid)) return lock;
    } catch {
        // missing/corrupt lock — treat as "no server running"
    }
    return null;
}

export function writeServerLock(mode) {
    try {
        fs.mkdirSync(LOCK_DIR, { recursive: true });
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, mode, startedAt: new Date().toISOString() }));
    } catch {
        // A lock we can't write is not worth failing the launch over.
    }
}

/** Release the lock, but only if we're the owner. */
export function clearServerLock() {
    try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        if (lock?.pid === process.pid) fs.rmSync(LOCK_FILE, { force: true });
    } catch {
        // nothing to release
    }
}

/**
 * Exits with a clear explanation if another Image Express server already owns
 * this checkout. `intent` is the mode we're trying to start ('dev' | 'prod').
 */
export function assertNoConflictingServer(intent) {
    const lock = readServerLock();
    if (!lock) return;

    console.error('');
    console.error('[ERROR] Another Image Express server is already running for this folder.');
    console.error(`        Running: ${lock.mode} mode (process ${lock.pid}, started ${lock.startedAt})`);
    console.error(`        You tried to start: ${intent} mode`);
    console.error('');
    console.error('  Both would fight over the .next build folder, which corrupts the build.');
    console.error('  Stop the running server first (close its window, or press Ctrl+C in it),');
    console.error('  then run this again.');
    console.error('');
    process.exit(1);
}

/**
 * True when .next holds a real, complete production build. Checking BUILD_ID
 * alone is not enough: a half-cleared or dev-clobbered .next can leave the
 * directory present but missing the server manifests `next start` requires.
 */
export function hasCompleteProductionBuild() {
    return fs.existsSync('.next/BUILD_ID')
        && fs.existsSync('.next/server/middleware-manifest.json')
        && fs.existsSync('.next/routes-manifest.json');
}
