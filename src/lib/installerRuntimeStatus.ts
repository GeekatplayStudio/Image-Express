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
    category?: string;
    recommendedFor?: string[];
    source?: 'config' | 'workflow';
};

export type RuntimeLocalWorkspaceStatus = {
    path: string;
    exists: boolean;
    installTargetPath: string;
    workflowFileCount: number;
    syncedDirectories: string[];
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
    localWorkspace: RuntimeLocalWorkspaceStatus;
    ollama: {
        cliAvailable: boolean;
        configuredModels: Array<{ id: string; displayName: string }>;
    };
    summary: {
        ready: boolean;
        missing: string[];
    };
};

export async function fetchInstallerRuntimeStatus(comfyDir?: string): Promise<InstallerRuntimeStatus> {
    const query = typeof comfyDir === 'string' && comfyDir.trim().length > 0
        ? `?comfyDir=${encodeURIComponent(comfyDir.trim())}`
        : '';
    const response = await fetch(`/api/runtime/installer/status${query}`, {
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
