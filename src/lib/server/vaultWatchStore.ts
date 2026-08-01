import path from 'node:path';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { getVaultDir } from '@/lib/server/appPaths';
import {
    WatchRootStoreSchema,
    type WatchRoot,
    type WatchRootStore,
    VAULT_INDEX_EXTENSIONS,
} from '@/features/asset-vault/contracts/watchRoot';
import type { VectorRecord } from '@/features/asset-vault/domain/vectorMath';

const ROOTS_PATH = () => path.join(getVaultDir(), 'watch-roots.json');
const VECTORS_PATH = () => path.join(getVaultDir(), 'vectors.json');

async function atomicWriteJson(filePath: string, data: unknown) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function readWatchRootStore(): Promise<WatchRootStore> {
    try {
        const raw = await readFile(ROOTS_PATH(), 'utf8');
        const parsed = WatchRootStoreSchema.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;
    } catch (error) {
        const maybeErr = error as NodeJS.ErrnoException;
        if (maybeErr.code !== 'ENOENT') console.error('Failed reading watch roots:', error);
    }
    return { version: 1, roots: [] };
}

export async function writeWatchRootStore(store: WatchRootStore): Promise<void> {
    await atomicWriteJson(ROOTS_PATH(), store);
}

export async function upsertWatchRoot(root: WatchRoot): Promise<WatchRootStore> {
    const store = await readWatchRootStore();
    const nextRoots = store.roots.filter((entry) => entry.id !== root.id);
    nextRoots.push(root);
    const next = { version: 1 as const, roots: nextRoots };
    await writeWatchRootStore(next);
    return next;
}

export async function removeWatchRoot(rootId: string): Promise<WatchRootStore> {
    const store = await readWatchRootStore();
    const next = { version: 1 as const, roots: store.roots.filter((entry) => entry.id !== rootId) };
    await writeWatchRootStore(next);
    return next;
}

export async function readVectorStore(): Promise<VectorRecord[]> {
    try {
        const raw = await readFile(VECTORS_PATH(), 'utf8');
        const parsed = JSON.parse(raw) as { vectors?: VectorRecord[] };
        return Array.isArray(parsed.vectors) ? parsed.vectors : [];
    } catch (error) {
        const maybeErr = error as NodeJS.ErrnoException;
        if (maybeErr.code !== 'ENOENT') console.error('Failed reading vector store:', error);
        return [];
    }
}

export async function writeVectorStore(vectors: VectorRecord[]): Promise<void> {
    await atomicWriteJson(VECTORS_PATH(), { version: 1, updatedAt: new Date().toISOString(), vectors });
}

const DEFAULT_EXTENSIONS = new Set(VAULT_INDEX_EXTENSIONS.map((ext) => ext.toLowerCase()));

export async function scanDirectoryRecursive(
    rootPath: string,
    options?: { maxFiles?: number },
): Promise<Array<{
    absolutePath: string;
    relativePath: string;
    name: string;
    sizeBytes: number;
    modifiedAt: string;
}>> {
    const maxFiles = options?.maxFiles ?? 5000;
    const results: Array<{
        absolutePath: string;
        relativePath: string;
        name: string;
        sizeBytes: number;
        modifiedAt: string;
    }> = [];

    async function walk(current: string, relative: string) {
        if (results.length >= maxFiles) return;
        let entries;
        try {
            entries = await readdir(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (results.length >= maxFiles) return;
            const name = entry.name;
            if (name.startsWith('.')) continue;
            const lower = name.toLowerCase();
            if (lower === 'node_modules' || lower === '.git' || lower === 'system volume information') continue;
            const absolutePath = path.join(current, name);
            const relativePath = relative ? path.join(relative, name) : name;
            if (entry.isDirectory()) {
                await walk(absolutePath, relativePath);
                continue;
            }
            if (!entry.isFile()) continue;
            const dot = lower.lastIndexOf('.');
            const ext = dot >= 0 ? lower.slice(dot) : '';
            if (!DEFAULT_EXTENSIONS.has(ext)) continue;
            try {
                const fileStat = await stat(absolutePath);
                results.push({
                    absolutePath,
                    relativePath: relativePath.replace(/\\/g, '/'),
                    name,
                    sizeBytes: fileStat.size,
                    modifiedAt: fileStat.mtime.toISOString(),
                });
            } catch {
                // skip unreadable
            }
        }
    }

    await walk(rootPath, '');
    return results;
}
