import { z } from 'zod';

export const VaultConnectorSchema = z.enum([
    'local',
    'network',
    'google-drive',
    'server',
    'indexeddb-legacy',
]);

export type VaultConnector = z.infer<typeof VaultConnectorSchema>;

export const VaultAssetTypeSchema = z.enum(['images', 'videos', 'audio', 'models']);
export type VaultAssetType = z.infer<typeof VaultAssetTypeSchema>;

export const VaultAssetCategorySchema = z.enum(['uploads', 'generated']);
export type VaultAssetCategory = z.infer<typeof VaultAssetCategorySchema>;

export const AssetOriginSchema = z.object({
    connector: VaultConnectorSchema,
    uri: z.string().min(1),
    displayPath: z.string().min(1),
    watchRootId: z.string().optional(),
    /** Classic library storage id when bridged from legacy store */
    legacyId: z.string().optional(),
});

export type AssetOrigin = z.infer<typeof AssetOriginSchema>;

export const VaultAssetRecordSchema = z.object({
    id: z.string().min(1),
    contentHash: z.string().optional(),
    name: z.string().min(1),
    mimeType: z.string().default('application/octet-stream'),
    type: VaultAssetTypeSchema,
    category: VaultAssetCategorySchema.default('uploads'),
    sizeBytes: z.number().nonnegative().default(0),
    origin: AssetOriginSchema,
    aliases: z.array(AssetOriginSchema).default([]),
    createdAt: z.string(),
    modifiedAt: z.string(),
    capturedAt: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    prompt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    durationMs: z.number().optional(),
    indexedAt: z.string().optional(),
    aiIndexed: z.boolean().optional(),
    embeddingModel: z.string().optional(),
    owner: z.string().optional(),
    isPublic: z.boolean().default(false),
    /** Served URL or API path for preview */
    previewUrl: z.string().optional(),
});

export type VaultAssetRecord = z.infer<typeof VaultAssetRecordSchema>;

export const VaultCatalogSchema = z.object({
    version: z.literal(1),
    updatedAt: z.string(),
    assets: z.array(VaultAssetRecordSchema),
});

export type VaultCatalog = z.infer<typeof VaultCatalogSchema>;
