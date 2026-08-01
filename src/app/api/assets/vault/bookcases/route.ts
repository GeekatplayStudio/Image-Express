import { jsonWithRequestId, parseJsonRequest, apiError } from '@/lib/server/apiContract';
import { readBookcaseStore, writeBookcaseStore } from '@/lib/server/vault-store';
import { BookcaseSchema } from '@/features/asset-vault/contracts/bookcase';
import { z } from 'zod';

export async function GET(request: Request) {
    const store = await readBookcaseStore();
    return jsonWithRequestId(request, {
        success: true as const,
        bookcases: store.bookcases,
    });
}

const CreateBookcaseSchema = BookcaseSchema.pick({
    name: true,
    kind: true,
    filter: true,
    manualAssetIds: true,
    parentId: true,
}).extend({
    id: z.string().optional(),
});

export async function POST(request: Request) {
    try {
        const payload = await parseJsonRequest(request, CreateBookcaseSchema, 16_384);
        const store = await readBookcaseStore();
        const now = new Date().toISOString();
        const id = payload.id || `bc_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`;
        const bookcase = {
            id,
            name: payload.name,
            kind: payload.kind,
            filter: payload.filter,
            manualAssetIds: payload.manualAssetIds,
            parentId: payload.parentId,
            createdAt: now,
            updatedAt: now,
        };
        const next = {
            version: 1 as const,
            bookcases: [...store.bookcases.filter((entry) => entry.id !== id), bookcase],
        };
        await writeBookcaseStore(next);
        return jsonWithRequestId(request, {
            success: true as const,
            bookcases: next.bookcases,
            bookcase,
        });
    } catch (error) {
        console.error('Create bookcase failed:', error);
        return apiError(request, {
            code: 'bookcase_create_failed',
            message: 'Failed to create bookcase.',
            status: 500,
            retryable: true,
        });
    }
}
