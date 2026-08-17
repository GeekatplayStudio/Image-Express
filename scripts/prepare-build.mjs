/**
 * Clears the Next.js build output.
 *
 * The engine check deliberately does NOT live here: `scripts/build.mjs` owns the
 * build and can re-exec under a supported Node, which is a fix rather than a
 * refusal. This script only removes a directory and runs fine on any Node.
 */
import fs from 'node:fs';
import path from 'node:path';
import { assertBuildOutputAvailable } from './server-lock.mjs';

assertBuildOutputAvailable();

const projectRoot = path.resolve(process.cwd());
const nextOutput = path.resolve(projectRoot, '.next');

if (path.dirname(nextOutput) !== projectRoot || path.basename(nextOutput) !== '.next') {
    throw new Error(`Refusing to clean unexpected build path: ${nextOutput}`);
}

await fs.promises.rm(nextOutput, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
});
console.log('Prepared clean Next.js build output.');
