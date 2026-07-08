export type AppVersionInfo = {
    baseVersion: string;
    subversion: string;
    version: string;
    commit: string;
    dirty: 'clean' | 'dirty';
    buildTime: string;
};

const read = (value: string | undefined, fallback: string) => {
    if (!value) return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
};

export const APP_VERSION_INFO: AppVersionInfo = {
    baseVersion: read(process.env.NEXT_PUBLIC_APP_BASE_VERSION, '0.0.0'),
    subversion: read(process.env.NEXT_PUBLIC_APP_SUBVERSION, '0'),
    version: read(process.env.NEXT_PUBLIC_APP_VERSION, '0.0.0.0'),
    commit: read(process.env.NEXT_PUBLIC_APP_COMMIT, 'nogit'),
    dirty: read(process.env.NEXT_PUBLIC_APP_DIRTY, 'clean') === 'dirty' ? 'dirty' : 'clean',
    buildTime: read(process.env.NEXT_PUBLIC_APP_BUILD_TIME, ''),
};

export function formatHubVersionLabel(info: AppVersionInfo = APP_VERSION_INFO) {
    const status = info.dirty === 'dirty' ? 'dirty' : 'clean';
    return `Version ${info.version} (subversion ${info.subversion}) · commit ${info.commit} · ${status}`;
}
