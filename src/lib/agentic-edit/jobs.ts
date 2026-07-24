import { promises as fs } from 'fs';
import path from 'path';
import { resolveModelProvider } from '@/lib/agentic-edit/providers';
import type { AnnotationDocument, GenerateJobState } from '@/lib/agentic-edit/types';
import { getAssetsDir, getDataDir } from '@/lib/server/appPaths';
import { isGenerateJobId } from '@/features/generation/contracts/agenticEditJob';

interface StoredReferenceFile {
    id: string;
    role: string;
    path: string;
    name: string;
}

interface StoredGenerateJob {
    schemaVersion: 1;
    state: GenerateJobState;
    files: {
        originalPath: string;
        combinedMaskPath?: string;
        poseHintPath?: string;
        notesOverlayPath?: string;
        annotationJsonPath: string;
        promptPath: string;
        references: StoredReferenceFile[];
    };
    provider: {
        name: string;
        model: string;
        params: Record<string, unknown>;
    };
    prompts: {
        positive: string;
        negative: string;
    };
    annotationDocument: AnnotationDocument;
    output?: {
        imagePath: string;
        imageUrl: string;
        meta: Record<string, unknown>;
    };
}

const dataRoot = getDataDir();
const jobsDir = path.join(dataRoot, 'ai-jobs');
const uploadsDir = path.join(jobsDir, 'uploads');
const revisionsDir = path.join(dataRoot, 'ai-revisions');
const outputDir = path.join(getAssetsDir(), 'generated', 'images');
const DEFAULT_OLD_JOB_RETENTION_MS = 6 * 60 * 60 * 1000;
const runtimeProviderParams = new Map<string, Record<string, unknown>>();
const SENSITIVE_PARAMETER_PATTERN = /(api.?key|authorization|bearer|password|secret|token)/i;

const ensureDirs = async () => {
    await fs.mkdir(jobsDir, { recursive: true });
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(revisionsDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
};

const jobFilePath = (jobId: string) => {
    if (!isGenerateJobId(jobId)) {
        throw new Error('Invalid generation job identifier.');
    }
    return path.join(jobsDir, `${jobId}.json`);
};

const nowIso = () => new Date().toISOString();

const writeJson = async (targetPath: string, value: unknown) => {
    const temporaryPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf-8');
        await fs.rename(temporaryPath, targetPath);
    } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
    }
};

export const readGenerateJob = async (jobId: string): Promise<StoredGenerateJob | null> => {
    if (!isGenerateJobId(jobId)) {
        return null;
    }
    try {
        const raw = await fs.readFile(jobFilePath(jobId), 'utf-8');
        return JSON.parse(raw) as StoredGenerateJob;
    } catch {
        return null;
    }
};

const persistGenerateJob = async (job: StoredGenerateJob): Promise<void> => {
    await writeJson(jobFilePath(job.state.id), job);
};

const updateState = async (
    jobId: string,
    patch: Partial<GenerateJobState>
): Promise<StoredGenerateJob | null> => {
    const job = await readGenerateJob(jobId);
    if (!job) {
        return null;
    }

    job.state = {
        ...job.state,
        ...patch,
        updatedAt: nowIso(),
    };
    await persistGenerateJob(job);
    return job;
};

const saveBuffer = async (targetPath: string, buffer: Buffer) => {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);
};

const removeFileIfExists = async (targetPath?: string) => {
    if (!targetPath) {
        return;
    }

    try {
        await fs.unlink(targetPath);
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code !== 'ENOENT') {
            throw error;
        }
    }
};

const toBuffer = async (file: File): Promise<Buffer> => {
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
};

const safeExt = (filename: string, fallback = '.bin'): string => {
    const ext = path.extname(filename || '').toLowerCase();
    if (!ext || ext.length > 12) return fallback;
    return ext;
};

const safeFilenameSegment = (value: string, fallback: string): string => {
    const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
    return normalized || fallback;
};

