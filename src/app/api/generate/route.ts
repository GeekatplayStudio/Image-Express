import { createGenerateJob, processGenerateJob } from '@/lib/agentic-edit/jobs';
import type { AnnotationDocument } from '@/lib/agentic-edit/types';
import {
    ApiRequestError,
    assertRequestContentLength,
    jsonWithRequestId,
    toApiErrorResponse,
} from '@/lib/server/apiContract';

export const runtime = 'nodejs';
const MAX_GENERATE_REQUEST_BYTES = 64 * 1024 * 1024;

const asString = (value: FormDataEntryValue | null): string => (
    typeof value === 'string' ? value : ''
);

const parseJson = <T>(value: string, fallback: T): T => {
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

export async function POST(request: Request) {
    try {
        assertRequestContentLength(request, MAX_GENERATE_REQUEST_BYTES);
        const form = await request.formData();
        const parsedSize = Array.from(form.values()).reduce((total, entry) => (
            total + (entry instanceof File ? entry.size : Buffer.byteLength(entry, 'utf8'))
        ), 0);
        if (parsedSize > MAX_GENERATE_REQUEST_BYTES) {
            throw new ApiRequestError(
                'request_too_large',
                'Generation request exceeds the 64 MB limit.',
                413,
            );
        }

        const original = form.get('original');
        if (!(original instanceof File)) {
            throw new ApiRequestError(
                'original_file_required',
                'Missing original file.',
                400,
            );
        }

        const annotationsRaw = asString(form.get('annotations_json'));
        const annotationsJson = parseJson<AnnotationDocument>(annotationsRaw, {
            image: { id: `img_${Date.now()}`, width: 0, height: 0 },
            annotations: [],
            globalPrompt: { positive: '', negative: '' },
            references: [],
            provider: { name: 'mock', model: 'mock-v1', params: {} },
        });

        const promptPositive = asString(form.get('prompt_positive'));
        const promptNegative = asString(form.get('prompt_negative'));
        const providerName = asString(form.get('provider_name')) || annotationsJson.provider.name || 'mock';
        const providerModel = asString(form.get('provider_model')) || annotationsJson.provider.model || 'mock-v1';
        const parsedProviderParams = parseJson<Record<string, unknown>>(asString(form.get('provider_params')), annotationsJson.provider.params || {});
        const additionalNotesText = asString(form.get('additional_notes_text'));
        const additionalNotesJson = parseJson<Array<Record<string, unknown>>>(asString(form.get('additional_notes_json')), []);

        const combinedMask = form.get('combined_mask');
        const poseHint = form.get('pose_hint');
        const notesOverlay = form.get('notes_overlay');
        const embeddedNotesImage = form.get('embedded_notes_image');

        const providerParams: Record<string, unknown> = {
            ...parsedProviderParams,
            additionalNotesText,
            additionalNotes: additionalNotesJson,
        };

        const hasAnnotationNotes = Array.isArray(annotationsJson.annotations) && annotationsJson.annotations.length > 0;
        if (hasAnnotationNotes) {
            const hasNotesOverlayFile = notesOverlay instanceof File || embeddedNotesImage instanceof File;
            if (!hasNotesOverlayFile) {
                throw new ApiRequestError(
                    'notes_overlay_required',
                    'Missing notes overlay for annotated edit request.',
                    400,
                );
            }

            if (!(combinedMask instanceof File)) {
                throw new ApiRequestError(
                    'combined_mask_required',
                    'Missing combined mask for annotated edit request.',
                    400,
                );
            }
        }

        const refRoleMap = parseJson<Array<{ id: string; role: string }>>(asString(form.get('references_meta')), []);
        const referenceFiles = form.getAll('references[]').filter((entry): entry is File => entry instanceof File);
        const references = referenceFiles.map((file, index) => {
            const fallbackId = `ref_${index + 1}`;
            const roleRecord = refRoleMap[index];
            return {
                id: roleRecord?.id || fallbackId,
                role: roleRecord?.role || 'style',
                file,
            };
        });

        const state = await createGenerateJob({
            original,
            annotationsJson,
            promptPositive,
            promptNegative,
            providerName,
            providerModel,
            providerParams,
            combinedMask: combinedMask instanceof File ? combinedMask : null,
            poseHint: poseHint instanceof File ? poseHint : null,
            notesOverlay: notesOverlay instanceof File
                ? notesOverlay
                : (embeddedNotesImage instanceof File ? embeddedNotesImage : null),
            references,
        });

        void processGenerateJob(state.id);

        return jsonWithRequestId(request, { job_id: state.id }, { status: 202 });
    } catch (error) {
        return toApiErrorResponse(request, error, {
            code: 'generate_queue_failed',
            message: 'Failed to queue generation job.',
            status: 500,
            retryable: true,
        });
    }
}
