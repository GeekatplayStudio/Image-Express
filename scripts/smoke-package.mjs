#!/usr/bin/env node

import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const distDirectory = path.join(root, 'dist');
const timeoutMs = 60_000;

function listDirectories(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(directory, entry.name));
}

function findMacExecutable() {
    for (const directory of listDirectories(distDirectory)) {
        if (!path.basename(directory).startsWith('mac')) continue;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (!entry.isDirectory() || !entry.name.endsWith('.app')) continue;
            const macOsDirectory = path.join(directory, entry.name, 'Contents', 'MacOS');
            const executable = fs.existsSync(macOsDirectory)
                ? fs.readdirSync(macOsDirectory).map((name) => path.join(macOsDirectory, name))
                    .find((candidate) => fs.statSync(candidate).isFile())
                : undefined;
            if (executable) return executable;
        }
    }
    return undefined;
}

function findWindowsExecutable() {
    for (const directory of listDirectories(distDirectory)) {
        if (!path.basename(directory).includes('win') || !path.basename(directory).includes('unpacked')) {
            continue;
        }
        const executable = fs.readdirSync(directory)
            .filter((name) => name.endsWith('.exe') && !/^uninstall/i.test(name))
            .map((name) => path.join(directory, name))
            .find((candidate) => fs.statSync(candidate).isFile());
        if (executable) return executable;
    }
    return undefined;
}

function findLinuxExecutable() {
    for (const directory of listDirectories(distDirectory)) {
        if (!path.basename(directory).includes('linux') || !path.basename(directory).includes('unpacked')) {
            continue;
        }
        const executable = fs.readdirSync(directory)
            .map((name) => path.join(directory, name))
            .find((candidate) => {
                const stats = fs.statSync(candidate);
                const name = path.basename(candidate);
                return stats.isFile()
                    && (stats.mode & 0o111) !== 0
                    && name !== 'chrome-sandbox'
                    && !name.includes('.');
            });
        if (executable) return executable;
    }
    return undefined;
}

const executable = process.platform === 'darwin'
    ? findMacExecutable()
    : process.platform === 'win32'
        ? findWindowsExecutable()
        : findLinuxExecutable();

if (!executable) {
    throw new Error(`No unpacked ${process.platform} desktop executable was found under dist/.`);
}

const smokeRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'image-express-smoke-'));
const userDataDirectory = path.join(smokeRoot, 'user-data');
await fsPromises.mkdir(userDataDirectory, { recursive: true });

let output = '';
let succeeded = false;
const child = spawn(executable, [], {
    cwd: path.dirname(executable),
    env: {
        ...process.env,
        IMAGE_EXPRESS_DESKTOP_SMOKE: '1',
        IMAGE_EXPRESS_SMOKE_USER_DATA_DIR: userDataDirectory,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
});

for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
        output = `${output}${chunk.toString()}`.slice(-16_000);
    });
}

let exitResult;
let launchError;
const exit = new Promise((resolve, reject) => {
    child.once('error', (error) => {
        launchError = error;
        reject(error);
    });
    child.once('exit', (code, signal) => {
        exitResult = { code, signal };
        resolve(exitResult);
    });
});

async function readSmokeRecords() {
    const logPath = path.join(userDataDirectory, 'logs', 'desktop.jsonl');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (launchError) throw launchError;
        if (exitResult) {
            throw new Error(
                `Packaged application exited before ready with code ${exitResult.code} `
                + `and signal ${exitResult.signal ?? 'none'}.`,
            );
        }
        try {
            const log = await fsPromises.readFile(logPath, 'utf8');
            const records = log.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
            if (records.some((record) => record.event === 'smoke.ready')) return records;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Packaged application did not become ready within ${timeoutMs} ms.`);
}

async function terminateProcessTree() {
    if (exitResult || !child.pid) return;
    if (process.platform === 'win32') {
        await new Promise((resolve) => {
            const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
                stdio: 'ignore',
                windowsHide: true,
            });
            killer.once('exit', resolve);
            killer.once('error', resolve);
        });
    } else {
        try {
            process.kill(-child.pid, 'SIGTERM');
        } catch {
            // The process may have exited between the readiness check and cleanup.
        }
    }
    await Promise.race([
        exit,
        new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (!exitResult && process.platform !== 'win32') {
        try {
            process.kill(-child.pid, 'SIGKILL');
        } catch {
            // Already gone.
        }
        await exit;
    }
}

try {
    const records = await readSmokeRecords();
    const phases = new Set(records
        .filter((record) => record.event === 'startup.phase')
        .map((record) => record.details?.phase));
    const startupError = records.find((record) => record.event === 'startup.error');
    const smokeReady = records.find((record) => record.event === 'smoke.ready');

    if (!phases.has('electron-ready') || !phases.has('server-ready') || !phases.has('window-ready')) {
        throw new Error(`Missing startup phases. Observed: ${[...phases].join(', ') || 'none'}.`);
    }
    if (startupError) {
        throw new Error(`Packaged application logged startup.error: ${JSON.stringify(startupError.details)}`);
    }
    if (!smokeReady) {
        throw new Error('Packaged renderer never reached the smoke-ready checkpoint.');
    }

    await terminateProcessTree();
    succeeded = true;
    console.log(JSON.stringify({
        status: 'passed',
        executable: path.relative(root, executable),
        startupPhases: [...phases],
    }, null, 2));
} catch (error) {
    await terminateProcessTree();
    if (output.trim()) console.error(output.trim());
    console.error(`Smoke diagnostics retained at ${smokeRoot}`);
    throw error;
} finally {
    if (succeeded) {
        await fsPromises.rm(smokeRoot, { recursive: true, force: true });
    }
}
