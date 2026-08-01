import { z } from 'zod';

export const WatchRootSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** Absolute path or granted web directory name */
    rootUri: z.string().min(1),
    connector: z.enum(['local', 'network']).default('local'),
    enabled: z.boolean().default(true),
    recursive: z.boolean().default(true),
    includeGlobs: z.array(z.string()).default([]),
    excludeGlobs: z.array(z.string()).default([]),
    lastScanAt: z.string().optional(),
    lastScanStatus: z.enum(['idle', 'scanning', 'error', 'ready']).optional(),
    estimatedFileCount: z.number().int().nonnegative().optional(),
    lastError: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type WatchRoot = z.infer<typeof WatchRootSchema>;

export const WatchRootStoreSchema = z.object({
    version: z.literal(1),
    roots: z.array(WatchRootSchema),
});

export type WatchRootStore = z.infer<typeof WatchRootStoreSchema>;

export const ScannedFileSchema = z.object({
    absolutePath: z.string(),
    relativePath: z.string(),
    name: z.string(),
    sizeBytes: z.number().nonnegative(),
    modifiedAt: z.string(),
    mimeType: z.string().optional(),
});

export type ScannedFile = z.infer<typeof ScannedFileSchema>;

/** Broad creative-media extensions the vault indexes by default. */
export const VAULT_INDEX_EXTENSIONS = [
    // images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg', '.ico', '.heic', '.avif', '.exr', '.hdr',
    // video
    '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv', '.wmv',
    // audio
    '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.oga', '.aiff',
    // 3d
    '.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply', '.usd', '.usda', '.usdc', '.usdz', '.blend',
    // design / docs that creatives drop into asset folders
    '.pdf', '.psd', '.ai', '.eps', '.svgz',
] as const;
