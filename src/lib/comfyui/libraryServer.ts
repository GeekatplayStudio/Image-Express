import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import {
    resolveAvailableComfyTransport,
    type ComfyConnectionOptions,
    type ResolvedComfyTransport,
} from '@/lib/comfyui/connection';
import { resolveComfyBaseUrlCandidates } from '@/lib/comfyui/proxy';
import type { ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';
import {
    createComfyLibraryWorkflowEntry,
    type ComfyLibraryNodeRepo,
    type ComfyLibraryRepoKind,
    type ComfyLibrarySnapshot,
    type ComfyLibraryWorkflowEntry,
    type ComfyWorkflowManifest,
} from '@/lib/comfyui/libraryTypes';

const execFile = promisify(execFileCallback);
const MANIFEST_SUFFIX = '.manifest.json';
const WORKFLOW_JSON_SUFFIX = '.json';
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

interface ComfyLibraryPathsInput {
    installPath?: string;
    customNodesPath?: string;
    workflowLibraryPath?: string;
}

interface ResolvedComfyLibraryPaths {
    installPath: string;
    customNodesPath: string;
    workflowLibraryPath: string;
}

interface ServerTemplateCandidate {
    idSeed: string;
    name: string;
    description?: string;
    category?: string;
    templateUrl?: string;
    templatePath?: string;
    embeddedWorkflow?: unknown;
}

const trimPath = (value: string | undefined): string => (value || '').trim();

const fileExists = async (targetPath: string): Promise<boolean> => {
    if (!targetPath) {
        return false;
    }

    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
};

const parseJsonSafe = <T>(value: string): T | null => {
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
};

const ensurePathInside = (basePath: string, targetPath: string): void => {
    const resolvedBase = path.resolve(basePath);
    const resolvedTarget = path.resolve(targetPath);

    if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
        throw new Error(`Resolved path "${resolvedTarget}" escapes the configured folder "${resolvedBase}".`);
    }
};

const resolveCustomNodesPath = async (installPath: string, customNodesPath: string): Promise<string> => {
    if (customNodesPath) {
        return customNodesPath;
    }

    if (!installPath) {
        return '';
    }

    const candidates = [
        path.join(installPath, 'custom_nodes'),
        path.join(installPath, 'ComfyUI', 'custom_nodes'),
    ];

    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return candidate;
        }
    }

    return candidates[0];
};

const resolveModelsPath = async (installPath: string): Promise<string> => {
    if (!installPath) {
        return '';
    }

    const candidates = [
        path.join(installPath, 'models'),
        path.join(installPath, 'ComfyUI', 'models'),
    ];

    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return candidate;
        }
    }

    return candidates[0];
};

export const resolveComfyLibraryPaths = async (
    input: ComfyLibraryPathsInput
): Promise<ResolvedComfyLibraryPaths> => {
    const installPath = trimPath(input.installPath);
    const customNodesPath = await resolveCustomNodesPath(installPath, trimPath(input.customNodesPath));
    const workflowLibraryPath = trimPath(input.workflowLibraryPath);

    return {
        installPath,
        customNodesPath,
        workflowLibraryPath,
    };
};

const walkForWorkflowFiles = async (directoryPath: string): Promise<string[]> => {
    if (!directoryPath || !(await fileExists(directoryPath))) {
        return [];
    }

    const results: string[] = [];
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            results.push(...await walkForWorkflowFiles(entryPath));
            continue;
        }

        const lowerName = entry.name.toLowerCase();
        if (!lowerName.endsWith(WORKFLOW_JSON_SUFFIX) || lowerName.endsWith(MANIFEST_SUFFIX)) {
            continue;
        }

        results.push(entryPath);
    }

    return results;
};

const readWorkflowManifest = async (workflowPath: string): Promise<ComfyWorkflowManifest | null> => {
    const manifestPath = workflowPath.replace(/\.json$/i, MANIFEST_SUFFIX);
    if (!(await fileExists(manifestPath))) {
        return null;
    }

    const raw = await readFile(manifestPath, 'utf8');
    return parseJsonSafe<ComfyWorkflowManifest>(raw);
};

