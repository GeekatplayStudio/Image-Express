import type { DependencyOutdatedPackage, DependencyVersionStrategy } from '@/lib/dependencyRuntimeStatus';

export type DependencyRunPayload = {
    strategy: DependencyVersionStrategy;
    runBuild: boolean;
};

export type DependencyRunStepResult = {
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

export type DependencyRunResult = {
    success: boolean;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    strategy: DependencyVersionStrategy;
    runBuild: boolean;
    updatedPackages: DependencyOutdatedPackage[];
    steps: DependencyRunStepResult[];
    summary: {
        outdatedCount: number;
        updatedCount: number;
        failedSteps: number;
    };
};

export async function runDependencyRuntime(payload: DependencyRunPayload): Promise<DependencyRunResult> {
    const response = await fetch('/api/runtime/dependencies/run', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(
            typeof data?.message === 'string' && data.message.trim()
                ? data.message
                : 'Failed to run dependency maintenance.',
        );
    }
    return data as DependencyRunResult;
}