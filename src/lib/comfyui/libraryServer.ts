import { access, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { readInstallerConfig, resolveInstallerComfyDirectory } from '@/lib/server/comfyInstallerCatalog';
import {
    resolveAvailableComfyTransport,
    type ComfyConnectionOptions,
    type ResolvedComfyTransport,
} from '@/lib/comfyui/connection';
import { resolveComfyBaseUrlCandidates } from '@/lib/comfyui/proxy';
import type { ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';
import {
    type ComfyDiagnosticsSnapshot,
    type ComfyLibraryAssetGroup,
    createComfyLibraryWorkflowEntry,
    type ComfyLocalWorkspaceState,
    type ComfyLibraryNodeRepo,
    type ComfyLibraryPathStatus,
    type ComfyLibraryRepoKind,
    type ComfyLibrarySnapshot,
    type ComfyLibraryWorkflowEntry,
    type ComfyWorkflowManifest,
} from '@/lib/comfyui/libraryTypes';
import { ComfyUIClient } from '@/lib/comfyui/client';

const execFile = promisify(execFileCallback);
const MANIFEST_SUFFIX = '.manifest.json';
const WORKFLOW_JSON_SUFFIX = '.json';
const WORKFLOW_LIBRARY_PATH_SPLIT_PATTERN = /[\r\n;]+/;
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const LOCAL_COMFY_WORKSPACE_DIR = path.join(process.cwd(), 'ComfyUI workflows');
const LOCAL_COMFY_SYNC_DIRECTORIES = ['custom_nodes', 'user', 'models'] as const;

interface ComfyLibraryPathsInput {
    installPath?: string;
    customNodesPath?: string;
    workflowLibraryPath?: string;
}

interface ResolvedComfyLibraryPaths {
    installPath: string;
    customNodesPath: string;
    workflowLibraryPath: string;
    workflowLibraryPaths: string[];
}

interface ServerTemplateCandidate {
    idSeed: string;
    name: string;
    templateId?: string;
    sourceModule?: string;
    description?: string;
    category?: string;
    templateUrl?: string;
    templatePath?: string;
    embeddedWorkflow?: unknown;
}

const trimPath = (value: string | undefined): string => (value || '').trim();

const MODEL_ASSET_INPUT_PATTERN = /(?:^|_)(?:ckpt|checkpoint|model|unet|clip|vae|lora|controlnet|embedding|text_encoder|diffusion_model|upscale_model|style_model|hypernetwork)(?:_|$)|name$/i;

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

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

const isTemplateNameList = (value: unknown): value is string[] => (
    Array.isArray(value)
    && value.every((item) => typeof item === 'string')
);

const extractStringChoices = (inputDefinition: unknown): string[] => {
    if (!Array.isArray(inputDefinition)) {
        return [];
    }

    const directChoices = inputDefinition.find((entry) => (
        Array.isArray(entry) && entry.every((item) => typeof item === 'string')
    )) as string[] | undefined;
    if (directChoices && directChoices.length > 0) {
        return directChoices;
    }

    const objectEntry = inputDefinition.find((entry) => isRecord(entry));
    if (!objectEntry) {
        return [];
    }

    const candidate = objectEntry.choices
        || objectEntry.options
        || objectEntry.values
        || objectEntry.items;

    if (Array.isArray(candidate) && candidate.every((item) => typeof item === 'string')) {
        return candidate;
    }

    return [];
};

const inferAssetGroup = (classType: string, inputName: string): { id: string; label: string; expectedSubdirectory: string } | null => {
    const fingerprint = `${classType}.${inputName}`.toLowerCase();

    if (fingerprint.includes('lora')) {
        return { id: 'loras', label: 'LoRAs', expectedSubdirectory: 'loras' };
    }
    if (fingerprint.includes('checkpoint') || fingerprint.includes('ckpt')) {
        return { id: 'checkpoints', label: 'Checkpoints', expectedSubdirectory: 'checkpoints' };
    }
    if (fingerprint.includes('controlnet')) {
        return { id: 'controlnets', label: 'ControlNets', expectedSubdirectory: 'controlnet' };
    }
    if (fingerprint.includes('embedding')) {
        return { id: 'embeddings', label: 'Embeddings', expectedSubdirectory: 'embeddings' };
    }
    if (fingerprint.includes('upscale_model') || fingerprint.includes('upscaler')) {
        return { id: 'upscale-models', label: 'Upscale Models', expectedSubdirectory: 'upscale_models' };
    }
    if (fingerprint.includes('text_encoder')) {
        return { id: 'text-encoders', label: 'Text Encoders', expectedSubdirectory: 'text_encoders' };
    }
    if (fingerprint.includes('diffusion_model')) {
        return { id: 'diffusion-models', label: 'Diffusion Models', expectedSubdirectory: 'diffusion_models' };
    }
    if (fingerprint.includes('style_model')) {
        return { id: 'style-models', label: 'Style Models', expectedSubdirectory: 'style_models' };
    }
    if (fingerprint.includes('hypernetwork')) {
        return { id: 'hypernetworks', label: 'Hypernetworks', expectedSubdirectory: 'hypernetworks' };
    }
    if (fingerprint.includes('unet')) {
        return { id: 'unets', label: 'UNETs', expectedSubdirectory: 'unet' };
    }
    if (fingerprint.includes('clip')) {
        return { id: 'clips', label: 'CLIP Models', expectedSubdirectory: 'clip' };
    }
    if (fingerprint.includes('vae')) {
        return { id: 'vaes', label: 'VAEs', expectedSubdirectory: 'vae' };
    }
    if (fingerprint.includes('model')) {
        return { id: 'models', label: 'Models', expectedSubdirectory: '.' };
    }

    return null;
};

const collectAssetInventory = (objectInfo: Record<string, unknown> | null): ComfyLibraryAssetGroup[] => {
    if (!objectInfo) {
        return [];
    }

    const groups = new Map<string, {
        id: string;
        label: string;
        expectedSubdirectory: string;
        values: Set<string>;
        sourceInputs: Set<string>;
    }>();

    for (const [classType, rawNodeInfo] of Object.entries(objectInfo)) {
        if (!isRecord(rawNodeInfo)) {
            continue;
        }

        const input = isRecord(rawNodeInfo.input) ? rawNodeInfo.input : null;
        const requiredInputs = isRecord(input?.required) ? input.required : {};
        const optionalInputs = isRecord(input?.optional) ? input.optional : {};
        const allInputs = { ...requiredInputs, ...optionalInputs };

        for (const [inputName, inputDefinition] of Object.entries(allInputs)) {
            if (!MODEL_ASSET_INPUT_PATTERN.test(inputName)) {
                continue;
            }

            const choices = extractStringChoices(inputDefinition);
            if (choices.length === 0) {
                continue;
            }

            const assetGroup = inferAssetGroup(classType, inputName);
            if (!assetGroup) {
                continue;
            }

            const existingGroup = groups.get(assetGroup.id) || {
                ...assetGroup,
                values: new Set<string>(),
                sourceInputs: new Set<string>(),
            };

            for (const choice of choices) {
                existingGroup.values.add(choice);
            }
            existingGroup.sourceInputs.add(`${classType}.${inputName}`);
            groups.set(assetGroup.id, existingGroup);
        }
    }

    return Array.from(groups.values())
        .map((group) => ({
            id: group.id,
            label: group.label,
            expectedSubdirectory: group.expectedSubdirectory,
            values: Array.from(group.values).sort((left, right) => left.localeCompare(right)),
            sourceInputs: Array.from(group.sourceInputs).sort((left, right) => left.localeCompare(right)),
        }))
        .sort((left, right) => left.label.localeCompare(right.label));
};

const buildPathStatus = async (label: string, targetPath: string, note?: string): Promise<ComfyLibraryPathStatus> => {
    const exists = targetPath ? await fileExists(targetPath) : false;
    return {
        label,
        path: targetPath,
        exists,
        readable: exists,
        note,
    };
};

const ensurePathInside = (basePath: string, targetPath: string): void => {
    const resolvedBase = path.resolve(basePath);
    const resolvedTarget = path.resolve(targetPath);

    if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
        throw new Error(`Resolved path "${resolvedTarget}" escapes the configured folder "${resolvedBase}".`);
    }
};

const resolvePathRelativeToInstall = (installPath: string, targetPath: string): string => {
    if (!targetPath) {
        return '';
    }

    if (!installPath || path.isAbsolute(targetPath)) {
        return targetPath;
    }

    return path.join(installPath, targetPath);
};

const resolveDefaultWorkflowLibraryPaths = async (installPath: string): Promise<string[]> => {
    if (installPath) {
        const installCandidates = [
            path.join(installPath, 'user', 'default', 'workflows'),
            path.join(installPath, 'ComfyUI', 'user', 'default', 'workflows'),
        ];

        for (const candidate of installCandidates) {
            if (await fileExists(candidate)) {
                return [candidate];
            }
        }

        return [installCandidates[0]];
    }

    return [path.join(LOCAL_COMFY_WORKSPACE_DIR, 'user', 'default', 'workflows')];
};

const parseConfiguredWorkflowLibraryPaths = async (installPath: string, workflowLibraryPath: string): Promise<string[]> => {
    const configuredPaths = workflowLibraryPath
        .split(WORKFLOW_LIBRARY_PATH_SPLIT_PATTERN)
        .map((value) => resolvePathRelativeToInstall(installPath, value.trim()))
        .filter(Boolean);

    if (configuredPaths.length > 0) {
        return Array.from(new Set(configuredPaths));
    }

    return resolveDefaultWorkflowLibraryPaths(installPath);
};

const resolveCustomNodesPath = async (installPath: string, customNodesPath: string): Promise<string> => {
    const configuredPath = resolvePathRelativeToInstall(installPath, customNodesPath);
    if (configuredPath) {
        return configuredPath;
    }

    if (!installPath) {
        return path.join(LOCAL_COMFY_WORKSPACE_DIR, 'custom_nodes');
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
    const explicitInstallPath = trimPath(input.installPath);
    let installPath = explicitInstallPath;

    if (!installPath) {
        const config = await readInstallerConfig().catch(() => ({}));
        const detectedInstallPath = await resolveInstallerComfyDirectory(config);
        if (detectedInstallPath && await fileExists(detectedInstallPath)) {
            installPath = detectedInstallPath;
        }
    }

    const customNodesPath = await resolveCustomNodesPath(installPath, trimPath(input.customNodesPath));
    const workflowLibraryPaths = await parseConfiguredWorkflowLibraryPaths(installPath, trimPath(input.workflowLibraryPath));
    const workflowLibraryPath = workflowLibraryPaths[0] || '';

    return {
        installPath,
        customNodesPath,
        workflowLibraryPath,
        workflowLibraryPaths,
    };
};

const listLocalWorkspaceSyncDirectories = async (workspacePath: string): Promise<string[]> => {
    const syncedDirectories: string[] = [];
    for (const directoryName of LOCAL_COMFY_SYNC_DIRECTORIES) {
        const targetPath = path.join(workspacePath, directoryName);
        if (await fileExists(targetPath)) {
            syncedDirectories.push(directoryName);
        }
    }
    return syncedDirectories;
};

const syncLocalComfyWorkspaceToInstall = async (installPath: string): Promise<ComfyLocalWorkspaceState> => {
    const exists = await fileExists(LOCAL_COMFY_WORKSPACE_DIR);
    const syncedDirectories = exists ? await listLocalWorkspaceSyncDirectories(LOCAL_COMFY_WORKSPACE_DIR) : [];
    const workflowFileCount = exists ? (await walkForWorkflowFiles(LOCAL_COMFY_WORKSPACE_DIR)).length : 0;

    if (!exists || !installPath || !(await fileExists(installPath)) || syncedDirectories.length === 0) {
        return {
            path: LOCAL_COMFY_WORKSPACE_DIR,
            exists,
            workflowFileCount,
            syncedDirectories,
            syncedIntoInstall: false,
        };
    }

    let syncedIntoInstall = true;
    for (const directoryName of syncedDirectories) {
        const sourcePath = path.join(LOCAL_COMFY_WORKSPACE_DIR, directoryName);
        const targetPath = path.join(installPath, directoryName);
        try {
            await mkdir(path.dirname(targetPath), { recursive: true });
            await cp(sourcePath, targetPath, {
                recursive: true,
                force: true,
                // Placeholder files break force-overwrites on some installs
                // (ENOENT unlink on .gitkeep) and are pointless to copy.
                filter: (source) => !source.endsWith('.gitkeep'),
            });
        } catch (error) {
            // A failed sync of one directory should not fail the whole scan.
            console.warn(`Comfy workspace sync skipped for "${directoryName}":`, error instanceof Error ? error.message : error);
            syncedIntoInstall = false;
        }
    }

    return {
        path: LOCAL_COMFY_WORKSPACE_DIR,
        exists,
        workflowFileCount,
        syncedDirectories,
        syncedIntoInstall,
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
    workflowLibraryPath: string,
    category: string = 'Workflow Folder'
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
                    category,
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
                category,
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
                category,
                location: workflowPath,
                nodeTypes: [],
                warning: 'Inspection failed.',
            };
        }
    }));

    return entries.sort((left, right) => left.name.localeCompare(right.name));
};

