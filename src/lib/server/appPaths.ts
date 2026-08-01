import path from 'node:path';

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
        path.join(getProjectRoot(), 'data'),
    );
}

export function getAssetsDir() {
    return resolveConfiguredPath(
        'IMAGE_EXPRESS_ASSETS_DIR',
        path.join(getProjectRoot(), 'public', 'assets'),
    );
}

export function getLogsDir() {
    return resolveConfiguredPath(
        'IMAGE_EXPRESS_LOGS_DIR',
        path.join(getProjectRoot(), 'logs'),
    );
}

export function getBundledPublicDir() {
    return resolveConfiguredPath(
        'IMAGE_EXPRESS_BUNDLED_PUBLIC_DIR',
        path.join(getProjectRoot(), 'public'),
    );
}

export function getDesignsDir() {
    return path.join(getAssetsDir(), 'designs');
}

export function getTemplatesDir() {
    return path.join(getAssetsDir(), 'templates');
}

export function getVaultDir() {
    return path.join(getDataDir(), 'vault');
}
