import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    DEFAULT_TRUSTED_HOSTS,
    InstallerTrustError,
    assertSafeGitRef,
    assertTrustedSourceUrl,
    auditInstallerConfig,
    describeUnpinnedSources,
    enforceCommitPin,
    normalizeCommitPin,
    normalizeSha256Pin,
    resolveInsideDirectory,
    resolveTrustedHosts,
    sha256OfFile,
    verifyFileSha256,
} from './installers/trust-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const trustError = { name: 'InstallerTrustError' };

test('the shipped installer config passes the policy', async () => {
    const config = JSON.parse(await readFile(path.join(here, 'installers', 'config', 'sources.json'), 'utf8'));
    assert.deepEqual(auditInstallerConfig(config), []);
    // Guards the guard: an empty config would pass by having nothing to check.
    assert.ok(config.comfyModels.length > 0);
    assert.ok(config.customBundles.length > 0);
});

test('only https sources on a trusted host are accepted', () => {
    assert.equal(
        assertTrustedSourceUrl('https://github.com/comfyanonymous/ComfyUI.git'),
        'https://github.com/comfyanonymous/ComfyUI.git',
    );
    assert.ok(assertTrustedSourceUrl('https://cdn-lfs.huggingface.co/some/file.safetensors'));

    for (const bad of [
        'http://github.com/a/b.git',
        'git://github.com/a/b.git',
        'ssh://git@github.com/a/b.git',
        'file:///etc/passwd',
        'ext::sh -c touch% /tmp/pwned',
        '--upload-pack=touch /tmp/pwned',
        'https://user:token@github.com/a/b.git',
        'https://evil.example/a/b.git',
        // A trusted name as a prefix or a path is not a trusted host.
        'https://github.com.evil.example/a/b.git',
        'https://evil.example/github.com/a.git',
        'not a url',
        '',
    ]) {
        assert.throws(() => assertTrustedSourceUrl(bad), trustError, `should refuse ${bad}`);
    }
});

test('the config can extend the allowlist, and only by exact host or subdomain', () => {
    const hosts = resolveTrustedHosts({ trustedHosts: ['Models.Example.org', '  '] });
    assert.deepEqual(hosts, [...DEFAULT_TRUSTED_HOSTS, 'models.example.org']);
    assert.ok(assertTrustedSourceUrl('https://models.example.org/x.bin', hosts));
    assert.throws(() => assertTrustedSourceUrl('https://example.org/x.bin', hosts), trustError);
});

test('git refs that could be read as options or ranges are refused', () => {
    for (const ok of ['master', 'main', 'release/1.2', 'v0.3.10']) assert.equal(assertSafeGitRef(ok), ok);
    for (const bad of ['--upload-pack=x', '-b', 'a..b', 'main; rm -rf /', 'has space', '', undefined]) {
        assert.throws(() => assertSafeGitRef(bad), trustError, `should refuse ${bad}`);
    }
});

test('pins must be full-length, and an absent pin is not an error', () => {
    const commit = 'A'.repeat(40);
    assert.equal(normalizeCommitPin(commit), 'a'.repeat(40));
    assert.equal(normalizeCommitPin(undefined), null);
    assert.equal(normalizeCommitPin(''), null);
    assert.throws(() => normalizeCommitPin('abc1234'), trustError);

    assert.equal(normalizeSha256Pin('F'.repeat(64)), 'f'.repeat(64));
    assert.equal(normalizeSha256Pin(null), null);
    assert.throws(() => normalizeSha256Pin('f'.repeat(63)), trustError);
});

test('an install target cannot leave its directory', () => {
    const base = path.resolve('/opt/comfy');
    assert.equal(
        resolveInsideDirectory(base, 'models/checkpoints/a.safetensors'),
        path.join(base, 'models', 'checkpoints', 'a.safetensors'),
    );
    for (const bad of ['../outside.bin', 'models/../../outside.bin', path.resolve('/etc/passwd'), '', '.']) {
        assert.throws(() => resolveInsideDirectory(base, bad), trustError, `should refuse ${bad}`);
    }
});

test('a checksum pin is verified against the file on disk', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'iex-trust-'));
    try {
        const file = path.join(dir, 'model.bin');
        await writeFile(file, 'hello');
        const real = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
        assert.equal(await sha256OfFile(file), real);
        assert.deepEqual(await verifyFileSha256(file, real), { verified: true });
        assert.deepEqual(await verifyFileSha256(file, real.toUpperCase()), { verified: true });
        // No pin: nothing claimed, nothing verified.
        assert.deepEqual(await verifyFileSha256(file, undefined), { verified: false });
        await assert.rejects(verifyFileSha256(file, '0'.repeat(64)), /Checksum mismatch/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('a commit pin is checked out and then confirmed', async () => {
    const pin = 'b'.repeat(40);
    const calls = [];
    const runGit = async (args) => {
        calls.push(args.join(' '));
        return args.includes('rev-parse') ? `${pin}\n` : '';
    };
    assert.deepEqual(await enforceCommitPin({ directory: '/x', commit: pin, runGit }), { pinned: true });
    assert.deepEqual(calls, [`-C /x checkout --detach ${pin}`, '-C /x rev-parse HEAD']);

    // No pin: git is not touched.
    calls.length = 0;
    assert.deepEqual(await enforceCommitPin({ directory: '/x', commit: undefined, runGit }), { pinned: false });
    assert.deepEqual(calls, []);
});

test('a checkout that ends up somewhere else is refused', async () => {
    const runGit = async (args) => (args.includes('rev-parse') ? 'c'.repeat(40) : '');
    await assert.rejects(
        enforceCommitPin({ directory: '/x', commit: 'b'.repeat(40), runGit }),
        (error) => error instanceof InstallerTrustError && /not the pinned/.test(error.message),
    );
});

test('the audit names every problem rather than stopping at the first', () => {
    const problems = auditInstallerConfig({
        comfyUi: { repo: 'http://github.com/a/b.git', branch: '--evil', commit: 'short' },
        customBundles: [{ name: 'nodes', repo: 'https://evil.example/n.git', branch: 'main' }],
        comfyModels: [
            { id: 'm1', downloadUrl: 'https://huggingface.co/a/b.safetensors', targetPath: '../../escape.bin' },
            { id: 'm2', downloadUrl: 'https://huggingface.co/a/c.safetensors', targetPath: 'models/c.bin', sha256: 'nope' },
        ],
    });
    assert.equal(problems.length, 6);
    assert.ok(problems.some((line) => line.startsWith('repo comfyUi') && /https/.test(line)));
    assert.ok(problems.some((line) => line.startsWith('repo nodes') && /not trusted/.test(line)));
    assert.ok(problems.some((line) => line.startsWith('model m1') && /outside/.test(line)));
    assert.ok(problems.some((line) => line.startsWith('model m2') && /sha256/.test(line)));
});

test('unpinned sources are reported, pinned ones are not', () => {
    assert.deepEqual(describeUnpinnedSources({
        comfyUi: { repo: 'https://github.com/a/b.git', commit: 'a'.repeat(40) },
        customBundles: [{ name: 'nodes', repo: 'https://github.com/a/n.git' }],
        comfyModels: [
            { id: 'pinned', sha256: 'f'.repeat(64) },
            { id: 'floating' },
        ],
    }), ['repo nodes', 'model floating']);
});
