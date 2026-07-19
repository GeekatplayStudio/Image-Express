import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function log(msg) {
    console.log(`[DEPS] ${msg}`);
}

export function ensureDependencies(forceInstall = false) {
    const nodeModulesPath = path.join(rootDir, 'node_modules');
    const markerPath = path.join(nodeModulesPath, '.install-complete');
    const lockPath = path.join(rootDir, 'package-lock.json');

    const needsInstall =
        forceInstall ||
        !fs.existsSync(nodeModulesPath) ||
        !fs.existsSync(path.join(nodeModulesPath, '.bin', isWin ? 'next.cmd' : 'next')) ||
        !fs.existsSync(markerPath) ||
        (fs.existsSync(lockPath) &&
            fs.statSync(lockPath).mtimeMs > (fs.existsSync(markerPath) ? fs.statSync(markerPath).mtimeMs : 0));

    if (!needsInstall) {
        return;
    }

    log('Dependencies missing or out of date. Installing (this may take a few minutes)...');
    // Electron's postinstall downloads a large binary and is only needed for
    // the desktop app shell, not the web app. Skipping it avoids failures
    // behind corporate proxies/firewalls with custom SSL certs.
    const installEnv = { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' };
    // Windows blocks spawning .cmd files without a shell (Node CVE-2024-27980 fix),
    // so a shell is required there; elsewhere skip it to avoid DEP0190.
    const install = spawnSync(npmCmd, ['install'], {
        stdio: 'inherit',
        cwd: rootDir,
        env: installEnv,
        shell: isWin,
    });

    if (install.status !== 0) {
        console.error('[ERROR] npm install failed. See output above for details.');
        process.exit(install.status || 1);
    }

    fs.writeFileSync(markerPath, new Date().toISOString());
    log('Dependencies installed.');
}

// Allow running directly (`node scripts/ensure-deps.mjs`) as well as importing.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    ensureDependencies(process.argv.includes('--force'));
}
