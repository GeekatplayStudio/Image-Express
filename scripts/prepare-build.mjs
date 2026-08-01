import fs from 'node:fs';
import path from 'node:path';
import { enforceSupportedNode, findSupportedNode, requiredNodeMajor } from './node-guard.mjs';

// `next build` runs as a sibling npm step, so we cannot re-exec our way out of a
// bad engine here — the build would still use the Node that npm was started with.
// Stop now with an actionable message instead of failing deep inside the compiler.
const engine = enforceSupportedNode({ reexec: false, exitOnFailure: true, label: 'BUILD' });
if (!engine.ok) {
    const better = engine.better || findSupportedNode(engine.minMajor);
    console.error(`\n[BUILD] ERROR: this build needs Node >=${engine.minMajor}, but npm is running Node ${process.version}.\n`);
    if (better) {
        console.error(`A supported Node is already installed at:\n  ${better.dir}\n`);
        console.error('Start a shell that uses it, then build again — for example:');
        console.error(process.platform === 'win32'
            ? `  set "PATH=${better.dir};%PATH%" && npm run build`
            : `  PATH="${better.dir}:$PATH" npm run build`);
        console.error('\nOr just use the launcher, which switches Node for you:');
        console.error(process.platform === 'win32' ? '  start.bat' : '  ./start.command');
    }
    console.error('');
    process.exit(1);
}

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
console.log(`Prepared clean Next.js build output (node ${process.version}, requires >=${requiredNodeMajor()}).`);
