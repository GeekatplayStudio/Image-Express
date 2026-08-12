import path from 'node:path';

/**
 * Join a path that only exists at runtime.
 *
 * Every directory in this module is resolved from `process.cwd()` or an env var,
 * so the bundler cannot know it statically. Left unmarked, Turbopack treats the
 * dynamic base as a glob and traces the entire project — a whole-drive vault put
 * 269k files into the NFT list. `turbopackIgnore` tells it to leave these alone;
 * nothing under these directories is ever bundled, only read at runtime.
 */
export function joinRuntimePath(...segments: string[]) {
    return path.join(/*turbopackIgnore: true*/ ...segments);
}

function resolveConfiguredPath(envName: string, fallback: string) {
    const configured = process.env[envName]?.trim();
    return path.resolve(configured || fallback);
}

export function getProjectRoot() {
    return resolveConfiguredPath('IMAGE_EXPRESS_PROJECT_ROOT', process.cwd());
}

export function getDataDir() {
    return resolveConfiguredPath(
        'IMAGE_EXPRESS_DATA_DIR',
        joinRuntimePath(getProjectRoot(), 'data'),
    );
}

export function getAssetsDir() {
    return resolveConfiguredPath(
        'IMAGE_EXPRESS_ASSETS_DIR',
        joinRuntimePath(getProjectRoot(), 'public', 'assets'),
    );
}

export function getLogsDir() {
    return resolveConfiguredPath(
        'IMAGE_EXPRESS_LOGS_DIR',
        joinRuntimePath(getProjectRoot(), 'logs'),
    );
}

export function getBundledPublicDir() {
    return resolveConfiguredPath(
        'IMAGE_EXPRESS_BUNDLED_PUBLIC_DIR',
        joinRuntimePath(getProjectRoot(), 'public'),
    );
}

export function getDesignsDir() {
    return joinRuntimePath(getAssetsDir(), 'designs');
}

export function getTemplatesDir() {
    return joinRuntimePath(getAssetsDir(), 'templates');
}

export function getVaultDir() {
    return joinRuntimePath(getDataDir(), 'vault');
}