const buildWorkflowFolderCategory = (workflowLibraryPath: string, multipleFolders: boolean): string => {
    if (!multipleFolders) {
        return 'Workflow Folder';
    }

    const folderName = path.basename(workflowLibraryPath);
    return folderName ? `Workflow Folder: ${folderName}` : 'Workflow Folder';
};

const scanConfiguredWorkflowFolders = async (
    workflowLibraryPaths: string[]
): Promise<ComfyLibraryWorkflowEntry[]> => {
    if (workflowLibraryPaths.length === 0) {
        return [];
    }

    const multipleFolders = workflowLibraryPaths.length > 1;
    const scannedEntries = await Promise.all(workflowLibraryPaths.map((workflowLibraryPath) => (
        scanCustomWorkflowFolder(
            workflowLibraryPath,
            buildWorkflowFolderCategory(workflowLibraryPath, multipleFolders)
        )
    )));

    const entriesByLocation = new Map<string, ComfyLibraryWorkflowEntry>();
    for (const entry of scannedEntries.flat()) {
        const key = entry.location || `${entry.source}:${entry.id}`;
        if (!entriesByLocation.has(key)) {
            entriesByLocation.set(key, entry);
        }
    }

    return Array.from(entriesByLocation.values())
        .sort((left, right) => left.name.localeCompare(right.name));
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
    workflowLibraryPaths: string[]
): Promise<ComfyLibraryNodeRepo[]> => {
    const results: ComfyLibraryNodeRepo[] = [];
    const scanTargets: Array<{ basePath: string; repoKind: ComfyLibraryRepoKind }> = [
        { basePath: customNodesPath, repoKind: 'custom-nodes' },
        ...workflowLibraryPaths.map((workflowLibraryPath) => ({
            basePath: workflowLibraryPath,
            repoKind: 'workflow-library' as const,
        })),
    ];
    const seenRepoPaths = new Set<string>();

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
            if (seenRepoPaths.has(repoPath)) {
                continue;
            }
            seenRepoPaths.add(repoPath);
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

const buildTemplateJsonFetchCandidates = (
    transport: ResolvedComfyTransport,
    sourceModule: string,
    templateId: string
): string[] => {
    const normalizedSourceModule = sourceModule.trim();
    const normalizedTemplateId = templateId.trim();
    if (!normalizedSourceModule || !normalizedTemplateId) {
        return [];
    }

    const encodedSourceModule = encodeURIComponent(normalizedSourceModule);
    const encodedTemplateId = encodeURIComponent(normalizedTemplateId);
    const candidates = [
        `${transport.baseUrl}${transport.apiBasePath}/workflow_templates/${encodedSourceModule}/${encodedTemplateId}.json`,
        `${transport.baseUrl}/api/workflow_templates/${encodedSourceModule}/${encodedTemplateId}.json`,
        `${transport.baseUrl}/workflow_templates/${encodedSourceModule}/${encodedTemplateId}.json`,
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
    const shortFormTemplateGroups = Object.entries(record)
        .filter(([, value]) => isTemplateNameList(value));

    if (shortFormTemplateGroups.length > 0) {
        for (const [sourceModule, templateNames] of shortFormTemplateGroups) {
            const typedTemplateNames = templateNames as string[];
            for (const templateName of typedTemplateNames) {
                const normalizedTemplateName = templateName.trim();
                if (!normalizedTemplateName) {
                    continue;
                }

                bucket.push({
                    idSeed: `${sourceModule}-${normalizedTemplateName}`,
                    name: normalizedTemplateName,
                    templateId: normalizedTemplateName,
                    sourceModule,
                    description: `Template exposed by ComfyUI module ${sourceModule}.`,
                    category: sourceModule,
                });
            }
        }

        for (const value of Object.values(record)) {
            if (value && typeof value === 'object' && !isTemplateNameList(value)) {
                collectServerTemplateCandidates(value, category, bucket);
            }
        }

        return bucket;
    }

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

    const templateId = typeof record.name === 'string'
        ? record.name.trim()
        : '';
    const name = templateId
        || (typeof record.title === 'string'
            ? record.title.trim()
            : '');
    const embeddedWorkflow = extractEmbeddedWorkflow(record);
    const location = extractTemplateLocation(record);

    if (name || embeddedWorkflow || location.templateUrl || location.templatePath) {
        bucket.push({
            idSeed: name || location.templatePath || location.templateUrl || `template-${bucket.length + 1}`,
            name: name || location.templatePath || location.templateUrl || `Template ${bucket.length + 1}`,
            templateId: templateId || undefined,
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

const resolveTemplateUrlCandidates = (
    candidate: ServerTemplateCandidate,
    transport: ResolvedComfyTransport
): string[] => {
    const candidates: string[] = [];

    if (candidate.templateUrl) {
        candidates.push(new URL(candidate.templateUrl, transport.baseUrl).toString());
    }
    if (candidate.templatePath) {
        candidates.push(new URL(candidate.templatePath, transport.baseUrl).toString());
    }
    if (candidate.sourceModule && candidate.templateId) {
        candidates.push(...buildTemplateJsonFetchCandidates(transport, candidate.sourceModule, candidate.templateId));
    }

    return Array.from(new Set(candidates));
};

const resolvePrimaryTemplateUrl = (
    candidate: ServerTemplateCandidate,
    transport: ResolvedComfyTransport
): string | null => {
    const candidates = resolveTemplateUrlCandidates(candidate, transport);
    return candidates[0] || null;
};

const importServerTemplateCandidate = async (
    candidate: ServerTemplateCandidate,
    transport: ResolvedComfyTransport
): Promise<ComfyLibraryWorkflowEntry> => {
    let workflowPayload = candidate.embeddedWorkflow;
    const resolvedTemplateUrl = resolvePrimaryTemplateUrl(candidate, transport);

    if (!workflowPayload) {
        const resolvedTemplateUrls = resolveTemplateUrlCandidates(candidate, transport);
        if (resolvedTemplateUrls.length > 0) {
            try {
                workflowPayload = await fetchJsonWithFallback(resolvedTemplateUrls, transport.defaultHeaders);
            } catch (error) {
                return {
                    id: candidate.idSeed,
                    source: 'server-template',
                    name: candidate.name,
                    description: candidate.description || 'Template available on the connected ComfyUI server.',
                    task: null,
                    runnable: false,
                    category: candidate.category || 'Server Templates',
                    location: resolvedTemplateUrl || undefined,
                    nodeTypes: [],
                    importRef: {
                        templateUrl: candidate.templateUrl,
                        templatePath: candidate.templatePath,
                    },
                    warning: `Template metadata was found, but its JSON could not be downloaded (${error instanceof Error ? error.message : 'unknown error'}).`,
                };
            }
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
            location: resolvedTemplateUrl || candidate.templateUrl || candidate.templatePath,
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
        location: resolvedTemplateUrl || candidate.templateUrl || candidate.templatePath,
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
    const localWorkspace = await syncLocalComfyWorkspaceToInstall(resolvedPaths.installPath);

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
    for (const workflowLibraryPath of resolvedPaths.workflowLibraryPaths) {
        if (!(await fileExists(workflowLibraryPath))) {
            warnings.push(
                `Configured workflow folder is not readable from this app runtime: ${workflowLibraryPath}. `
                + 'Mount the folder into Docker if you want the app to scan host-side workflow JSON files.'
            );
        }
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
        customFolderWorkflows = await scanConfiguredWorkflowFolders(resolvedPaths.workflowLibraryPaths);
    } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'Failed to inspect the configured workflow folders.');
    }

    let nodeRepos: ComfyLibraryNodeRepo[] = [];
    try {
        nodeRepos = await scanNodeRepos(resolvedPaths.customNodesPath, resolvedPaths.workflowLibraryPaths);
    } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'Failed to inspect ComfyUI repositories.');
    }

    return {
        ...resolvedPaths,
        localWorkspace,
        serverTemplates,
        customFolderWorkflows,
        nodeRepos,
        warnings,
    };
};

export const buildComfyDiagnosticsSnapshot = async (
    connection: ComfyConnectionOptions,
    pathInput: ComfyLibraryPathsInput
): Promise<ComfyDiagnosticsSnapshot> => {
    const library = await buildComfyLibrarySnapshot(connection, pathInput);
    const transport = await resolveLibraryTransport(connection);
    const client = new ComfyUIClient(transport);

    const [features, systemStats, objectInfo, modelsPath] = await Promise.all([
        client.getFeaturesSnapshot(),
        client.getSystemStatsSnapshot(),
        client.getObjectInfoSnapshot(),
        resolveModelsPath(library.installPath),
    ]);

    const workflowLibraryPaths = library.workflowLibraryPaths || (library.workflowLibraryPath ? [library.workflowLibraryPath] : []);
    const workflowPathStatuses = workflowLibraryPaths.length > 0
        ? await Promise.all(workflowLibraryPaths.map((workflowLibraryPath, index) => buildPathStatus(
            workflowLibraryPaths.length > 1 ? `Workflow Folder ${index + 1}` : 'Workflow Folder',
            workflowLibraryPath,
            'Folder scanned for official or custom workflow JSON files.'
        )))
        : [await buildPathStatus('Workflow Folder', '', 'Folder scanned for official or custom workflow JSON files.')];

    const pathStatuses = [
        await buildPathStatus('Install Path', library.installPath, 'Configured ComfyUI install root used for repo updates.'),
        await buildPathStatus('Custom Nodes Path', library.customNodesPath, 'Folder scanned for installed custom node repositories.'),
        ...workflowPathStatuses,
        await buildPathStatus('Models Path', modelsPath, 'Expected root for checkpoints, LoRAs, VAEs, ControlNets, and other model assets.'),
    ];

    return {
        generatedAt: new Date().toISOString(),
        connection: {
            serverUrl: transport.baseUrl,
            transportKind: transport.kind,
            apiBasePath: transport.apiBasePath,
            historyPathBase: transport.historyPathBase,
        },
        paths: {
            modelsPath,
            statuses: pathStatuses,
        },
        runtime: {
            features,
            systemStats,
            nodeTypes: objectInfo ? Object.keys(objectInfo).sort((left, right) => left.localeCompare(right)) : [],
        },
        assets: collectAssetInventory(objectInfo),
        library,
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
        : (resolvedPaths.workflowLibraryPaths[0] || resolvedPaths.workflowLibraryPath);

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
        ...resolvedPaths.workflowLibraryPaths,
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
