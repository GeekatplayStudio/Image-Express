import path from 'node:path';
import { spawn } from 'node:child_process';
import { readInstallerConfig, type InstallerConfig } from '@/lib/server/comfyInstallerCatalog';

export type InstallerRunPayload = {
    installComfy?: boolean;
    installCustomBundles?: boolean;
    installComfyModels?: boolean;
    comfyModelIds?: string[];
    installOllamaModels?: boolean;
    ollamaModelIds?: string[];
    runQa?: boolean;
    autoFix?: boolean;
    dryRun?: boolean;
    force?: boolean;
    skipTests?: boolean;
    continueOnError?: boolean;
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

const MAX_LOG_BYTES = 150_000;
class InstallerRunValidationError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = 'InstallerRunValidationError';
        this.statusCode = statusCode;
    }
}

function coerceBoolean(value: unknown, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
}

function coerceStringList(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function sanitizeComfyDir(value: unknown) {
    if (typeof value !== 'string') {
        return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    if (trimmed.includes('\u0000')) {
        throw new InstallerRunValidationError('Comfy directory override is invalid.');
    }
    return path.normalize(trimmed);
}

function appendLogChunk(current: string, chunk: string) {
    if (!chunk) {
        return current;
    }
    const combined = current + chunk;
    if (combined.length <= MAX_LOG_BYTES) {
        return combined;
    }
    return combined.slice(combined.length - MAX_LOG_BYTES);
}

function resolveRequestedModelIds(requested: string[], configured: string[], modelKind: 'Ollama') {
    if (requested.length === 0) {
        return configured;
    }

    const configuredSet = new Set(configured);
    const invalid = requested.filter((id) => !configuredSet.has(id));
    if (invalid.length > 0) {
        throw new InstallerRunValidationError(
            `${modelKind} model selection contains unknown id(s): ${invalid.join(', ')}`,
        );
    }

    return Array.from(new Set(requested));
}

type InstallerStepPlan = {
    id: string;
    label: string;
    scriptPath: string;
    args: string[];
};

function buildStepPlan(payload: InstallerRunPayload, config: InstallerConfig): InstallerStepPlan[] {
    const dryRun = coerceBoolean(payload.dryRun, false);
    const force = coerceBoolean(payload.force, false);
    const skipTests = coerceBoolean(payload.skipTests, false);
    const autoFix = coerceBoolean(payload.autoFix, false);
    const comfyDir = sanitizeComfyDir(payload.comfyDir);

    const sharedArgs: string[] = [];
    if (dryRun) {
        sharedArgs.push('--dry-run');
    }
    if (comfyDir) {
        sharedArgs.push(`--comfy-dir=${comfyDir}`);
    }

    const configuredOllamaModelIds = (Array.isArray(config.ollamaModels) ? config.ollamaModels : [])
        .map((model) => model?.id)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim());

    const selectedComfyModelIds = Array.from(new Set(coerceStringList(payload.comfyModelIds)));
    const selectedOllamaModelIds = resolveRequestedModelIds(
        coerceStringList(payload.ollamaModelIds),
        configuredOllamaModelIds,
        'Ollama',
    );

    const plan: InstallerStepPlan[] = [];
    if (coerceBoolean(payload.installComfy, false)) {
        plan.push({
            id: 'install-comfy',
            label: 'ComfyUI install/update',
            scriptPath: 'scripts/installers/comfy/install-comfy.mjs',
            args: [...sharedArgs],
        });
    }
    if (coerceBoolean(payload.installCustomBundles, false)) {
        plan.push({
            id: 'install-custom-bundles',
            label: 'Custom nodes/workflows install/update',
            scriptPath: 'scripts/installers/comfy/install-custom-bundles.mjs',
            args: [...sharedArgs],
        });
    }
    if (coerceBoolean(payload.installComfyModels, false)) {
        plan.push({
            id: 'install-comfy-models',
            label: 'Comfy model download',
            scriptPath: 'scripts/installers/models/install-comfy-models.mjs',
            args: [
                ...sharedArgs,
                ...(selectedComfyModelIds.length > 0 ? [`--models=${selectedComfyModelIds.join(',')}`] : []),
                ...(force ? ['--force'] : []),
            ],
        });
    }
    if (coerceBoolean(payload.installOllamaModels, false)) {
        plan.push({
            id: 'install-ollama-models',
            label: 'Ollama model download',
            scriptPath: 'scripts/installers/models/install-ollama-models.mjs',
            args: [
                ...sharedArgs,
                ...(selectedOllamaModelIds.length > 0 ? [`--models=${selectedOllamaModelIds.join(',')}`] : []),
            ],
        });
    }
    if (coerceBoolean(payload.runQa, false)) {
        plan.push({
            id: 'qa-installation',
            label: 'Post-install QA checks',
            scriptPath: 'scripts/qa-installation.mjs',
            args: [
                ...sharedArgs,
                ...(autoFix ? ['--auto-fix'] : []),
                ...(skipTests ? ['--skip-tests'] : []),
            ],
        });
    }

    if (plan.length === 0) {
        throw new InstallerRunValidationError('Select at least one installer or QA step.');
    }

    return plan;
}

async function runInstallerStep(step: InstallerStepPlan): Promise<InstallerRunStepResult> {
    const started = Date.now();
    // turbopackIgnore: the installer scripts are external tooling resolved at
    // runtime, not bundle dependencies — keep the file tracer out of them.
    const scriptAbsolutePath = path.join(/* turbopackIgnore: true */ process.cwd(), step.scriptPath);
    const args = [scriptAbsolutePath, ...step.args];

    let stdout = '';
    let stderr = '';

    const exitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        child.stdout.on('data', (chunk: Buffer | string) => {
            stdout = appendLogChunk(stdout, chunk.toString());
        });
        child.stderr.on('data', (chunk: Buffer | string) => {
            stderr = appendLogChunk(stderr, chunk.toString());
        });

        child.on('error', (error) => {
            reject(error);
        });

        child.on('close', (code) => {
            resolve(code ?? 1);
        });
    }).catch((error) => {
        stderr = appendLogChunk(stderr, `${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    });

    return {
        id: step.id,
        label: step.label,
        command: process.execPath,
        args: [step.scriptPath, ...step.args],
        exitCode,
        success: exitCode === 0,
        durationMs: Date.now() - started,
        stdout,
        stderr,
    };
}

export async function runInstallerWorkflow(rawPayload: unknown): Promise<InstallerRunResult> {
    if (!rawPayload || typeof rawPayload !== 'object') {
        throw new InstallerRunValidationError('Request payload must be an object.');
    }

    const payload = rawPayload as InstallerRunPayload;
    const continueOnError = coerceBoolean(payload.continueOnError, false);
    const dryRun = coerceBoolean(payload.dryRun, false);
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();

    const config = await readInstallerConfig();
    const plan = buildStepPlan(payload, config);

    const steps: InstallerRunStepResult[] = [];
    for (const step of plan) {
        const result = await runInstallerStep(step);
        steps.push(result);
        if (!result.success && !continueOnError) {
            break;
        }
    }

    const failedSteps = steps.filter((step) => !step.success).length;
    const finishedAt = new Date().toISOString();
    return {
        success: failedSteps === 0,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        continueOnError,
        dryRun,
        steps,
        summary: {
            completedSteps: steps.length,
            failedSteps,
        },
    };
}

export function isInstallerRunValidationError(error: unknown): error is InstallerRunValidationError {
    return error instanceof InstallerRunValidationError;
}
