/**
 * Provisions the Electron runtime binary for the desktop scripts.
 *
 * `ensure-deps` installs with ELECTRON_SKIP_BINARY_DOWNLOAD=1 so the (large)
 * Electron download never slows down a plain web install — and npm 11 blocks
 * install scripts by default anyway. That leaves node_modules/electron without
 * its `dist/`, which `electron .` and `electron-builder` both need. This script
 * runs Electron's own installer on demand, and is idempotent.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { enforceSupportedNode } from './node-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const electronDir = path.join(rootDir, 'node_modules', 'electron');

function log(msg) {
    console.log(`[ELECTRON] ${msg}`);
}

/** Electron writes `path.txt` next to `dist/` once the binary is unpacked. */
function binaryPresent() {
    const pathTxt = path.join(electronDir, 'path.txt');
    if (!fs.existsSync(pathTxt)) return false;
    const relative = fs.readFileSync(pathTxt, 'utf8').trim();
    return relative.length > 0 && fs.existsSync(path.join(electronDir, 'dist', relative));
}

export function ensureElectronBinary({ force = false } = {}) {
    enforceSupportedNode({ reexec: true, exitOnFailure: true, label: 'ELECTRON' });

    if (!fs.existsSync(electronDir)) {
        console.error('[ELECTRON] ERROR: node_modules/electron is missing. Run "npm install" first.');
        process.exit(1);
    }
    if (!force && binaryPresent()) {
        log('Runtime binary already present.');
        return false;
    }

    const installer = path.join(electronDir, 'install.js');
    if (!fs.existsSync(installer)) {
        console.error(`[ELECTRON] ERROR: ${installer} not found — the electron package looks incomplete.`);
        process.exit(1);
    }

    log('Downloading the Electron runtime (one-time, a few hundred MB)...');
    const env = { ...process.env };
    // These are exactly the switches that suppressed the download at install time.
    delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
    delete env.npm_config_electron_skip_binary_download;

    const result = spawnSync(process.execPath, [installer], {
        stdio: 'inherit',
        cwd: electronDir,
        env,
    });

    if (result.status !== 0 || !binaryPresent()) {
        console.error('');
        console.error('[ELECTRON] ERROR: could not provision the Electron runtime.');
        console.error('  This step needs network access to https://github.com/electron/electron/releases.');
        console.error('  Behind a proxy or mirror, set ELECTRON_MIRROR (or ELECTRON_CUSTOM_DIR) and retry:');
        console.error('    npm run electron:ensure');
        console.error('');
        process.exit(result.status || 1);
    }

    log('Electron runtime ready.');
    return true;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    ensureElectronBinary({ force: process.argv.includes('--force') });
}
