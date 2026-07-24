import { readGenerateJob } from '@/lib/agentic-edit/jobs';
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

    return jsonWithRequestId(request, {
        id: job.state.id,
        status: job.state.status,
        progress: job.state.progress,
        message: job.state.message,
        error: job.state.error,
        createdAt: job.state.createdAt,
        updatedAt: job.state.updatedAt,
        resultImageUrl: job.state.resultImageUrl,
    });
}
