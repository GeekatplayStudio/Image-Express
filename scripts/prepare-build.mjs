import fs from 'node:fs';
import path from 'node:path';

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