export const scanCustomWorkflowFolder = async (
    workflowLibraryPath: string
): Promise<ComfyLibraryWorkflowEntry[]> => {
    if (!workflowLibraryPath || !(await fileExists(workflowLibraryPath))) {
        return [];
    }

    const workflowFiles = await walkForWorkflowFiles(workflowLibraryPath);
    const entries = await Promise.all(workflowFiles.map(async (workflowPath) => {
        try {
            const raw = await readFile(workflowPath, 'utf8');
            const blueprint = parseJsonSafe<unknown>(raw);
            if (!blueprint) {
                return {
                    id: path.basename(workflowPath, '.json'),
                    source: 'custom-folder' as const,
                    name: path.basename(workflowPath, '.json'),
                    description: 'Workflow JSON could not be parsed.',
                    task: null,
                    runnable: false,
                    category: 'Custom Folder',
                    location: workflowPath,
                    nodeTypes: [],
                    warning: 'Invalid JSON file.',
                };
            }

            const manifest = await readWorkflowManifest(workflowPath);
            return createComfyLibraryWorkflowEntry({
                idSeed: path.basename(workflowPath, '.json'),
                source: 'custom-folder',
                name: manifest?.name || path.basename(workflowPath, '.json'),
                description: manifest?.description || `Imported from ${workflowPath}`,
                category: 'Custom Folder',
                location: workflowPath,
                blueprint,
                manifest,
            });
        } catch (error) {
            return {
                id: path.basename(workflowPath, '.json'),
                source: 'custom-folder' as const,
                name: path.basename(workflowPath, '.json'),
                description: error instanceof Error ? error.message : 'Failed to inspect workflow.',
                task: null,
                runnable: false,
                category: 'Custom Folder',
                location: workflowPath,
                nodeTypes: [],
                warning: 'Inspection failed.',
            };
        }
    }));

    return entries.sort((left, right) => left.name.localeCompare(right.name));
};

