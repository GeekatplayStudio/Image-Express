/**
 * Tracks which production build currently owns the .next directory.
 *
 * Why this exists: `npm run build` clears .next in its prebuild step
 * (`prepare-build.mjs`) and then compiles into it. Two builds started against
 * the same checkout therefore destroy each other — the second one's clean wipes
 * the first one's live Turbopack worker scripts out from under it, and both
 * processes then sit at "Creating an optimized production build ..." forever at
 * 0% CPU, because each is waiting on an IPC peer whose files no longer exist.
 * The build reports no error; it simply never finishes.
 *
 * `server-lock.mjs` already guards build-vs-server. This is the missing
 * build-vs-build half, and it deliberately uses the same lock idiom.
 */
import fs from 'node:fs';
import path from 'node:path';

// Kept OUTSIDE .next on purpose — the build clears .next, which would otherwise
// destroy the very lock it needs to read.
const LOCK_DIR = path.join(process.cwd(), 'node_modules', '.cache');
const LOCK_FILE = path.join(LOCK_DIR, 'image-express-build.lock');

/**
 * npm runs `prebuild` and `build` as two separate processes, so the lock is
 * briefly owned by a pid that has already exited. Treat a recent lock as live
 * across that handoff instead of letting a second build slip into the gap.
 */
const HANDOFF_GRACE_MS = 60_000;

function isAlive(pid) {
    try {
        process.kill(pid, 0); // signal 0 = existence check, doesn't kill
        return true;
    } catch (err) {
        return err.code === 'EPERM'; // exists but owned by another user
    }
}

/**
 * The build currently holding the lock, or null if none.
 *
 * A lock whose process died more than the handoff grace ago is stale — a killed
 * or crashed build must not wedge every later one.
 */
export function readBuildLock({ ignoreHandoff = false } = {}) {
    try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        if (!Number.isInteger(lock?.pid)) return null;
        if (isAlive(lock.pid)) return lock;
        // `ignoreHandoff` is for the compile step, whose own prebuild has just
        // exited and left exactly this shape of lock behind. Honouring the grace
        // there would make every build refuse itself.
        if (ignoreHandoff) return null;
        const age = Date.now() - Date.parse(lock.updatedAt);
        if (Number.isFinite(age) && age >= 0 && age < HANDOFF_GRACE_MS) return lock;
    } catch {
        // missing/corrupt lock — treat as "no build running"
    }
    return null;
}

/** Take ownership of the lock for this process. */
export function claimBuildLock(phase) {
    try {
        fs.mkdirSync(LOCK_DIR, { recursive: true });
        const now = new Date().toISOString();
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, phase, startedAt: now, updatedAt: now }));
    } catch {
        // A lock we can't write is not worth failing the build over.
    }
}

/** Release the lock, but only if we're the owner. */
export function clearBuildLock() {
    try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        if (lock?.pid === process.pid) fs.rmSync(LOCK_FILE, { force: true });
    } catch {
        // nothing to release
    }
}

/**
 * Exits with a clear explanation if another build already owns this checkout.
 * Without this the conflict is silent: the build just hangs forever.
 */
export function assertNoConcurrentBuild(intent, options) {
    const lock = readBuildLock(options);
    if (!lock) return;

    console.error('');
    console.error('[ERROR] Another production build is already running for this folder.');
    console.error(`        Running: ${lock.phase} phase (process ${lock.pid}, started ${lock.startedAt})`);
    console.error(`        You tried to start: ${intent}`);
    console.error('');
    console.error('  Two builds share one .next directory, and the second one\'s clean step');
    console.error('  deletes the first one\'s worker files. Both then hang at "Creating an');
    console.error('  optimized production build ..." with no error and no progress.');
    console.error('');
    console.error('  Wait for the running build to finish, or stop it (Ctrl+C in its window)');
    console.error('  and run this again.');
    console.error('');
    process.exit(1);
}