const redactSensitiveParameters = (
    value: Record<string, unknown>,
): Record<string, unknown> => Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
        if (SENSITIVE_PARAMETER_PATTERN.test(key)) {
            return [key, '[redacted]'];
        }
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            return [key, redactSensitiveParameters(entry as Record<string, unknown>)];
        }
        return [key, entry];
    }),
);

const isTerminalJobStatus = (status: GenerateJobState['status']): boolean => (
    status === 'succeeded' || status === 'failed'
);

const createRevisionRecord = async (job: StoredGenerateJob) => {
    if (!job.output) return;

    const revision = {
        schemaVersion: 1,
        id: `rev_${job.state.id}`,
        originalImageId: job.annotationDocument.image.id,
        annotationJson: job.annotationDocument,
        derivedPrompt: {
            positive: job.prompts.positive,
            negative: job.prompts.negative,
        },
        provider: {
            ...job.provider,
            meta: job.output.meta,
        },
        outputImageId: path.basename(job.output.imagePath),
        outputImageUrl: job.output.imageUrl,
        timestamps: {
            createdAt: job.state.createdAt,
            completedAt: job.state.updatedAt,
        },
    };

    await writeJson(path.join(revisionsDir, `${job.state.id}.json`), revision);
};

export interface CreateGenerateJobInput {
    original: File;
    annotationsJson: AnnotationDocument;
    promptPositive: string;
    promptNegative: string;
    providerName: string;
    providerModel: string;
    providerParams: Record<string, unknown>;
    combinedMask?: File | null;
    poseHint?: File | null;
    notesOverlay?: File | null;
    references: Array<{ id: string; role: string; file: File }>;
}

export const cleanupOldGenerateJobs = async (retentionMs = DEFAULT_OLD_JOB_RETENTION_MS): Promise<number> => {
    await ensureDirs();

    const now = Date.now();
    const removedIds: string[] = [];
    const jobFiles = await fs.readdir(jobsDir);

    for (const entry of jobFiles) {
        const jobMatch = /^job_[0-9a-f-]+\.json$/i.test(entry);
        if (!jobMatch) {
            continue;
        }

        const fullPath = path.join(jobsDir, entry);
        let shouldDeleteRecordOnly = false;
        let parsedJob: StoredGenerateJob | null = null;

        try {
            const raw = await fs.readFile(fullPath, 'utf-8');
            parsedJob = JSON.parse(raw) as StoredGenerateJob;
        } catch {
            shouldDeleteRecordOnly = true;
        }

        if (shouldDeleteRecordOnly) {
            await removeFileIfExists(fullPath);
            continue;
        }

        if (!parsedJob) {
            continue;
        }

        const updatedAt = Date.parse(parsedJob.state.updatedAt || parsedJob.state.createdAt || '');
        const ageMs = Number.isFinite(updatedAt) ? Math.max(0, now - updatedAt) : Number.MAX_SAFE_INTEGER;

        if (!isTerminalJobStatus(parsedJob.state.status) || ageMs < retentionMs) {
            continue;
        }

        const jobId = parsedJob.state.id;
        await cleanupGenerateJobArtifacts(jobId, {
            removeJobRecord: true,
            removeUploads: true,
            removeRevisionRecord: true,
        });
        removedIds.push(jobId);
    }

    const remainingJobJson = await fs.readdir(jobsDir);
    const remainingIds = new Set(
        remainingJobJson
            .filter((entry) => /^job_[0-9a-f-]+\.json$/i.test(entry))
            .map((entry) => entry.replace(/\.json$/i, ''))
    );

    const uploadEntries = await fs.readdir(uploadsDir);
    for (const uploadEntry of uploadEntries) {
        const idMatch = uploadEntry.match(/^(job_[0-9a-f-]+)-/i);
        if (!idMatch) {
            continue;
        }

        const jobId = idMatch[1];
        if (remainingIds.has(jobId)) {
            continue;
        }

        const uploadPath = path.join(uploadsDir, uploadEntry);
        let shouldDelete = true;
        try {
            const stats = await fs.stat(uploadPath);
            const ageMs = now - stats.mtimeMs;
            shouldDelete = ageMs >= retentionMs;
        } catch {
            shouldDelete = true;
        }

        if (shouldDelete) {
            await removeFileIfExists(uploadPath);
        }
    }

    return removedIds.length;
};