const repoNameFromUrl = (repoUrl: string): string => {
    const parsed = new URL(repoUrl);
    const basename = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop();
    if (!basename) {
        throw new Error('GitHub URL must include a repository name.');
    }

    return basename.replace(/\.git$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
};

const validateGitHubUrl = (repoUrl: string): URL => {
    const parsed = new URL(repoUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new Error('Repository URL must use http or https.');
    }
    if (!GITHUB_HOSTS.has(parsed.hostname.toLowerCase())) {
        throw new Error('Only GitHub repository URLs are supported right now.');
    }
    return parsed;
};

const countWorkflowHints = async (repoPath: string): Promise<number> => {
    const candidates = [
        path.join(repoPath, 'example_workflows'),
        path.join(repoPath, 'workflows'),
    ];

    let count = 0;
    for (const candidate of candidates) {
        const files = await walkForWorkflowFiles(candidate);
        count += files.length;
    }
    return count;
};

export const scanNodeRepos = async (
    customNodesPath: string,
    workflowLibraryPath: string
): Promise<ComfyLibraryNodeRepo[]> => {
    const results: ComfyLibraryNodeRepo[] = [];
    const scanTargets: Array<{ basePath: string; repoKind: ComfyLibraryRepoKind }> = [
        { basePath: customNodesPath, repoKind: 'custom-nodes' },
        { basePath: workflowLibraryPath, repoKind: 'workflow-library' },
    ];

    for (const target of scanTargets) {
        if (!target.basePath || !(await fileExists(target.basePath))) {
            continue;
        }

        const entries = await readdir(target.basePath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            const repoPath = path.join(target.basePath, entry.name);
            const gitManaged = await fileExists(path.join(repoPath, '.git'));
            const requirementsFile = await fileExists(path.join(repoPath, 'requirements.txt'));
            const workflowHintCount = await countWorkflowHints(repoPath);

            results.push({
                name: entry.name,
                path: repoPath,
                repoKind: target.repoKind,
                gitManaged,
                workflowHintCount,
                requirementsFile,
            });
        }
    }

    return results.sort((left, right) => left.name.localeCompare(right.name));
};

const buildTemplateFetchCandidates = (transport: ResolvedComfyTransport): string[] => {
    const candidates = [
        `${transport.baseUrl}${transport.apiBasePath}/workflow_templates`,
        `${transport.baseUrl}/api/workflow_templates`,
        `${transport.baseUrl}/workflow_templates`,
    ];

    return Array.from(new Set(candidates));
};

const extractEmbeddedWorkflow = (candidate: Record<string, unknown>): unknown => (
    candidate.workflow_json
    || candidate.workflow
    || candidate.prompt
    || candidate.json
    || candidate.data
    || null
);

const extractTemplateLocation = (candidate: Record<string, unknown>): { templateUrl?: string; templatePath?: string } => {
    const rawUrl = candidate.templateUrl || candidate.url;
    if (typeof rawUrl === 'string' && rawUrl.trim()) {
        return { templateUrl: rawUrl.trim() };
    }

    const rawPath = candidate.templatePath || candidate.path || candidate.file || candidate.filename;
    if (typeof rawPath === 'string' && rawPath.trim()) {
        return { templatePath: rawPath.trim() };
    }

    return {};
};

const collectServerTemplateCandidates = (
    raw: unknown,
    category: string = 'Server Templates',
    bucket: ServerTemplateCandidate[] = []
): ServerTemplateCandidate[] => {
    if (Array.isArray(raw)) {
        for (const item of raw) {
            collectServerTemplateCandidates(item, category, bucket);
        }
        return bucket;
    }

    if (!raw || typeof raw !== 'object') {
        return bucket;
    }

    const record = raw as Record<string, unknown>;
    const nestedCategory = typeof record.category === 'string'
        ? record.category
        : typeof record.name === 'string' && Array.isArray(record.templates)
            ? record.name
            : category;

    if (Array.isArray(record.templates)) {
        collectServerTemplateCandidates(record.templates, nestedCategory, bucket);
        return bucket;
    }
    if (Array.isArray(record.items)) {
        collectServerTemplateCandidates(record.items, nestedCategory, bucket);
        return bucket;
    }

    const name = typeof record.name === 'string'
        ? record.name
        : typeof record.title === 'string'
            ? record.title
            : '';
    const embeddedWorkflow = extractEmbeddedWorkflow(record);
    const location = extractTemplateLocation(record);

    if (name || embeddedWorkflow || location.templateUrl || location.templatePath) {
        bucket.push({
            idSeed: name || location.templatePath || location.templateUrl || `template-${bucket.length + 1}`,
            name: name || location.templatePath || location.templateUrl || `Template ${bucket.length + 1}`,
            description: typeof record.description === 'string' ? record.description : undefined,
            category: nestedCategory,
            templateUrl: location.templateUrl,
            templatePath: location.templatePath,
            embeddedWorkflow,
        });
    }

    for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
            collectServerTemplateCandidates(value, nestedCategory, bucket);
        }
    }

    return bucket;
};

