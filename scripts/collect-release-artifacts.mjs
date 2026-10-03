// Native Mac jobs produce separate updater manifests. Merge their file lists
// instead of letting download-artifact silently overwrite one architecture.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export async function collectReleaseArtifacts(source, destination) {
    await fs.mkdir(destination, { recursive: true });
    const names = new Set();
    let mac;
    for (const directory of await fs.readdir(source, { withFileTypes: true })) {
        if (!directory.isDirectory()) continue;
        for (const name of await fs.readdir(path.join(source, directory.name))) {
            const file = path.join(source, directory.name, name);
            if (name === 'latest-mac.yml') {
                const metadata = yaml.load(await fs.readFile(file, 'utf8'));
                if (mac && metadata.version !== mac.version) throw new Error('Mac release versions differ.');
                if (!metadata.files?.length) throw new Error('Mac updater file list is empty.');
                mac = mac ? { ...mac, files: [...mac.files, ...metadata.files] } : metadata;
            } else {
                if (names.has(name)) throw new Error(`Duplicate release artifact: ${name}`);
                names.add(name);
                await fs.copyFile(file, path.join(destination, name));
            }
        }
    }
    if (mac) {
        for (const arch of ['arm64', 'x64']) {
            if (!mac.files.some((file) => file.url.endsWith(`-${arch}.zip`))) {
                throw new Error(`Missing Mac ${arch} updater ZIP.`);
            }
        }
        await fs.writeFile(path.join(destination, 'latest-mac.yml'), yaml.dump(mac));
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await collectReleaseArtifacts(path.resolve('release-downloads'), path.resolve('release-artifacts'));
}