export const createGenerateJob = async (input: CreateGenerateJobInput): Promise<GenerateJobState> => {
    await ensureDirs();
    await cleanupOldGenerateJobs();

    const jobId = `job_${crypto.randomUUID()}`;
    const createdAt = nowIso();

    const originalExt = safeExt(input.original.name, '.png');
    const originalPath = path.join(uploadsDir, `${jobId}-original${originalExt}`);
    await saveBuffer(originalPath, await toBuffer(input.original));

    let combinedMaskPath: string | undefined;
    if (input.combinedMask) {
        const maskExt = safeExt(input.combinedMask.name, '.png');
        combinedMaskPath = path.join(uploadsDir, `${jobId}-combined-mask${maskExt}`);
        await saveBuffer(combinedMaskPath, await toBuffer(input.combinedMask));
    }

    let poseHintPath: string | undefined;
    if (input.poseHint) {
        const poseExt = safeExt(input.poseHint.name, '.png');
        poseHintPath = path.join(uploadsDir, `${jobId}-pose-hint${poseExt}`);
        await saveBuffer(poseHintPath, await toBuffer(input.poseHint));
    }

    let notesOverlayPath: string | undefined;
    if (input.notesOverlay) {
        const overlayExt = safeExt(input.notesOverlay.name, '.png');
        notesOverlayPath = path.join(uploadsDir, `${jobId}-notes-overlay${overlayExt}`);
        await saveBuffer(notesOverlayPath, await toBuffer(input.notesOverlay));
    }

    const refs: StoredReferenceFile[] = [];
    for (const [index, reference] of input.references.entries()) {
        const ext = safeExt(reference.file.name, '.png');
        const referenceId = safeFilenameSegment(reference.id, `reference-${index + 1}`);
        const refPath = path.join(uploadsDir, `${jobId}-ref-${referenceId}${ext}`);
        await saveBuffer(refPath, await toBuffer(reference.file));
        refs.push({
            id: referenceId,
            role: reference.role,
            path: refPath,
            name: reference.file.name,
        });
    }

    const annotationJsonPath = path.join(uploadsDir, `${jobId}-annotations.json`);
    const promptPath = path.join(uploadsDir, `${jobId}-prompt.txt`);
    await writeJson(annotationJsonPath, input.annotationsJson);
    await fs.writeFile(
        promptPath,
        `POSITIVE\n${input.promptPositive}\n\nNEGATIVE\n${input.promptNegative}\n`,
        'utf-8'
    );

    const state: GenerateJobState = {
        id: jobId,
        status: 'queued',
        progress: 0,
        message: 'Queued',
        createdAt,
        updatedAt: createdAt,
    };

    const job: StoredGenerateJob = {
        schemaVersion: 1,
        state,
        files: {
            originalPath,
            combinedMaskPath,
            poseHintPath,
            notesOverlayPath,
            annotationJsonPath,
            promptPath,
            references: refs,
        },
        provider: {
            name: input.providerName,
            model: input.providerModel,
            params: redactSensitiveParameters(input.providerParams),
        },
        prompts: {
            positive: input.promptPositive,
            negative: input.promptNegative,
        },
        annotationDocument: input.annotationsJson,
    };

    runtimeProviderParams.set(jobId, input.providerParams);
    await persistGenerateJob(job);
    return state;
};