const fetchJsonWithFallback = async (
    urls: string[],
    headers: Record<string, string>
): Promise<unknown> => {
    let lastError: Error | null = null;

    for (const url of urls) {
        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status} while fetching ${url}`);
                continue;
            }

            return await response.json();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError || new Error('Failed to fetch workflow templates from ComfyUI.');
};

const resolveLibraryTransport = async (
    connection: ComfyConnectionOptions
): Promise<ResolvedComfyTransport> => {
    try {
        return await resolveAvailableComfyTransport(connection);
    } catch (error) {
        const initialError = error instanceof Error ? error : new Error(String(error));
        if (connection.mode === 'cloud' || !connection.localUrl) {
            throw initialError;
        }

        const candidates = resolveComfyBaseUrlCandidates(connection.localUrl).slice(1);
        for (const candidate of candidates) {
            try {
                return await resolveAvailableComfyTransport({
                    ...connection,
                    mode: 'local',
                    localUrl: candidate,
                });
            } catch {
                // Try the next candidate.
            }
        }

        throw initialError;
    }
};

const resolveTemplateUrl = (
    templateUrl: string | undefined,
    templatePath: string | undefined,
    transport: ResolvedComfyTransport
): string | null => {
    if (templateUrl) {
        return new URL(templateUrl, transport.baseUrl).toString();
    }
    if (templatePath) {
        return new URL(templatePath, transport.baseUrl).toString();
    }
    return null;
};

const importServerTemplateCandidate = async (
    candidate: ServerTemplateCandidate,
    transport: ResolvedComfyTransport
): Promise<ComfyLibraryWorkflowEntry> => {
    let workflowPayload = candidate.embeddedWorkflow;

    if (!workflowPayload) {
        const resolvedTemplateUrl = resolveTemplateUrl(candidate.templateUrl, candidate.templatePath, transport);
        if (resolvedTemplateUrl) {
            const response = await fetch(resolvedTemplateUrl, {
                headers: transport.defaultHeaders,
            });
            if (!response.ok) {
                return {
                    id: candidate.idSeed,
                    source: 'server-template',
                    name: candidate.name,
                    description: candidate.description || 'Template available on the connected ComfyUI server.',
                    task: null,
                    runnable: false,
                    category: candidate.category || 'Server Templates',
                    location: resolvedTemplateUrl,
                    nodeTypes: [],
                    importRef: {
                        templateUrl: candidate.templateUrl,
                        templatePath: candidate.templatePath,
                    },
                    warning: `Template metadata was found, but its JSON could not be downloaded (${response.status}).`,
                };
            }

            const rawText = await response.text();
            workflowPayload = parseJsonSafe<unknown>(rawText);
        }
    }

    if (!workflowPayload) {
        return {
            id: candidate.idSeed,
            source: 'server-template',
            name: candidate.name,
            description: candidate.description || 'Template available on the connected ComfyUI server.',
            task: null,
            runnable: false,
            category: candidate.category || 'Server Templates',
            location: candidate.templateUrl || candidate.templatePath,
            nodeTypes: [],
            importRef: {
                templateUrl: candidate.templateUrl,
                templatePath: candidate.templatePath,
            },
            warning: 'This template did not include an importable workflow payload.',
        };
    }

    return createComfyLibraryWorkflowEntry({
        idSeed: candidate.idSeed,
        source: 'server-template',
        name: candidate.name,
        description: candidate.description || 'Imported from the connected ComfyUI template library.',
        category: candidate.category || 'Server Templates',
        location: candidate.templateUrl || candidate.templatePath,
        blueprint: workflowPayload,
        importRef: {
            templateUrl: candidate.templateUrl,
            templatePath: candidate.templatePath,
        },
    });
};

export const fetchServerTemplateWorkflows = async (
    connection: ComfyConnectionOptions
): Promise<ComfyLibraryWorkflowEntry[]> => {
    const transport = await resolveLibraryTransport(connection);
    const templateCatalog = await fetchJsonWithFallback(
        buildTemplateFetchCandidates(transport),
        transport.defaultHeaders
    );

    const candidates = collectServerTemplateCandidates(templateCatalog);
    const uniqueCandidates = Array.from(new Map(
        candidates.map((candidate) => [`${candidate.name}:${candidate.templateUrl || candidate.templatePath || candidate.idSeed}`, candidate])
    ).values());

    const imported = await Promise.all(uniqueCandidates.map((candidate) => importServerTemplateCandidate(candidate, transport)));
    return imported.sort((left, right) => left.name.localeCompare(right.name));
};

export const buildComfyLibrarySnapshot = async (
    connection: ComfyConnectionOptions,
    pathInput: ComfyLibraryPathsInput
): Promise<ComfyLibrarySnapshot> => {
    const warnings: string[] = [];
    const resolvedPaths = await resolveComfyLibraryPaths(pathInput);

    if (resolvedPaths.installPath && !(await fileExists(resolvedPaths.installPath))) {
        warnings.push(
            `Configured ComfyUI install path is not readable from this app runtime: ${resolvedPaths.installPath}. `
            + 'If the app is running in Docker and ComfyUI is on a host drive like O:\\, mount that folder into the container before using repo/file management.'
        );
    }
    if (resolvedPaths.customNodesPath && !(await fileExists(resolvedPaths.customNodesPath))) {
        warnings.push(
            `Configured custom-nodes folder is not readable from this app runtime: ${resolvedPaths.customNodesPath}. `
            + 'Generation through the Comfy proxy can still work, but repo installs and node scans need the folder mounted or the app running on the host.'
        );
    }
    if (resolvedPaths.workflowLibraryPath && !(await fileExists(resolvedPaths.workflowLibraryPath))) {
        warnings.push(
            `Configured workflow folder is not readable from this app runtime: ${resolvedPaths.workflowLibraryPath}. `
            + 'Mount the folder into Docker if you want the app to scan host-side workflow JSON files.'
        );
    }

    let serverTemplates: ComfyLibraryWorkflowEntry[] = [];
    try {
        serverTemplates = await fetchServerTemplateWorkflows(connection);
    } catch (error) {
        let message = error instanceof Error ? error.message : 'Failed to inspect ComfyUI workflow templates.';
        const localUrl = trimPath(connection.localUrl);
        if (/(?:localhost|127\.0\.0\.1)/i.test(localUrl)) {
            message += ' If this app is running in Docker while ComfyUI is on the host machine, use host.docker.internal instead of localhost for server-side workflow scans.';
        }
        warnings.push(message);
    }

    let customFolderWorkflows: ComfyLibraryWorkflowEntry[] = [];
    try {
        customFolderWorkflows = await scanCustomWorkflowFolder(resolvedPaths.workflowLibraryPath);
    } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'Failed to inspect the custom workflow folder.');
    }

    let nodeRepos: ComfyLibraryNodeRepo[] = [];
    try {
        nodeRepos = await scanNodeRepos(resolvedPaths.customNodesPath, resolvedPaths.workflowLibraryPath);
    } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'Failed to inspect ComfyUI repositories.');
    }

    return {
        ...resolvedPaths,
        serverTemplates,
        customFolderWorkflows,
        nodeRepos,
        warnings,
    };
};

interface InstallRepoOptions {
    repoUrl: string;
    targetRootPath: string;
}

const cloneIntoDirectory = async ({ repoUrl, targetRootPath }: InstallRepoOptions): Promise<string> => {
    if (!targetRootPath) {
        throw new Error('Configure a target folder before installing a repository.');
    }

    validateGitHubUrl(repoUrl);
    await mkdir(targetRootPath, { recursive: true });

    const repoName = repoNameFromUrl(repoUrl);
    const destinationPath = path.join(targetRootPath, repoName);
    ensurePathInside(targetRootPath, destinationPath);

    if (await fileExists(destinationPath)) {
        throw new Error(`Target folder already exists: ${destinationPath}`);
    }

    await execFile('git', ['clone', '--depth', '1', repoUrl, destinationPath]);
    return destinationPath;
};

const pullRepo = async (repoPath: string): Promise<void> => {
    if (!(await fileExists(repoPath))) {
        throw new Error(`Repository path was not found: ${repoPath}`);
    }

    await execFile('git', ['-C', repoPath, 'pull', '--ff-only']);
};

export const installComfyRepository = async (options: {
    repoUrl: string;
    repoKind: ComfyLibraryRepoKind;
    installPath?: string;
    customNodesPath?: string;
    workflowLibraryPath?: string;
}): Promise<{ installedPath: string }> => {
    const resolvedPaths = await resolveComfyLibraryPaths(options);
    const targetRootPath = options.repoKind === 'custom-nodes'
        ? resolvedPaths.customNodesPath
        : resolvedPaths.workflowLibraryPath;

    const installedPath = await cloneIntoDirectory({
        repoUrl: options.repoUrl,
        targetRootPath,
    });

    return { installedPath };
};

export const updateManagedRepository = async (options: {
    repoPath: string;
    installPath?: string;
    customNodesPath?: string;
    workflowLibraryPath?: string;
}): Promise<void> => {
    const resolvedPaths = await resolveComfyLibraryPaths(options);
    const allowedRoots = [
        resolvedPaths.installPath,
        resolvedPaths.customNodesPath,
        resolvedPaths.workflowLibraryPath,
    ].filter(Boolean);

    if (allowedRoots.length === 0) {
        throw new Error('Configure a Comfy install, custom-nodes, or workflow-library folder first.');
    }

    const resolvedRepoPath = path.resolve(options.repoPath);
    const allowed = allowedRoots.some((rootPath) => {
        const resolvedRoot = path.resolve(rootPath);
        return resolvedRepoPath === resolvedRoot || resolvedRepoPath.startsWith(`${resolvedRoot}${path.sep}`);
    });

    if (!allowed) {
        throw new Error('Repository path is outside the configured Comfy workspace.');
    }

    await pullRepo(resolvedRepoPath);
};

export const updateComfyInstall = async (installPath: string): Promise<void> => {
    if (!installPath.trim()) {
        throw new Error('Configure the ComfyUI install folder before updating it.');
    }

    await pullRepo(path.resolve(installPath));
};

const downloadModelToComfyInstall = async (
    modelsRootPath: string,
    model: ComfyWorkflowInstallableModel
): Promise<string> => {
    if (!model.downloadUrl.trim()) {
        throw new Error(`Missing download URL for model ${model.name}.`);
    }

    const normalizedDirectory = model.directory
        .replace(/[\\/]+/g, path.sep)
        .replace(new RegExp(`^${path.sep}+`), '');
    const targetDirectory = path.join(modelsRootPath, normalizedDirectory);
    const targetPath = path.join(targetDirectory, model.name);
    ensurePathInside(modelsRootPath, targetDirectory);
    ensurePathInside(modelsRootPath, targetPath);

    if (await fileExists(targetPath)) {
        return targetPath;
    }

    const response = await fetch(model.downloadUrl);
    if (!response.ok) {
        throw new Error(`Failed to download ${model.name}: HTTP ${response.status}.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(targetPath, Buffer.from(arrayBuffer));
    return targetPath;
};

