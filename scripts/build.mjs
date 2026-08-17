/**
 * `npm run build` entry point.
 *
 * This exists so the build can *fix* a bad Node instead of just refusing to run.
 * When `build` was plain `next build`, npm launched the compiler with whatever
 * Node started npm — a version manager serving an old Node on PATH could not be
 * worked around from inside a sibling lifecycle script, so the only honest
 * option was to stop with instructions. Owning the step means we can re-exec
 * under a supported Node and then run Next as its child, so the shell's Node no
 * longer matters.
 *
 * Any extra arguments are forwarded to `next build`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enforceSupportedNode, envWithSupportedNode, requiredNodeMajor } from './node-guard.mjs';
import { assertBuildOutputAvailable } from './server-lock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Re-execs this script under a supported Node when PATH hands us an old one, and
// only stops if no usable Node exists anywhere on the machine.
enforceSupportedNode({ reexec: true, exitOnFailure: true, label: 'BUILD' });
assertBuildOutputAvailable();

console.log(`[BUILD] node ${process.version} (requires >=${requiredNodeMajor()})`);

// Invoke Next's JS entry point with this process's Node rather than the `next`
// shim, so the compiler cannot pick a different interpreter off PATH -- and so
// Windows never has to spawn a .cmd through a shell.
const nextBin = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!fs.existsSync(nextBin)) {
    console.error(`[BUILD] ERROR: ${nextBin} not found. Run "npm install" first.`);
    process.exit(1);
}

const result = spawnSync(process.execPath, [nextBin, 'build', ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: rootDir,
    env: envWithSupportedNode(),
});

process.exit(result.status === null ? 1 : result.status);
