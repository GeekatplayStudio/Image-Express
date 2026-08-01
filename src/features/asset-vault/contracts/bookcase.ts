import { z } from 'zod';
import { VaultAssetTypeSchema } from './assetRecord';

export const BookcaseKindSchema = z.enum([
    'manual',
    'type',
    'timeline',
    'event',
    'project',
    'location',
    'smart-cluster',
    'search-result',
    'all',
]);

export type BookcaseKind = z.infer<typeof BookcaseKindSchema>;

export const BookcaseFilterSchema = z.object({
    type: VaultAssetTypeSchema.optional(),
    category: z.enum(['uploads', 'generated']).optional(),
    connector: z.enum(['local', 'network', 'google-drive', 'server', 'indexeddb-legacy']).optional(),
    owner: z.string().optional(),
    isPublic: z.boolean().optional(),
    query: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
});

export type BookcaseFilter = z.infer<typeof BookcaseFilterSchema>;

export const BookcaseSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: BookcaseKindSchema,
    icon: z.string().optional(),
    color: z.string().optional(),
    parentId: z.string().optional(),
    filter: BookcaseFilterSchema.optional(),
    manualAssetIds: z.array(z.string()).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type Bookcase = z.infer<typeof BookcaseSchema>;

export const BookcaseStoreSchema = z.object({
    version: z.literal(1),
    bookcases: z.array(BookcaseSchema),
});

export type BookcaseStore = z.infer<typeof BookcaseStoreSchema>;

export const DEFAULT_BOOKCASES: Bookcase[] = [
    {
        id: 'bc_all',
        name: 'All Assets',
        kind: 'all',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'bc_images',
        name: 'Photos',
        kind: 'type',
        filter: { type: 'images' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'bc_videos',
        name: 'Videos',
        kind: 'type',
        filter: { type: 'videos' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'bc_audio',
        name: 'Audio',
        kind: 'type',
        filter: { type: 'audio' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'bc_models',
        name: '3D Models',
        kind: 'type',
        filter: { type: 'models' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'bc_generated',
        name: 'Generated',
        kind: 'type',
        filter: { type: 'images', category: 'generated' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'bc_drive',
        name: 'Google Drive',
        kind: 'location',
        filter: { connector: 'google-drive' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'bc_local_drives',
        name: 'Indexed Drives',
        kind: 'location',
        filter: { connector: 'local' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'bc_timeline',
        name: 'Timeline',
        kind: 'timeline',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
];