export const installComfyRequirements = async (options: {
    installPath?: string;
    models?: ComfyWorkflowInstallableModel[];
    updateInstall?: boolean;
}): Promise<{ updatedInstall: boolean; installedModelPaths: string[]; skippedModelPaths: string[] }> => {
    const installPath = trimPath(options.installPath);
    const models = options.models || [];

    if (!installPath) {
        throw new Error('Configure the ComfyUI install folder before installing missing requirements.');
    }

    if (!options.updateInstall && models.length === 0) {
        return {
            updatedInstall: false,
            installedModelPaths: [],
            skippedModelPaths: [],
        };
    }

    if (options.updateInstall) {
        await updateComfyInstall(installPath);
    }

    const modelsRootPath = models.length > 0 ? await resolveModelsPath(installPath) : '';
    const installedModelPaths: string[] = [];
    const skippedModelPaths: string[] = [];
    const seenModels = new Set<string>();

    for (const model of models) {
        const key = `${model.directory}/${model.name}`.toLowerCase();
        if (seenModels.has(key)) {
            continue;
        }
        seenModels.add(key);

        const normalizedDirectory = model.directory
            .replace(/[\\/]+/g, path.sep)
            .replace(new RegExp(`^${path.sep}+`), '');
        const targetPath = path.join(modelsRootPath, normalizedDirectory, model.name);

        if (await fileExists(targetPath)) {
            skippedModelPaths.push(targetPath);
            continue;
        }

        installedModelPaths.push(await downloadModelToComfyInstall(modelsRootPath, model));
    }

    return {
        updatedInstall: Boolean(options.updateInstall),
        installedModelPaths,
        skippedModelPaths,
    };
};
