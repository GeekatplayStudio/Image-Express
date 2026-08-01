import fs from 'fs';
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
 * Install / repair npm dependencies when missing, incomplete, or out of date.
 * Safe to call from installers, launchers, and the self-updater.
 */
export function ensureDependencies(forceInstall = false) {
    const nodeModulesPath = path.join(rootDir, 'node_modules');
    const markerPath = path.join(nodeModulesPath, '.install-complete');
    const lockPath = path.join(rootDir, 'package-lock.json');
    const pkgPath = path.join(rootDir, 'package.json');

    const lockHash = sha1File(lockPath);
    const pkgHash = sha1File(pkgPath);
    const expectedMarker = `${pkgHash}:${lockHash}`;

    let markerOk = false;
    if (fs.existsSync(markerPath)) {
        try {
            markerOk = fs.readFileSync(markerPath, 'utf8').trim() === expectedMarker;
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
        if (npmCli) {
            return spawnSync(process.execPath, [npmCli, ...args], {
                stdio: 'inherit',
                cwd: rootDir,
                env: installEnv,
            });
        }
        return spawnSync(npmCmd, args, {
            stdio: 'inherit',
            cwd: rootDir,
            env: installEnv,
            shell: isWin,
        });
    }

    /**
     * `npm ci` deletes and rebuilds node_modules itself, reconciling against
     * whatever is already there. On Windows, a real-time antivirus scanner or
     * the Search Indexer can be holding a handle on a file inside node_modules
     * at that exact moment (both processes were confirmed running on this
     * machine), and npm's own delta-uninstall then fails outright:
     * `ENOTEMPTY: directory not empty, rmdir '...\node_modules\core-js\modules'`.
     * That is a real, fatal exit — not the many `npm warn tar ENOENT` lines
     * around it, which are non-fatal warnings from extraction racing the same
     * scanner and do not by themselves break the install.
     *
     * Removing node_modules ourselves first, with Node's own `fs.rmSync`
     * retry/backoff (built for exactly this Windows failure mode), turns every
     * `npm ci` into a clean extract-into-empty-directory instead of a
     * reconcile-against-a-possibly-locked-tree. That eliminates the failure
     * class instead of retrying past it.
     */
    function removeNodeModules() {
        if (!fs.existsSync(nodeModulesPath)) return;
        log('Clearing node_modules before a clean install...');
        fs.rmSync(nodeModulesPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }

    /**
     * Retries a full install attempt a bounded number of times. This is
     * deliberately NOT silent: every attempt's real npm output goes straight to
     * the terminal (stdio: 'inherit' above), and this only decides whether to
     * try again — it never hides a failure, it exhausts retries and then exits
     * with the exact same error the first attempt would have shown.
     */
    function withRetries(attempt, description) {
        const maxAttempts = 3;
        for (let n = 1; n <= maxAttempts; n += 1) {
            if (attempt()) return true;
            if (n < maxAttempts) {
                log(`${description} did not produce a working install (attempt ${n}/${maxAttempts}) — `
                    + 'this usually means a real-time antivirus scanner or the Windows Search '
                    + 'Indexer briefly locked a file mid-install. Retrying...');
            }
        }
        return false;
    }

    // Prefer a clean lockfile install when the lock exists.
    const preferCi = fs.existsSync(lockPath) && !process.argv.includes('--no-ci');
    if (preferCi) {
        const ciSucceeded = withRetries(() => {
            removeNodeModules();
            const ci = runNpm(['ci', '--no-fund', '--no-audit']);
            // `npm ci` can also exit 0 while the tree is actually broken (extraction
            // raced the same scanner without a fatal exit code) — seen on this
            // machine as `react` missing entirely while npm still reported success.
            // Checking criticalBinsPresent() here, not just on the fallback below,
            // is what catches that instead of failing confusingly at build time.
            return ci.status === 0 && criticalBinsPresent();
        }, 'npm ci');

        if (ciSucceeded) {
            fs.writeFileSync(markerPath, expectedMarker);
            log('Dependencies installed (npm ci).');
            return true;
        }
        log('npm ci did not succeed after retries — falling back to npm install...');
    }

    const installSucceeded = withRetries(() => {
        const install = runNpm(['install', '--no-fund', '--no-audit']);
        return install.status === 0 && criticalBinsPresent();
    }, 'npm install');

    if (!installSucceeded) {
        console.error('[ERROR] npm install failed to produce a working install after retries.');
        console.error('        See the npm output above for the underlying error.');
        console.error('        If every attempt showed ENOTEMPTY / EPERM / EBUSY on a rmdir or lstat,');
        console.error('        that is Windows Defender or Search Indexer locking a file mid-install.');
        console.error('        An admin can add a Defender exclusion for this folder to speed installs up:');
        console.error(`          Add-MpPreference -ExclusionPath "${rootDir}"`);
        process.exit(1);
    }

    fs.writeFileSync(markerPath, expectedMarker);
    log('Dependencies installed.');
    return true;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    ensureDependencies(process.argv.includes('--force'));
}
