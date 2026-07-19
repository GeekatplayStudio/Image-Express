import net from 'net';
import fs from 'fs';
import { spawn, spawnSync, exec } from 'child_process';

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
    const mode = process.argv[2] === 'prod' ? 'prod' : 'dev';
    
    // Auto-build in production mode if build files are missing
    if (mode === 'prod' && !fs.existsSync('.next')) {
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

    // Honor an explicit `-p <port>` argument (e.g. `npm run dev -- -p 3457`);
    // otherwise pick the first free port from 3000 upward.
    const portFlagIndex = process.argv.indexOf('-p');
    const requestedPort = portFlagIndex >= 0 ? Number.parseInt(process.argv[portFlagIndex + 1], 10) : NaN;
    const startPort = Number.isFinite(requestedPort) ? requestedPort : 3000;
    const port = Number.isFinite(requestedPort) ? requestedPort : await findAvailablePort(startPort);

    console.log(`[INFO] Target port: ${port} (Selected starting from ${startPort})`);

    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = mode === 'prod' 
        ? ['next', 'start', '-p', port.toString()] 
        : ['next', 'dev', '-p', port.toString()];

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
