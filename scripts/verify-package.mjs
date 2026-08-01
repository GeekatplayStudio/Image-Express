import fs from 'node:fs';
import path from 'node:path';
import { listPackage } from '@electron/asar';

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

function directorySize(directory) {
    let total = 0;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) total += directorySize(target);
        else if (entry.isFile()) total += fs.statSync(target).size;
    }
    return total;
}

/**
 * Anything matching these must never appear inside the shipped standalone
 * server. They are prior build output, authoring workspaces, or bulk assets —
 * each one has leaked in before via Next's whole-project file tracing, and a
 * single miss silently multiplies the installer size.
 */
const FORBIDDEN_STANDALONE_ENTRIES = [
    /^dist(-|$)/i,
    /^3d-models$/i,
    /^Packs-Assets-NotInclude$/i,
    /^mobile-companion$/i,
    /^ComfyUI workflows$/i,
    /^external$/i,
    /^coverage$/i,
    /^test-results$/i,
    /^src$/i,
    /^scripts$/i,
    /^\.git$/i,
    /\.(glb|gltf|fbx|obj)$/i,
];

// Generous ceiling: the standalone server plus its node_modules and static
// output. Well above a healthy build, far below anything that leaked assets.
const MAX_STANDALONE_MB = 400;

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
    // @electron/asar uses the host path separator in its listing. Normalize the
    // archive paths so the same package assertions work on Windows and POSIX.
    const entries = new Set(listPackage(asarFile).map((entry) => entry.replaceAll('\\', '/')));
    for (const required of requiredAsarEntries) {
        if (!entries.has(required)) {
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

    const leaked = fs.readdirSync(standaloneDir)
        .filter((name) => FORBIDDEN_STANDALONE_ENTRIES.some((pattern) => pattern.test(name)));
    if (leaked.length > 0) {
        throw new Error(
            `${path.relative(root, standaloneDir)} contains entries that must never ship: ${leaked.join(', ')}.\n`
            + '  Next.js traced them into the standalone output. Add them to '
            + '`outputFileTracingExcludes` in next.config.ts and rebuild.',
        );
    }

    const standaloneMb = directorySize(standaloneDir) / (1024 * 1024);
    if (standaloneMb > MAX_STANDALONE_MB) {
        throw new Error(
            `${path.relative(root, standaloneDir)} is ${standaloneMb.toFixed(0)} MB, over the `
            + `${MAX_STANDALONE_MB} MB budget.\n`
            + '  Something large was traced into the standalone output — check the biggest folders '
            + 'there and exclude them in `outputFileTracingExcludes` (next.config.ts).',
        );
    }

    console.log(
        `Verified desktop package: ${path.relative(root, asarFile)} `
        + `(standalone ${standaloneMb.toFixed(0)} MB / ${MAX_STANDALONE_MB} MB budget)`,
    );
}
