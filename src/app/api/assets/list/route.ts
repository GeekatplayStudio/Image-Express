import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import path from 'path';
import fs from 'fs';
import {
  VALID_ASSET_TYPES,
  VALID_ASSET_CATEGORIES,
  type AssetType,
  type AssetCategory,
  getAssetMetadataByFolder
} from '@/lib/server/asset-metadata';

const VALID_SCOPES = ['personal', 'shared', 'all'] as const;
const VALID_VISIBILITY = ['all', 'public', 'private'] as const;

type AssetScope = (typeof VALID_SCOPES)[number];
type AssetVisibilityFilter = (typeof VALID_VISIBILITY)[number];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawType = searchParams.get('type') || 'images';
    const rawCategory = searchParams.get('category') || 'uploads';
    const rawScope = searchParams.get('scope') || 'personal';
    const rawVisibility = searchParams.get('visibility') || 'all';
    const includePublic = searchParams.get('includePublic') === 'true';
    const searchTerm = (searchParams.get('search') || '').trim().toLowerCase();
    const owner = (searchParams.get('owner') || '').trim();
    const type = (VALID_ASSET_TYPES.includes(rawType as AssetType) ? rawType : 'images') as AssetType;
    const category = (VALID_ASSET_CATEGORIES.includes(rawCategory as AssetCategory) ? rawCategory : 'uploads') as AssetCategory;
    const scope = (VALID_SCOPES.includes(rawScope as AssetScope) ? rawScope : 'personal') as AssetScope;
    const visibility = (VALID_VISIBILITY.includes(rawVisibility as AssetVisibilityFilter) ? rawVisibility : 'all') as AssetVisibilityFilter;
    
    // Validate type to prevent traversing out of allowed directories
    if (!VALID_ASSET_TYPES.includes(type) || !VALID_ASSET_CATEGORIES.includes(category)) {
      return NextResponse.json({ success: false, message: 'Invalid type or category' }, { status: 400 });
    }

    const dirPath = path.join(process.cwd(), 'public', 'assets', category, type);

    // Check if dir exists
    if (!fs.existsSync(dirPath)) {
        return NextResponse.json({ success: true, files: [] });
    }

    const files = await readdir(dirPath);
    const metadataByName = await getAssetMetadataByFolder(category, type);

    const isVisibleByScope = (assetOwner: string, isPublic: boolean) => {
      const isOwnedByCurrentUser = owner.length > 0 && assetOwner === owner;

      if (scope === 'shared') {
        return isPublic;
      }

      if (scope === 'all') {
        return owner.length > 0 ? (isOwnedByCurrentUser || isPublic) : true;
      }

      if (!owner) {
        return true;
      }

      return isOwnedByCurrentUser || (includePublic && isPublic);
    };
    
    // Filter files (remove .DS_Store etc), enrich with metadata, and apply scope/search/visibility filters.
    const assetFiles = files
        .filter((file) => !file.startsWith('.'))
        .map((file) => {
          const metadata = metadataByName[file];
          const fallbackOwner = category === 'generated' && owner ? owner : 'Shared Library';
          const assetOwner = metadata?.owner || fallbackOwner;
          const isPublic = metadata?.isPublic ?? (category !== 'generated');

          return {
          name: file,
          path: `/api/assets/serve/${category}/${type}/${file}`,
          type,
          category,
          owner: assetOwner,
          isPublic,
          createdAt: metadata?.createdAt,
          updatedAt: metadata?.updatedAt
          };
        })
        .filter((asset) => {
          if (!isVisibleByScope(asset.owner, asset.isPublic)) {
            return false;
          }

          if (visibility === 'public' && !asset.isPublic) return false;
          if (visibility === 'private' && asset.isPublic) return false;

          if (!searchTerm) return true;
          return (
            asset.name.toLowerCase().includes(searchTerm) ||
            asset.owner.toLowerCase().includes(searchTerm)
          );
        })
        .sort((a, b) => {
          const aTs = a.updatedAt ? Date.parse(a.updatedAt) : 0;
          const bTs = b.updatedAt ? Date.parse(b.updatedAt) : 0;
          if (aTs !== bTs) return bTs - aTs;
          return a.name.localeCompare(b.name);
        });

    return NextResponse.json({ success: true, files: assetFiles });
  } catch (error) {
    console.error('List assets error:', error);
    return NextResponse.json({ success: false, message: 'Failed to list assets' }, { status: 500 });
  }
}
