export type DependencyVersionStrategy = 'wanted' | 'latest';

export type DependencyOutdatedPackage = {
    name: string;
    section: 'dependencies' | 'devDependencies' | 'unknown';
    range: string;
    current: string;
    wanted: string;
    latest: string;
    target: string;
};

export type DependencyRuntimeStatus = {
    enabled: boolean;
    reason?: string;
    checkedAt: string;
    projectName: string;
    projectVersion: string;
    packageManager: 'npm';
    packageLockPresent: boolean;
    outdated: DependencyOutdatedPackage[];
    summary: {
        outdatedCount: number;
        dependencyCount: number;
        devDependencyCount: number;
    };
};

export async function fetchDependencyRuntimeStatus(): Promise<DependencyRuntimeStatus> {
    const response = await fetch('/api/runtime/dependencies/status', {
        cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(
            typeof data?.message === 'string' && data.message.trim()
                ? data.message
                : 'Failed to load dependency maintenance status.',
        );
    }
    return data as DependencyRuntimeStatus;
}