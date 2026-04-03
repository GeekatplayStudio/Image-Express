export type RuntimeBundleStatus = {
    name: string;
    bundleType: string;
    targetPath: string;
    exists: boolean;
};

export type RuntimeModelStatus = {
    id: string;
    displayName: string;
    targetPath: string;
    exists: boolean;
};

export type InstallerRuntimeStatus = {
    configFile: string;
    comfyDirectory: {
        path: string;
        exists: boolean;
        gitRepo: boolean;
    };
    customBundles: RuntimeBundleStatus[];
    comfyModels: RuntimeModelStatus[];
    ollama: {
        cliAvailable: boolean;
        configuredModels: Array<{ id: string; displayName: string }>;
    };
    summary: {
        ready: boolean;
        missing: string[];
    };
};

export async function fetchInstallerRuntimeStatus(): Promise<InstallerRuntimeStatus> {
    const response = await fetch('/api/runtime/installer/status', {
        cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(
            typeof data?.message === 'string' && data.message.trim()
                ? data.message
                : 'Failed to load installer runtime status.',
        );
    }
    return data as InstallerRuntimeStatus;
}
