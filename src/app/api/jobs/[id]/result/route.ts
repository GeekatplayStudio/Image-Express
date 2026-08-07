import { cleanupGenerateJobArtifacts, readGenerateJob } from '@/lib/agentic-edit/jobs';
import { GenerateJobIdSchema } from '@/features/generation/contracts/agenticEditJob';
import { apiError, jsonWithRequestId } from '@/lib/server/apiContract';

export const runtime = 'nodejs';

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    if (!GenerateJobIdSchema.safeParse(id).success) {
        return apiError(request, {
            code: 'invalid_job_id',
            message: 'Invalid generation job identifier.',
            status: 400,
        });
    }
    const job = await readGenerateJob(id);
    if (!job) {
        return apiError(request, {
            code: 'job_not_found',
            message: 'Generation job was not found.',
            status: 404,
        });
    }

    if (job.state.status !== 'succeeded' || !job.output) {
        return apiError(request, {
            code: 'job_not_completed',
            message: 'Generation job is not completed yet.',
            status: 409,
            retryable: true,
        });
    }

    const responsePayload = {
        imageUrl: job.output.imageUrl,
        meta: job.output.meta,
    };

    // Retrieval is non-destructive: the job record (and its stable result
    // URL) survives reloads and repeat fetches. Uploads are transient inputs
    // and can go; the record itself is garbage-collected by retention later.
    try {
        await cleanupGenerateJobArtifacts(id, {
            removeJobRecord: false,
            removeUploads: true,
        });
    } catch {
        // best-effort cleanup
    }

    return jsonWithRequestId(request, responsePayload);
}
