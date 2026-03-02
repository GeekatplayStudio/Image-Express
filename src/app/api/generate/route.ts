import { NextResponse } from 'next/server';
import { createGenerateJob, processGenerateJob } from '@/lib/agentic-edit/jobs';
import type { AnnotationDocument } from '@/lib/agentic-edit/types';

export const runtime = 'nodejs';

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
        const form = await request.formData();

        const original = form.get('original');
        if (!(original instanceof File)) {
            return NextResponse.json({ message: 'Missing original file' }, { status: 400 });
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
                return NextResponse.json({ message: 'Missing notes_overlay file for annotated edit request' }, { status: 400 });
            }

            if (!(combinedMask instanceof File)) {
                return NextResponse.json({ message: 'Missing combined_mask file for annotated edit request' }, { status: 400 });
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

        return NextResponse.json({ job_id: state.id });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to queue generate job';
        return NextResponse.json({ message }, { status: 500 });
    }
}
