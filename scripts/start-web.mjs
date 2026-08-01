import net from 'net';
import { spawn, spawnSync, exec } from 'child_process';
import { enforceSupportedNode } from './node-guard.mjs';
import {
    assertNoConflictingServer,
    clearServerLock,
    hasCompleteProductionBuild,
    writeServerLock,
} from './server-lock.mjs';

function checkPort(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false); // Port is in use
            } else {
                resolve(false);
            }
        });
        server.once('listening', () => {
            server.close(() => {
                resolve(true); // Port is free
            });
        });
        // Bind ALL interfaces (no host argument), matching how `next start`
        // binds. Probing 127.0.0.1 specifically gives false "free" results on
        // Windows, where binding a specific address can succeed even while
        // another process holds 0.0.0.0/:: on the same port — which then blows
        // up as EADDRINUSE once Next actually starts.
        server.listen(port, '127.0.0.1');
    });
}

async function findAvailablePort(startPort) {
    let port = startPort;
    while (true) {
        const available = await checkPort(port);
        if (available) {
            return port;
        }
        port++;
    }
}

async function main() {
    // The dev/prod server, and the build it may trigger below, must run on a
    // supported Node — re-exec (with a patched PATH) when PATH hands us an old one.
    enforceSupportedNode({ reexec: true, exitOnFailure: true, label: 'INFO' });

    const mode = process.argv[2] === 'prod' ? 'prod' : 'dev';

    // A dev server continuously owns and rewrites .next. Starting a second
    // server against the same folder corrupts the build, so refuse up front
    // with an explanation rather than failing later in a confusing way.
    assertNoConflictingServer(mode);
    writeServerLock(mode);
    for (const signal of ['exit', 'SIGINT', 'SIGTERM']) {
        process.on(signal, () => {
            clearServerLock();
            if (signal !== 'exit') process.exit(0);
        });
    }

    // Auto-build in production mode if the build is missing OR incomplete.
    // Checking just for the .next directory (or even BUILD_ID) is not enough —
    // a half-cleared or dev-clobbered .next leaves the folder in place while
    // the server manifests `next start` needs are gone.
    if (mode === 'prod' && !hasCompleteProductionBuild()) {
        console.log('[INFO] No production build found in .next directory. Building the application first...');
        const buildCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const buildResult = spawnSync(buildCmd, ['run', 'build'], {
            stdio: 'inherit',
            shell: process.platform === 'win32'
        });
        if (buildResult.status !== 0) {
            console.error('[ERROR] Build failed. Cannot start production server.');
            process.exit(buildResult.status || 1);
        }
        console.log('[INFO] Build complete. Continuing to start server...');
    }

    // The build reported success — but confirm the artifacts are actually
    // there before handing off. If something deleted them in the meantime
    // (almost always a `next dev` server running against the same folder),
    // say so plainly instead of letting `next start` die on a missing
    // manifest with an opaque MODULE_NOT_FOUND stack.
    if (mode === 'prod' && !hasCompleteProductionBuild()) {
        console.error('');
        console.error('[ERROR] The production build is incomplete — .next is missing files that');
        console.error('        the server needs, even though the build reported success.');
        console.error('');
        console.error('  This almost always means something modified .next during the build.');
        console.error('  The usual cause is a `next dev` server running against this same');
        console.error('  folder: dev owns .next and will overwrite a production build.');
        console.error('');
        console.error('  Close any other running dev server or terminal for this project,');
        console.error('  then run this again.');
        console.error('');
        process.exit(1);
    }

    // Honor an explicit `-p <port>` argument (e.g. `npm run dev -- -p 3457`);
    // otherwise pick the first free port from 3042 upward.
    const portFlagIndex = process.argv.indexOf('-p');
    const requestedPort = portFlagIndex >= 0 ? Number.parseInt(process.argv[portFlagIndex + 1], 10) : NaN;
    const startPort = Number.isFinite(requestedPort) ? requestedPort : 3042;
    const port = Number.isFinite(requestedPort) ? requestedPort : await findAvailablePort(startPort);

    console.log(`[INFO] Target port: ${port} (Selected starting from ${startPort})`);

    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = mode === 'prod'
        ? ['next', 'start', '-H', '127.0.0.1', '-p', port.toString()]
        : ['next', 'dev', '-H', '127.0.0.1', '-p', port.toString()];

    console.log(`[INFO] Starting Next.js in ${mode} mode...`);
    
    // Windows blocks spawning .cmd files without a shell (Node CVE-2024-27980 fix),
    // so a shell is required there; elsewhere skip it to avoid DEP0190.
    const child = spawn(cmd, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });

    let hasExited = false;
    child.on('exit', (code) => {
        hasExited = true;
        if (code !== 0 && code !== null) {
            console.error(`[ERROR] Next.js process exited with code ${code}`);
            process.exit(code);
        }
    });

    // Poll the port to see when the server is ready
    const timeoutMs = 60000;
    const startTime = Date.now();
    let serverReady = false;

    while (Date.now() - startTime < timeoutMs) {
        if (hasExited) {
            break;
        }
        // If the port is no longer free, the server is listening
        const isFree = await checkPort(port);
        if (!isFree) {
            serverReady = true;
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (serverReady) {
        const url = `http://localhost:${port}`;
        console.log(`\n[INFO] Server is ready on ${url}!`);
        
        const shouldOpenBrowser = process.env.CI !== 'true' && process.env.OPEN_BROWSER !== 'false';
        if (shouldOpenBrowser) {
            console.log(`[INFO] Opening ${url} in default browser...`);
            let openCmd;
            if (process.platform === 'darwin') {
                openCmd = `open "${url}"`;
            } else if (process.platform === 'win32') {
                openCmd = `start "" "${url}"`;
            } else {
                openCmd = `xdg-open "${url}"`;
            }

            exec(openCmd, (err) => {
                if (err) {
                    console.error(`[ERROR] Failed to open browser automatically:`, err);
                }
            });
        }
    } else if (!hasExited) {
        console.log(`[WARNING] Next.js server did not start responding within 60 seconds.`);
    }
}

main().catch((err) => {
    console.error('[ERROR] Startup script failed:', err);
    process.exit(1);
});
