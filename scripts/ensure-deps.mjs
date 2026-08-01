import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
    enforceSupportedNode,
    envWithoutInheritedNpm,
    envWithSupportedNode,
    npmCliFor,
    requiredNodeMajor,
} from './node-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function log(msg) {
    console.log(`[DEPS] ${msg}`);
}

function sha1File(filePath) {
    if (!fs.existsSync(filePath)) return 'missing';
    return createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function criticalBinsPresent() {
    const nextBin = path.join(rootDir, 'node_modules', '.bin', isWin ? 'next.cmd' : 'next');
    const react = path.join(rootDir, 'node_modules', 'react', 'package.json');
    const nextPkg = path.join(rootDir, 'node_modules', 'next', 'package.json');
    return fs.existsSync(nextBin) && fs.existsSync(react) && fs.existsSync(nextPkg);
}

/**
 * Tail of the newest npm debug log. npm prints real diagnostics to a log file
 * ("A complete log of this run can be found in: ..."); reading it back after a
 * failure lets us tell a deterministic config error apart from a transient
 * filesystem race WITHOUT capturing/buffering npm's live output (which would
 * make long installs look frozen).
 */
function newestNpmLogTail(notBeforeMs) {
    const candidates = [
        process.env.npm_config_cache && path.join(process.env.npm_config_cache, '_logs'),
        isWin && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'npm-cache', '_logs'),
        path.join(os.homedir(), '.npm', '_logs'),
    ].filter(Boolean);
    for (const logsDir of candidates) {
        try {
            const newest = fs.readdirSync(logsDir)
                .filter((name) => name.endsWith('.log'))
                .map((name) => {
                    const full = path.join(logsDir, name);
                    return { full, mtime: fs.statSync(full).mtimeMs };
                })
                .sort((a, b) => b.mtime - a.mtime)[0];
            if (!newest) continue;
            // Only accept a log written by THE RUN WE JUST MADE. npm flushes its
            // debug log on exit, slightly after our spawnSync returns — without
            // this check the first failed attempt reads the PREVIOUS session's
            // log and misclassifies (observed: a lock-sync error diagnosed as
            // 'unknown' on attempt 1, correctly on attempt 2).
            if (notBeforeMs && newest.mtime < notBeforeMs) continue;
            const stat = fs.statSync(newest.full);
            const start = Math.max(0, stat.size - 16_384);
            const fd = fs.openSync(newest.full, 'r');
            try {
                const buffer = Buffer.alloc(stat.size - start);
                fs.readSync(fd, buffer, 0, buffer.length, start);
                return buffer.toString('utf8');
            } finally {
                fs.closeSync(fd);
            }
        } catch {
            // try the next candidate dir
        }
    }
    return '';
}

