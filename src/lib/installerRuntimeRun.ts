export type InstallerRunPayload = {
    installComfy: boolean;
    installCustomBundles: boolean;
    installComfyModels: boolean;
    comfyModelIds: string[];
    installOllamaModels: boolean;
    ollamaModelIds: string[];
    runQa: boolean;
    autoFix: boolean;
    dryRun: boolean;
    force: boolean;
    skipTests: boolean;
    continueOnError: boolean;
    comfyDir?: string;
};

export type InstallerRunStepResult = {
    id: string;
    label: string;
    command: string;
    args: string[];
    exitCode: number;
    success: boolean;
    durationMs: number;
    stdout: string;
    stderr: string;
};

export type InstallerRunResult = {
    success: boolean;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    continueOnError: boolean;
    dryRun: boolean;
    steps: InstallerRunStepResult[];
    summary: {
        completedSteps: number;
        failedSteps: number;
    };
};

export async function runInstallerRuntime(payload: InstallerRunPayload): Promise<InstallerRunResult> {
    const authorizationHeaders = await getLocalRuntimeAuthorizationHeaders();
    const response = await fetch('/api/runtime/installer/run', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...authorizationHeaders,
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(
            typeof data?.message === 'string' && data.message.trim()
                ? data.message
                : 'Failed to run installer workflow.',
        );
    }
    return data as InstallerRunResult;
}
import { getLocalRuntimeAuthorizationHeaders } from '@/lib/localRuntimeAuthorization';
