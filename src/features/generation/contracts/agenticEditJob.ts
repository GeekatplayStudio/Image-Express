import { z } from 'zod';

export const GENERATE_JOB_ID_PATTERN = /^job_[0-9a-f-]{36}$/i;

export const GenerateJobIdSchema = z.string().regex(
    GENERATE_JOB_ID_PATTERN,
    'Invalid generation job identifier.',
);

export const QueueGenerateJobResponseSchema = z.object({
    job_id: GenerateJobIdSchema,
});

export const GenerateJobStatusSchema = z.object({
    id: GenerateJobIdSchema,
    status: z.enum(['queued', 'running', 'succeeded', 'failed']),
    progress: z.number().min(0).max(1),
    message: z.string(),
    error: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    resultImageUrl: z.string().optional(),
});

export const GenerateJobResultSchema = z.object({
    imageUrl: z.string().min(1),
    meta: z.record(z.string(), z.unknown()),
});

export const PublicApiErrorSchema = z.object({
    error: z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        retryable: z.boolean(),
        requestId: z.string().min(1),
    }),
    // Transitional compatibility for UI code that still reads `message`.
    message: z.string().min(1),
});

export type GenerateJobStatus = z.infer<typeof GenerateJobStatusSchema>;
export type GenerateJobResult = z.infer<typeof GenerateJobResultSchema>;

export function isGenerateJobId(value: string): boolean {
    return GenerateJobIdSchema.safeParse(value).success;
}
