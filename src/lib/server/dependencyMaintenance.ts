import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
    DependencyOutdatedPackage,
    DependencyRuntimeStatus,
    DependencyVersionStrategy,
} from '@/lib/dependencyRuntimeStatus';
import type {
    DependencyRunPayload,
    DependencyRunResult,
    DependencyRunStepResult,
} from '@/lib/dependencyRuntimeRun';

type ProjectManifest = {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
};

type NpmOutdatedEntry = {
    current?: string;
    wanted?: string;
    latest?: string;
};

const MAX_LOG_BYTES = 150_000;
const PACKAGE_JSON_PATH = path.join(process.cwd(), 'package.json');
const PACKAGE_LOCK_PATH = path.join(process.cwd(), 'package-lock.json');

export class DependencyMaintenanceValidationError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = 'DependencyMaintenanceValidationError';
        this.statusCode = statusCode;
    }
}

function getNpmCommand() {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm';
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

async function runCommand(command: string, args: string[]): Promise<DependencyRunStepResult> {
    const started = Date.now();
    let stdout = '';
    let stderr = '';

    const exitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn(command, args, {
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
        child.on('error', (error) => reject(error));
        child.on('close', (code) => resolve(code ?? 1));
    }).catch((error) => {
        stderr = appendLogChunk(stderr, `${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    });

    return {
        id: `${command}-${args.join('-')}`,
        label: `${command} ${args.join(' ')}`,
        command,
        args,
        exitCode,
        success: exitCode === 0,
        durationMs: Date.now() - started,
        stdout,
        stderr,
    };
}

async function readProjectManifest(): Promise<ProjectManifest> {
    const raw = await fs.readFile(PACKAGE_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ProjectManifest;
    return parsed && typeof parsed === 'object' ? parsed : {};
}

async function writeProjectManifest(manifest: ProjectManifest) {
    await fs.writeFile(PACKAGE_JSON_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function getDependencySection(manifest: ProjectManifest, packageName: string): DependencyOutdatedPackage['section'] {
    if (manifest.dependencies && typeof manifest.dependencies[packageName] === 'string') {
        return 'dependencies';
    }
    if (manifest.devDependencies && typeof manifest.devDependencies[packageName] === 'string') {
        return 'devDependencies';
    }
    return 'unknown';
}

function getExistingRange(manifest: ProjectManifest, packageName: string) {
    const section = getDependencySection(manifest, packageName);
    if (section === 'dependencies') {
        return manifest.dependencies?.[packageName] || '';
    }
    if (section === 'devDependencies') {
        return manifest.devDependencies?.[packageName] || '';
    }
    return '';
}

function withPreservedRangePrefix(existingRange: string, version: string) {
    const prefix = existingRange.trim().startsWith('^')
        ? '^'
        : existingRange.trim().startsWith('~')
            ? '~'
            : '';
    return `${prefix}${version}`;
}

export function parseOutdatedPackages(rawJson: string, manifest: ProjectManifest): DependencyOutdatedPackage[] {
    if (!rawJson.trim()) {
        return [];
    }

    const parsed = JSON.parse(rawJson) as Record<string, NpmOutdatedEntry>;
    return Object.entries(parsed)
        .map(([name, entry]) => {
            const range = getExistingRange(manifest, name);
            const latest = entry.latest?.trim() || '';
            const wanted = entry.wanted?.trim() || latest;
            return {
                name,
                section: getDependencySection(manifest, name),
                range,
                current: entry.current?.trim() || '',
                wanted,
                latest,
                target: latest,
            } satisfies DependencyOutdatedPackage;
        })
        .sort((left, right) => left.name.localeCompare(right.name));
}

export function applyDependencyUpdates(
    manifest: ProjectManifest,
    outdatedPackages: DependencyOutdatedPackage[],
    strategy: DependencyVersionStrategy,
): ProjectManifest {
    const nextManifest: ProjectManifest = {
        ...manifest,
        dependencies: { ...(manifest.dependencies || {}) },
        devDependencies: { ...(manifest.devDependencies || {}) },
    };

    for (const pkg of outdatedPackages) {
        const targetVersion = strategy === 'wanted' ? pkg.wanted : pkg.latest;
        if (!targetVersion) {
            continue;
        }

        if (pkg.section === 'dependencies') {
            nextManifest.dependencies![pkg.name] = withPreservedRangePrefix(pkg.range, targetVersion);
        } else if (pkg.section === 'devDependencies') {
            nextManifest.devDependencies![pkg.name] = withPreservedRangePrefix(pkg.range, targetVersion);
        }
    }

    return nextManifest;
}

function buildUpdatedPackages(
    outdatedPackages: DependencyOutdatedPackage[],
    strategy: DependencyVersionStrategy,
): DependencyOutdatedPackage[] {
    return outdatedPackages.map((pkg) => ({
        ...pkg,
        target: strategy === 'wanted' ? pkg.wanted : pkg.latest,
    }));
}

function isMaintenanceEnabled() {
    if (process.env.NODE_ENV !== 'production') {
        return { enabled: true } as const;
    }
    if (process.env.NEXT_DESKTOP === '1') {
        return { enabled: true } as const;
    }
    return {
        enabled: false,
        reason: 'Dependency maintenance is only enabled for local development or the desktop shell.',
    } as const;
}

async function readOutdatedState(manifest: ProjectManifest) {
    const npmCommand = getNpmCommand();
    const outdatedStep = await runCommand(npmCommand, ['outdated', '--json']);
    if (outdatedStep.exitCode > 1) {
        throw new Error(outdatedStep.stderr.trim() || outdatedStep.stdout.trim() || 'npm outdated failed.');
    }

    return {
        outdatedStep,
        outdatedPackages: parseOutdatedPackages(outdatedStep.stdout, manifest),
    };
}

export async function getDependencyRuntimeStatus(): Promise<DependencyRuntimeStatus> {
    const availability = isMaintenanceEnabled();
    const manifest = await readProjectManifest();
    const packageLockPresent = await fs.access(PACKAGE_LOCK_PATH).then(() => true).catch(() => false);
    const checkedAt = new Date().toISOString();

    if (!availability.enabled) {
        return {
            enabled: false,
            reason: availability.reason,
            checkedAt,
            projectName: manifest.name || 'workspace',
            projectVersion: manifest.version || '0.0.0',
            packageManager: 'npm',
            packageLockPresent,
            outdated: [],
            summary: {
                outdatedCount: 0,
                dependencyCount: Object.keys(manifest.dependencies || {}).length,
                devDependencyCount: Object.keys(manifest.devDependencies || {}).length,
            },
        };
    }

    const { outdatedPackages } = await readOutdatedState(manifest);
    return {
        enabled: true,
        checkedAt,
        projectName: manifest.name || 'workspace',
        projectVersion: manifest.version || '0.0.0',
        packageManager: 'npm',
        packageLockPresent,
        outdated: outdatedPackages,
        summary: {
            outdatedCount: outdatedPackages.length,
            dependencyCount: Object.keys(manifest.dependencies || {}).length,
            devDependencyCount: Object.keys(manifest.devDependencies || {}).length,
        },
    };
}

function coerceBoolean(value: unknown, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
}

function coerceStrategy(value: unknown): DependencyVersionStrategy {
    return value === 'wanted' ? 'wanted' : 'latest';
}

export async function runDependencyMaintenance(rawPayload: unknown): Promise<DependencyRunResult> {
    const availability = isMaintenanceEnabled();
    if (!availability.enabled) {
        throw new DependencyMaintenanceValidationError(availability.reason, 403);
    }
    if (!rawPayload || typeof rawPayload !== 'object') {
        throw new DependencyMaintenanceValidationError('Request payload must be an object.');
    }

    const payload = rawPayload as Partial<DependencyRunPayload>;
    const strategy = coerceStrategy(payload.strategy);
    const runBuild = coerceBoolean(payload.runBuild, true);
    const npmCommand = getNpmCommand();
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const steps: DependencyRunStepResult[] = [];

    const manifest = await readProjectManifest();
    const { outdatedStep, outdatedPackages } = await readOutdatedState(manifest);
    outdatedStep.id = 'check-outdated';
    outdatedStep.label = 'Check outdated packages';
    outdatedStep.success = outdatedStep.exitCode === 0 || outdatedStep.exitCode === 1;
    steps.push(outdatedStep);

    const updatedPackages = buildUpdatedPackages(outdatedPackages, strategy).filter((pkg) => pkg.target);
    if (updatedPackages.length > 0) {
        const nextManifest = applyDependencyUpdates(manifest, outdatedPackages, strategy);
        await writeProjectManifest(nextManifest);
        steps.push({
            id: 'update-package-json',
            label: 'Update package.json ranges',
            command: 'internal',
            args: updatedPackages.map((pkg) => `${pkg.name}@${pkg.target}`),
            exitCode: 0,
            success: true,
            durationMs: 0,
            stdout: `Updated ${updatedPackages.length} package range${updatedPackages.length === 1 ? '' : 's'} in package.json.`,
            stderr: '',
        });

        const installStep = await runCommand(npmCommand, ['install']);
        installStep.id = 'npm-install';
        installStep.label = 'Install updated dependencies';
        steps.push(installStep);
        if (!installStep.success) {
            const failedSteps = steps.filter((step) => !step.success).length;
            const finishedAt = new Date().toISOString();
            return {
                success: false,
                startedAt,
                finishedAt,
                durationMs: Date.now() - startedMs,
                strategy,
                runBuild,
                updatedPackages,
                steps,
                summary: {
                    outdatedCount: outdatedPackages.length,
                    updatedCount: updatedPackages.length,
                    failedSteps,
                },
            };
        }
    }

    if (runBuild) {
        const buildStep = await runCommand(npmCommand, ['run', 'build']);
        buildStep.id = 'build';
        buildStep.label = 'Build application';
        steps.push(buildStep);
    }

    const failedSteps = steps.filter((step) => !step.success).length;
    const finishedAt = new Date().toISOString();
    return {
        success: failedSteps === 0,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        strategy,
        runBuild,
        updatedPackages,
        steps,
        summary: {
            outdatedCount: outdatedPackages.length,
            updatedCount: updatedPackages.length,
            failedSteps,
        },
    };
}

export function isDependencyMaintenanceValidationError(error: unknown): error is DependencyMaintenanceValidationError {
    return error instanceof DependencyMaintenanceValidationError;
}