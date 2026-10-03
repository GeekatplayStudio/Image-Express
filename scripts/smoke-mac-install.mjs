// Run on each native Mac architecture. Copy from the actual read-only DMG,
// eject it, then launch twice without Node/Homebrew on the app's PATH.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

if (process.platform !== 'darwin') throw new Error('This installation test requires macOS.');
const signed = process.argv.includes('--signed');
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
const dmg = path.resolve('dist', `ImageExpress-${version}-${process.arch}.dmg`);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'Image Express install test '));
const mount = path.join(root, 'Downloaded disk');
const app = path.join(root, 'Applications', 'Image Express.app');
const smokeRoot = path.join(root, 'Fresh user');
let mounted = false;
let passed = false;
const run = (command, args, options = {}) => execFileSync(command, args, {
    stdio: 'inherit', timeout: 120_000, ...options,
});

try {
    await fs.mkdir(mount);
    run('/usr/bin/hdiutil', ['verify', dmg]);
    run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
    mounted = true;
    assert.equal(await fs.readlink(path.join(mount, 'Applications')), '/Applications');
    await fs.access(path.join(mount, 'Start Here.txt'));
    await fs.mkdir(path.dirname(app));
    run('/usr/bin/ditto', [path.join(mount, 'Image Express.app'), app]);
    run('/usr/bin/hdiutil', ['detach', mount]);
    mounted = false;

    const executable = path.join(app, 'Contents', 'MacOS', 'Image Express');
    const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    run('/usr/bin/lipo', ['-verify_arch', architecture, executable]);
    if (signed) {
        run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
        run('/usr/bin/xcrun', ['stapler', 'validate', app]);
        // Apply the download attribute rather than removing it: release tests
        // must assess a downloaded app, not only a locally built copy.
        run('/usr/bin/xattr', ['-w', 'com.apple.quarantine', '0083;00000000;ImageExpressReleaseTest;', app]);
        run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
    }
    run('/bin/chmod', ['-R', 'a-w', app]);
    const env = {
        ...process.env,
        IMAGE_EXPRESS_SMOKE_EXECUTABLE: executable,
        IMAGE_EXPRESS_SMOKE_ROOT: smokeRoot,
    };
    run(process.execPath, ['scripts/smoke-package.mjs'], { env });
    const data = path.join(smokeRoot, 'user-data', 'data');
    await fs.access(data);
    const sentinel = path.join(data, 'installation-test.txt');
    await fs.writeFile(sentinel, 'Saved work survives relaunch.');
    run(process.execPath, ['scripts/smoke-package.mjs'], { env });
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'Saved work survives relaunch.');
    passed = true;
    console.log(`Mac installation passed: ${process.arch}; DMG copy/eject; read-only app; first launch/relaunch; signing=${signed}.`);
} finally {
    if (mounted) run('/usr/bin/hdiutil', ['detach', mount]);
    if (passed) {
        run('/bin/chmod', ['-R', 'u+w', root]);
        await fs.rm(root, { recursive: true, force: true });
    } else {
        console.error(`Installation test diagnostics retained at ${root}`);
    }
}
