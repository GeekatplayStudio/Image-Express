// What the one-click installers are allowed to fetch, and how a download is
// checked before it is trusted.
//
// The installers clone repositories and download multi-gigabyte model files
// from addresses in `config/sources.json` — and, for models, from addresses
// found inside workflow catalogs the user has added. Before this file existed
// those addresses went straight to `git clone` and `fetch`, and model files
// were written wherever their `targetPath` said. Three things are enforced:
//
//   1. Where from: https only, no embedded credentials, host on an allowlist.
//   2. What exactly: an optional `commit` pins a repository and an optional
//      `sha256` pins a file. A pin that is present is always verified.
//   3. Where to: a target path may not leave the directory it is installed in.
//
// Pins are optional because upstream moves: ComfyUI ships from `master`, and a
// stale pin would install an old build. The policy makes pinning *possible and
// enforced*, and `describeUnpinnedSources` reports what is still floating.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';

export const DEFAULT_TRUSTED_HOSTS = Object.freeze(['github.com', 'huggingface.co']);

export class InstallerTrustError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InstallerTrustError';
    }
}

/** The allowlist: the defaults plus any `trustedHosts` the config adds. */
export function resolveTrustedHosts(config) {
    const extra = Array.isArray(config?.trustedHosts) ? config.trustedHosts : [];
    return [...new Set([...DEFAULT_TRUSTED_HOSTS, ...extra]
        .map((host) => String(host).trim().toLowerCase())
        .filter(Boolean))];
}

const hostMatches = (hostname, trusted) => hostname === trusted || hostname.endsWith(`.${trusted}`);

/**
 * Refuse an address the installer should not fetch from.
 *
 * `https:` only also closes git's own escape hatches: a "URL" beginning with
 * `-` is parsed by git as an option, and `ext::` / `file:` transports run
 * commands or read local paths.
 */
export function assertTrustedSourceUrl(rawUrl, trustedHosts = DEFAULT_TRUSTED_HOSTS) {
    let url;
    try {
        url = new URL(String(rawUrl));
    } catch {
        throw new InstallerTrustError('Installer source is not a valid URL.');
    }
    if (url.protocol !== 'https:') {
        throw new InstallerTrustError('Installer sources must use https.');
    }
    if (url.username || url.password) {
        throw new InstallerTrustError('Installer sources must not embed credentials.');
    }
    const hostname = url.hostname.toLowerCase();
    if (!trustedHosts.some((trusted) => hostMatches(hostname, trusted))) {
        throw new InstallerTrustError(
            `Installer source host "${hostname}" is not trusted. Add it to "trustedHosts" in the installer config to allow it.`,
        );
    }
    return url.toString();
}

/** A branch or tag name that git cannot mistake for an option or a revision range. */
export function assertSafeGitRef(ref) {
    const value = String(ref ?? '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(value) || value.includes('..')) {
        throw new InstallerTrustError(`Unsafe git ref "${value}".`);
    }
    return value;
}

/** A full commit id. Abbreviated ids are refused: they can become ambiguous. */
export function normalizeCommitPin(commit) {
    if (commit === undefined || commit === null || commit === '') return null;
    const value = String(commit).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(value)) {
        throw new InstallerTrustError('A commit pin must be a full 40-character commit id.');
    }
    return value;
}

export function normalizeSha256Pin(sha256) {
    if (sha256 === undefined || sha256 === null || sha256 === '') return null;
    const value = String(sha256).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(value)) {
        throw new InstallerTrustError('A sha256 pin must be 64 hexadecimal characters.');
    }
    return value;
}

/** Resolve `relativePath` under `baseDir`, refusing anything that escapes it. */
export function resolveInsideDirectory(baseDir, relativePath) {
    const base = path.resolve(baseDir);
    const target = path.resolve(base, String(relativePath ?? ''));
    const relative = path.relative(base, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new InstallerTrustError(`Install target "${relativePath}" is outside its install directory.`);
    }
    return target;
}

export async function sha256OfFile(filePath) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
    return hash.digest('hex');
}

/** Throws when `filePath` does not match its pin. No pin means nothing to check. */
export async function verifyFileSha256(filePath, expected) {
    const pin = normalizeSha256Pin(expected);
    if (!pin) return { verified: false };
    const actual = await sha256OfFile(filePath);
    if (actual !== pin) {
        throw new InstallerTrustError(
            `Checksum mismatch for ${path.basename(filePath)}: expected ${pin}, got ${actual}.`,
        );
    }
    return { verified: true };
}

/**
 * After a clone or pull, move to the pinned commit and confirm that is where
 * the checkout ended up. `runGit` is injected so this is testable without git.
 */
export async function enforceCommitPin({ directory, commit, runGit }) {
    const pin = normalizeCommitPin(commit);
    if (!pin) return { pinned: false };
    await runGit(['-C', directory, 'checkout', '--detach', pin]);
    const head = String(await runGit(['-C', directory, 'rev-parse', 'HEAD'])).trim().toLowerCase();
    if (head !== pin) {
        throw new InstallerTrustError(`Repository is at ${head || 'an unknown commit'}, not the pinned ${pin}.`);
    }
    return { pinned: true };
}

/** Check every source in the installer config. Returns the problems found. */
export function auditInstallerConfig(config) {
    const trustedHosts = resolveTrustedHosts(config);
    const problems = [];
    const check = (label, fn) => {
        try {
            fn();
        } catch (error) {
            problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const repos = [
        ...(config?.comfyUi ? [{ name: 'comfyUi', ...config.comfyUi }] : []),
        ...(Array.isArray(config?.customBundles) ? config.customBundles : []),
    ];
    for (const repo of repos) {
        const label = `repo ${repo.name ?? '(unnamed)'}`;
        check(label, () => assertTrustedSourceUrl(repo.repo, trustedHosts));
        if (repo.branch !== undefined) check(label, () => assertSafeGitRef(repo.branch));
        check(label, () => normalizeCommitPin(repo.commit));
    }

    for (const model of Array.isArray(config?.comfyModels) ? config.comfyModels : []) {
        const label = `model ${model.id ?? '(missing id)'}`;
        check(label, () => assertTrustedSourceUrl(model.downloadUrl, trustedHosts));
        check(label, () => normalizeSha256Pin(model.sha256));
        check(label, () => resolveInsideDirectory('/install-root', model.targetPath));
    }
    return problems;
}

/** Sources that would install whatever upstream currently serves. */
export function describeUnpinnedSources(config) {
    const repos = [
        ...(config?.comfyUi ? [{ name: 'comfyUi', ...config.comfyUi }] : []),
        ...(Array.isArray(config?.customBundles) ? config.customBundles : []),
    ].filter((repo) => !repo.commit).map((repo) => `repo ${repo.name}`);
    const models = (Array.isArray(config?.comfyModels) ? config.comfyModels : [])
        .filter((model) => !model.sha256)
        .map((model) => `model ${model.id}`);
    return [...repos, ...models];
}
