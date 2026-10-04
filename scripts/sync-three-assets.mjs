#!/usr/bin/env node
/**
 * Copies three.js' Draco and Basis decoders into `public/three/` so the app
 * serves them itself.
 *
 * Without this the 3D editor fetched the Draco decoder from www.gstatic.com at
 * run time, which a desktop app should not depend on. The copies are committed;
 * run this again after upgrading `three` (a test compares them with
 * node_modules and fails when they drift).
 *
 *     node scripts/sync-three-assets.mjs
 */
import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const libs = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs');

const SETS = [
    { from: path.join(libs, 'draco', 'gltf'), to: path.join(root, 'public', 'three', 'draco') },
    { from: path.join(libs, 'basis'), to: path.join(root, 'public', 'three', 'basis') },
];

for (const { from, to } of SETS) {
    await mkdir(to, { recursive: true });
    const files = (await readdir(from)).filter((name) => /\.(js|wasm)$/.test(name));
    for (const name of files) await cp(path.join(from, name), path.join(to, name));
    console.log(`${path.relative(root, to)}: ${files.join(', ')}`);
}
