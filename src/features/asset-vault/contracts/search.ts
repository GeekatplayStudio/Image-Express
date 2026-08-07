import { z } from 'zod';
import { BookcaseFilterSchema } from './bookcase';
import { VaultAssetRecordSchema } from './assetRecord';

export const VaultSearchModeSchema = z.enum(['keyword', 'smart']);
export type VaultSearchMode = z.infer<typeof VaultSearchModeSchema>;

export const VaultSearchRequestSchema = z.object({
    query: z.string().default(''),
    mode: VaultSearchModeSchema.default('keyword'),
    filter: BookcaseFilterSchema.optional(),
    limit: z.number().int().min(1).max(200).default(60),
});

export type VaultSearchRequest = z.infer<typeof VaultSearchRequestSchema>;

export const VaultSearchResultSchema = z.object({
    asset: VaultAssetRecordSchema,
    score: z.number(),
    matchReasons: z.array(z.string()).default([]),
});

export type VaultSearchResult = z.infer<typeof VaultSearchResultSchema>;

export const VaultSearchEngineStatusSchema = z.object({
    ollamaRunning: z.boolean(),
    embedModel: z.string(),
    /** True when the query itself was semantically embedded (not hash fallback). */
    semanticQuery: z.boolean(),
    /** Assets still waiting for a real embedding (backfilled a batch per search). */
    pendingSemantic: z.number(),
});

export type VaultSearchEngineStatus = z.infer<typeof VaultSearchEngineStatusSchema>;

export const VaultSearchResponseSchema = z.object({
    success: z.literal(true),
    results: z.array(VaultSearchResultSchema),
    total: z.number(),
    query: z.string(),
    expandedTerms: z.array(z.string()).optional(),
    engine: VaultSearchEngineStatusSchema.optional(),
});

export type VaultSearchResponse = z.infer<typeof VaultSearchResponseSchema>;

export const VaultStatusResponseSchema = z.object({
    success: z.literal(true),
    assetCount: z.number(),
    lastSyncAt: z.string().nullable(),
    indexing: z.boolean(),
    bookcases: z.number(),
});

export type VaultStatusResponse = z.infer<typeof VaultStatusResponseSchema>;
