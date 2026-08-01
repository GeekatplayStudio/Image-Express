import { z } from 'zod';
import { parseJsonRequest, jsonWithRequestId, apiError } from '@/lib/server/apiContract';
import { enrichVaultCatalog } from '@/lib/server/vaultEnrichment';

const EnrichBodySchema = z.object({
    limit: z.number().int().min(1).max(24).default(12),
    caption: z.boolean().default(true),
    embed: z.boolean().default(true),
    onlyUncaptioned: z.boolean().default(true),
    assetIds: z.array(z.string()).optional(),
    ollamaBaseUrl: z.string().optional(),
});

export async function POST(request: Request) {
    try {
        const body = await parseJsonRequest(request, EnrichBodySchema, 32_768);
        const result = await enrichVaultCatalog(body);
        return jsonWithRequestId(request, {
            success: true as const,
            ...result,
        });
    } catch (error) {
        console.error('Vault enrich failed:', error);
        return apiError(request, {
            code: 'vault_enrich_failed',
            message: 'Failed to enrich vault assets with local AI.',
            status: 500,
            retryable: true,
        });
    }
}
