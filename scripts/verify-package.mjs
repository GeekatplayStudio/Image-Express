import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const distDir = path.join(root, 'dist');

function findFiles(directory, filename, results = []) {
    if (!fs.existsSync(directory)) return results;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            findFiles(target, filename, results);
        } else if (entry.name === filename) {
            results.push(target);
        }
    }
    return results;
}

const asarFiles = findFiles(distDir, 'app.asar');
if (asarFiles.length === 0) {
    throw new Error('No packaged app.asar was found under dist/. Build a desktop package first.');
}

const requiredAsarEntries = [
    '/electron/main.js',
    '/electron/preload.js',
    '/package.json',
];

for (const asarFile of asarFiles) {
    const result = spawnSync(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['asar', 'list', asarFile],
        { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (result.status !== 0) {
        throw new Error(`Unable to inspect ${asarFile}: ${result.stderr || result.stdout}`);
    }
    for (const required of requiredAsarEntries) {
        if (!result.stdout.includes(required)) {
            throw new Error(`${asarFile} is missing required packaged entry ${required}`);
        }
    }

    const resourcesDir = path.dirname(asarFile);
    const standaloneDir = path.join(resourcesDir, 'next-standalone');
    const requiredResources = [
        path.join(standaloneDir, 'server.js'),
        path.join(standaloneDir, '.next', 'static'),
        path.join(standaloneDir, 'public'),
        path.join(resourcesDir, 'electron-runtime', 'node_modules', 'electron-updater', 'package.json'),
    ];
    for (const required of requiredResources) {
        if (!fs.existsSync(required)) {
            throw new Error(`${asarFile} is missing required resource ${required}`);
        }
    }
    console.log(`Verified desktop package: ${path.relative(root, asarFile)}`);
}
