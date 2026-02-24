import path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';

export const VALID_ASSET_TYPES = ['images', 'models', 'videos', 'audio'] as const;
export const VALID_ASSET_CATEGORIES = ['uploads', 'generated'] as const;

export type AssetType = (typeof VALID_ASSET_TYPES)[number];
export type AssetCategory = (typeof VALID_ASSET_CATEGORIES)[number];

export interface AssetMetadataEntry {
    owner: string;
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
}

type AssetMetadataIndex = Record<string, AssetMetadataEntry>;

const ASSET_INDEX_PATH = path.join(process.cwd(), 'public', 'assets', 'asset-index.json');

const buildAssetKey = (category: AssetCategory, type: AssetType, name: string) => `${category}/${type}/${name}`;

const normalizeOwner = (owner?: string) => {
    const trimmed = owner?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : 'Guest';
};

const readIndex = async (): Promise<AssetMetadataIndex> => {
    try {
        const raw = await readFile(ASSET_INDEX_PATH, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        return parsed as AssetMetadataIndex;
    } catch (error) {
        const maybeErr = error as NodeJS.ErrnoException;
        if (maybeErr.code === 'ENOENT') {
            return {};
        }
        console.error('Failed reading asset metadata index:', error);
        return {};
    }
};

const writeIndex = async (index: AssetMetadataIndex) => {
    await mkdir(path.dirname(ASSET_INDEX_PATH), { recursive: true });
    await writeFile(ASSET_INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
};

export async function getAssetMetadata(category: AssetCategory, type: AssetType, name: string) {
    const index = await readIndex();
    return index[buildAssetKey(category, type, name)];
}

export async function getAssetMetadataByFolder(category: AssetCategory, type: AssetType) {
    const index = await readIndex();
    const prefix = `${category}/${type}/`;
    const result: Record<string, AssetMetadataEntry> = {};

    for (const [key, value] of Object.entries(index)) {
        if (!key.startsWith(prefix)) continue;
        const name = key.slice(prefix.length);
        result[name] = value;
    }

    return result;
}

export async function upsertAssetMetadata(params: {
    category: AssetCategory;
    type: AssetType;
    name: string;
    owner?: string;
    isPublic?: boolean;
}) {
    const { category, type, name, owner, isPublic } = params;
    const key = buildAssetKey(category, type, name);
    const index = await readIndex();
    const now = new Date().toISOString();
    const existing = index[key];

    const next: AssetMetadataEntry = {
        owner: normalizeOwner(owner ?? existing?.owner),
        isPublic: typeof isPublic === 'boolean' ? isPublic : (existing?.isPublic ?? false),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
    };

    index[key] = next;
    await writeIndex(index);
    return next;
}

export async function renameAssetMetadata(
    category: AssetCategory,
    type: AssetType,
    oldName: string,
    newName: string
) {
    const index = await readIndex();
    const from = buildAssetKey(category, type, oldName);
    const to = buildAssetKey(category, type, newName);
    const existing = index[from];
    if (!existing) return;

    index[to] = {
        ...existing,
        updatedAt: new Date().toISOString()
    };
    delete index[from];
    await writeIndex(index);
}

export async function removeAssetMetadata(category: AssetCategory, type: AssetType, name: string) {
    const key = buildAssetKey(category, type, name);
    const index = await readIndex();
    if (!index[key]) return;
    delete index[key];
    await writeIndex(index);
}