export const processGenerateJob = async (jobId: string): Promise<void> => {
    const existing = await readGenerateJob(jobId);
    if (!existing) {
        return;
    }

    try {
        await updateState(jobId, { status: 'running', progress: 0.12, message: 'Loading input assets...' });
        const job = await readGenerateJob(jobId);
        if (!job) return;

        const originalImage = await fs.readFile(job.files.originalPath);
        const notesOverlay = job.files.notesOverlayPath ? await fs.readFile(job.files.notesOverlayPath) : undefined;
        const maskImage = job.files.combinedMaskPath ? await fs.readFile(job.files.combinedMaskPath) : undefined;
        const poseHint = job.files.poseHintPath ? await fs.readFile(job.files.poseHintPath) : undefined;
        const references = await Promise.all(job.files.references.map(async (reference) => ({
            role: reference.role,
            image: await fs.readFile(reference.path),
        })));

        await updateState(jobId, { progress: 0.42, message: 'Running model provider...' });
        const provider = resolveModelProvider(job.provider.name);

        const providerResult = await provider.generate({
            originalImage,
            notesOverlay,
            maskImage,
            poseHint,
            references,
            promptPositive: job.prompts.positive,
            promptNegative: job.prompts.negative,
            params: {
                ...(runtimeProviderParams.get(jobId) ?? job.provider.params),
                model: job.provider.model,
            },
        });

        await updateState(jobId, { progress: 0.82, message: 'Saving output revision...' });

        const outputName = `${jobId}-output.png`;
        const outputPath = path.join(outputDir, outputName);
        await saveBuffer(outputPath, providerResult.outputImage);

        const imageUrl = `/api/assets/serve/generated/images/${encodeURIComponent(outputName)}`;
        const latest = await readGenerateJob(jobId);
        if (!latest) return;

        latest.output = {
            imagePath: outputPath,
            imageUrl,
            meta: providerResult.meta,
        };
        latest.state = {
            ...latest.state,
            status: 'succeeded',
            progress: 1,
            message: 'Completed',
            updatedAt: nowIso(),
            resultImageUrl: imageUrl,
        };

        await persistGenerateJob(latest);
        await createRevisionRecord(latest);
        await cleanupGenerateJobArtifacts(jobId, {
            removeJobRecord: false,
            removeUploads: true,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown job error';
        await updateState(jobId, {
            status: 'failed',
            progress: 1,
            message: 'Failed',
            error: message,
        });
        await cleanupGenerateJobArtifacts(jobId, {
            removeJobRecord: false,
            removeUploads: true,
        });
    } finally {
        runtimeProviderParams.delete(jobId);
    }
};

export const cleanupGenerateJobArtifacts = async (
    jobId: string,
    options?: {
        removeJobRecord?: boolean;
        removeUploads?: boolean;
        removeOutput?: boolean;
        removeRevisionRecord?: boolean;
    }
): Promise<void> => {
    if (!isGenerateJobId(jobId)) {
        return;
    }
    const removeJobRecord = options?.removeJobRecord ?? true;
    const removeUploads = options?.removeUploads ?? true;
    const removeOutput = options?.removeOutput ?? false;
    const removeRevisionRecord = options?.removeRevisionRecord ?? false;

    const job = await readGenerateJob(jobId);

    if (removeUploads && job) {
        await removeFileIfExists(job.files.originalPath);
        await removeFileIfExists(job.files.combinedMaskPath);
        await removeFileIfExists(job.files.poseHintPath);
        await removeFileIfExists(job.files.notesOverlayPath);
        await removeFileIfExists(job.files.annotationJsonPath);
        await removeFileIfExists(job.files.promptPath);
        await Promise.all(job.files.references.map((reference) => removeFileIfExists(reference.path)));
    }

    if (removeOutput && job?.output?.imagePath) {
        await removeFileIfExists(job.output.imagePath);
    }

    if (removeRevisionRecord) {
        await removeFileIfExists(path.join(revisionsDir, `${jobId}.json`));
    }

    if (removeJobRecord) {
        await removeFileIfExists(jobFilePath(jobId));
    }
};
