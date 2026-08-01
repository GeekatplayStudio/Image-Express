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

    // Prefer a clean lockfile install when the lock exists.
    const preferCi = fs.existsSync(lockPath) && !process.argv.includes('--no-ci');
    if (preferCi) {
        const ci = runNpm(['ci', '--no-fund', '--no-audit']);
        if (ci.status === 0) {
            fs.writeFileSync(markerPath, expectedMarker);
            log('Dependencies installed (npm ci).');
            return true;
        }
        log('npm ci failed — falling back to npm install...');
    }

    const install = runNpm(['install', '--no-fund', '--no-audit']);

    if (install.status !== 0) {
        console.error('[ERROR] npm install failed. See output above for details.');
        process.exit(install.status || 1);
    }

    if (!criticalBinsPresent()) {
        console.error('[ERROR] Install finished but critical packages are still missing (next/react).');
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
