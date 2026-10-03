import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { collectReleaseArtifacts } from './collect-release-artifacts.mjs';

test('collecting native Mac artifacts preserves both update ZIPs and rejects missing architectures', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-merge-'));
    try {
        const source = path.join(root, 'input');
        for (const arch of ['arm64', 'x64']) {
            const dir = path.join(source, arch);
            await fs.mkdir(dir, { recursive: true });
            const url = `ImageExpress-0.2.2-${arch}.zip`;
            await fs.writeFile(path.join(dir, url), arch);
            await fs.writeFile(path.join(dir, 'latest-mac.yml'), yaml.dump({ version: '0.2.2', files: [{ url, sha512: arch }] }));
        }
        const output = path.join(root, 'output');
        await collectReleaseArtifacts(source, output);
        const result = yaml.load(await fs.readFile(path.join(output, 'latest-mac.yml'), 'utf8'));
        assert.equal(result.files.length, 2);
        assert.deepEqual(result.files.map((file) => file.sha512).sort(), ['arm64', 'x64']);
        await fs.rm(path.join(source, 'x64'), { recursive: true });
        await assert.rejects(collectReleaseArtifacts(source, path.join(root, 'missing')), /Missing Mac x64/);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