function sleepMs(ms) {
    // Synchronous wait; Atomics.wait needs a SharedArrayBuffer and never spins.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Why did the npm command that started at `startedAtMs` fail?
 * - 'lock-sync': package.json and package-lock.json disagree (someone changed
 *   deps/overrides without reinstalling). Deterministic — retrying `npm ci`
 *   can never fix it; only `npm install` (which regenerates the lock) can.
 * - 'file-lock': EPERM/ENOTEMPTY/EBUSY/UNKNOWN — a scanner or indexer holding
 *   handles mid-operation.
 * - 'unknown': anything else (network, registry, disk full...).
 */
function classifyNpmFailure(startedAtMs) {
    // npm writes its debug log on exit; give it a moment to land.
    let tail = '';
    for (let waited = 0; waited <= 2000 && !tail; waited += 250) {
        tail = newestNpmLogTail(startedAtMs);
        if (!tail) sleepMs(250);
    }
    if (/EUSAGE|are in sync|does not satisfy|Missing: .* from lock file/.test(tail)) return 'lock-sync';
    if (/EPERM|ENOTEMPTY|EBUSY|UNKNOWN: unknown error/.test(tail)) return 'file-lock';
    return 'unknown';
}

/**
 * Retrying only makes sense for BRIEF interference. When a full install
 * attempt ground on for minutes and then died on a file lock, the scanner
 * contention is sustained — another attempt will burn the same minutes and
 * fail the same way (measured on this machine: 3 × ~13 min, all ENOTEMPTY).
 * Fail fast with the actual fix instead of pretending persistence helps.
 */
const SUSTAINED_INTERFERENCE_MS = 3 * 60 * 1000;

function explainSustainedInterference() {
    console.error('');
    console.error('[ERROR] The install keeps failing on locked files, and each attempt is taking');
    console.error('        minutes — this is sustained interference from real-time file scanning');
    console.error('        (Windows Defender / Search Indexer), not a temporary glitch. Retrying');
    console.error('        will only waste more time.');
    console.error('');
    console.error('        The fix (run once, as Administrator, then re-run npm run setup):');
    console.error(`          Add-MpPreference -ExclusionPath "${rootDir}"`);
    console.error('');
    console.error('        This excludes only this project folder from real-time scanning. It');
    console.error('        also makes every future install several times faster.');
    console.error('');
}

/**
 * Install / repair npm dependencies when missing, incomplete, or out of date.
 * Safe to call from installers, launchers, and the self-updater.
 */
export function ensureDependencies(forceInstall = false) {
    const nodeModulesPath = path.join(rootDir, 'node_modules');
    const markerPath = path.join(nodeModulesPath, '.install-complete');
    const lockPath = path.join(rootDir, 'package-lock.json');
    const pkgPath = path.join(rootDir, 'package.json');

    // The marker must always be computed from the CURRENT files at write time.
    // It was once captured before the install — but a fallback `npm install`
    // legitimately rewrites package-lock.json (e.g. after an overrides edit),
    // so the pre-captured hash never matched again and every subsequent run
    // reinstalled from scratch: a full multi-minute install loop.
    function currentMarker() {
        return `${sha1File(pkgPath)}:${sha1File(lockPath)}`;
    }
    function writeMarker() {
        fs.writeFileSync(markerPath, currentMarker());
    }

    let markerOk = false;
    if (fs.existsSync(markerPath)) {
        try {
            markerOk = fs.readFileSync(markerPath, 'utf8').trim() === currentMarker();
        } catch {
            markerOk = false;
        }
    }

    const needsInstall =
        forceInstall ||
        !fs.existsSync(nodeModulesPath) ||
        !criticalBinsPresent() ||
        !markerOk;

    if (!needsInstall) {
        return false;
    }

    // Never install under an unsupported engine: npm downgrades that to a warning and
    // leaves behind a subtly broken tree. Re-exec under a good Node, or stop with guidance.
    enforceSupportedNode({ reexec: true, exitOnFailure: true });

    log(forceInstall
        ? 'Refreshing dependencies...'
        : 'Dependencies missing, incomplete, or out of date. Installing (this may take a few minutes)...');
    log(`Using node ${process.version} (requires >=${requiredNodeMajor()}).`);

    const installEnv = {
        ...envWithoutInheritedNpm(envWithSupportedNode()),
        ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
    };

    // Run npm's CLI directly with this Node rather than the `npm` shim: the shim
    // resolves the global prefix and defers to a globally-installed npm, which is
    // how an install kept landing on npm 10 even after switching to Node 26.
    const npmCli = npmCliFor();
    function runNpm(args) {
        // --prefer-offline for `npm ci` only: ci installs the exact versions the
        // lockfile pins (integrity-checked), so trusting the local cache instead
        // of revalidating ~1200 tarballs against the registry is pure speed-up.
        // Range-resolving commands (`npm install`) must NOT get it — a stale
        // cached package listing has produced ETARGET for a version that exists.
        const speedFlags = args[0] === 'ci' ? ['--prefer-offline'] : [];
        const fullArgs = [...args, ...speedFlags, '--no-fund', '--no-audit'];
        if (npmCli) {
            return spawnSync(process.execPath, [npmCli, ...fullArgs], {
                stdio: 'inherit',
                cwd: rootDir,
                env: installEnv,
            });
        }
        return spawnSync(npmCmd, fullArgs, {
            stdio: 'inherit',
            cwd: rootDir,
            env: installEnv,
            shell: isWin,
        });
    }

    /**
     * `npm ci` deletes and rebuilds node_modules itself, reconciling against
     * whatever is already there. On Windows, a real-time antivirus scanner or
     * the Search Indexer holding a handle on a file at that moment makes npm's
     * own delta-uninstall fail (`ENOTEMPTY ... rmdir`) — and a direct
     * `fs.rmSync` of the whole tree hits the same wall, because the scanner
     * re-locks files faster than the retry/backoff releases them (measured:
     * 48s of deleting, then ENOTEMPTY anyway).
     *
     * The robust pattern is rename-then-delete, the same one launch.mjs uses
     * for `.next`: renaming the top-level directory is near-instant and works
     * even while a scanner holds handles on files inside it, npm then
     * extracts into a genuinely empty node_modules, and deleting the renamed
     * leftover happens off the critical path — tolerating failure, because a
     * stray `node_modules.stale-*` directory costs disk space, not a broken
     * install. Leftovers are swept on later runs.
     */
    function removeNodeModules() {
        // Best-effort sweep of leftovers from previous attempts.
        for (const entry of fs.readdirSync(rootDir)) {
            if (entry.startsWith('node_modules.stale-')) {
                try {
                    fs.rmSync(path.join(rootDir, entry), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
                } catch {
                    // still locked — a later run will get it
                }
            }
        }
        if (!fs.existsSync(nodeModulesPath)) return;

        log('Clearing node_modules before a clean install...');
        const stale = path.join(rootDir, `node_modules.stale-${Date.now()}`);
        try {
            fs.renameSync(nodeModulesPath, stale);
        } catch {
            // Even the rename is blocked — fall back to an in-place delete, and
            // tolerate failure: npm ci can still reconcile a partial tree, which
            // is worse than a clean dir but far better than crashing here.
            try {
                fs.rmSync(nodeModulesPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
            } catch (err) {
                log(`Could not fully clear node_modules (${err.code}); continuing — npm will reconcile in place.`);
            }
            return;
        }
        try {
            fs.rmSync(stale, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } catch {
            log(`Left ${path.basename(stale)} behind (files still locked); it will be swept on a later run.`);
        }
    }

    const maxAttempts = 3;

    // Prefer a clean lockfile install when the lock exists.
    const preferCi = fs.existsSync(lockPath) && !process.argv.includes('--no-ci');
    if (preferCi) {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            removeNodeModules();
            const startedAt = Date.now();
            const ci = runNpm(['ci']);
            // Exit 0 is not proof of a working tree: extraction racing a scanner
            // has produced "success" with react missing entirely. Verify.
            if (ci.status === 0 && criticalBinsPresent()) {
                writeMarker();
                log('Dependencies installed (npm ci).');
                return true;
            }

            const elapsed = Date.now() - startedAt;
            const reason = classifyNpmFailure(startedAt);
            if (reason === 'lock-sync') {
                // Deterministic: package.json changed (deps or overrides) without a
                // reinstall. Retrying npm ci can never succeed — only npm install
                // can, because it regenerates the lockfile. Go straight there.
                log('package.json and package-lock.json are out of sync — someone changed');
                log('dependencies or overrides without reinstalling. Regenerating the');
                log('lockfile with npm install (this is expected, not an error)...');
                break;
            }
            if (reason === 'file-lock' && elapsed > SUSTAINED_INTERFERENCE_MS) {
                explainSustainedInterference();
                process.exit(1);
            }
            if (attempt < maxAttempts) {
                log(`npm ci did not produce a working install (attempt ${attempt}/${maxAttempts})`
                    + (reason === 'file-lock'
                        ? ' — a real-time antivirus scanner or the Windows Search Indexer locked a file mid-install. Retrying...'
                        : '. Retrying...'));
            } else {
                log('npm ci did not succeed after retries — falling back to npm install...');
            }
        }
    }

    // Fallback / lockfile regeneration path. Every attempt's real npm output is
    // on the terminal already (stdio: 'inherit'); nothing is suppressed.
    let installSucceeded = false;
    for (let attempt = 1; attempt <= maxAttempts && !installSucceeded; attempt += 1) {
        const startedAt = Date.now();
        const install = runNpm(['install']);
        installSucceeded = install.status === 0 && criticalBinsPresent();
        if (!installSucceeded) {
            const elapsed = Date.now() - startedAt;
            const reason = classifyNpmFailure(startedAt);
            if (reason === 'file-lock' && elapsed > SUSTAINED_INTERFERENCE_MS) {
                explainSustainedInterference();
                process.exit(1);
            }
            if (attempt < maxAttempts) {
                log(`npm install did not produce a working install (attempt ${attempt}/${maxAttempts})`
                    + (reason === 'file-lock'
                        ? ' — a scanner/indexer locked a file mid-install. Retrying...'
                        : '. Retrying...'));
            }
        }
    }

    if (!installSucceeded) {
        console.error('[ERROR] npm install failed to produce a working install after retries.');
        console.error('        See the npm output above for the underlying error.');
        console.error('        If attempts showed ENOTEMPTY / EPERM / EBUSY / UNKNOWN on file operations,');
        console.error('        that is Windows Defender or Search Indexer locking files mid-install.');
        console.error('        An admin can exclude this folder from real-time scanning to fix that');
        console.error('        permanently (and make installs several times faster):');
        console.error(`          Add-MpPreference -ExclusionPath "${rootDir}"`);
        process.exit(1);
    }

    writeMarker();
    log('Dependencies installed.');
    return true;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    ensureDependencies(process.argv.includes('--force'));
}
