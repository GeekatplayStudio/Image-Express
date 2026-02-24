import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';
import {
  VALID_ASSET_TYPES,
  VALID_ASSET_CATEGORIES,
  type AssetType,
  type AssetCategory,
  getAssetMetadata,
  removeAssetMetadata
} from '@/lib/server/asset-metadata';

export async function POST(request: Request) {
  try {
    const { filePath, owner } = await request.json();

    if (!filePath) {
      return NextResponse.json({ success: false, message: 'File path is required' }, { status: 400 });
    }

    const normalizedInput = String(filePath).trim().replace(/^\/+/, '');

    let assetRelativePath = normalizedInput;
    if (normalizedInput.startsWith('api/assets/serve/')) {
      assetRelativePath = normalizedInput.replace(/^api\/assets\/serve\//, '');
    } else if (normalizedInput.startsWith('assets/')) {
      assetRelativePath = normalizedInput.replace(/^assets\//, '');
    }

    const safePath = path.posix.normalize(assetRelativePath);
    if (!safePath || safePath.includes('..')) {
      return NextResponse.json({ success: false, message: 'Invalid file path restriction' }, { status: 403 });
    }

    const assetsRoot = path.join(process.cwd(), 'public', 'assets');
    const fullPath = path.join(assetsRoot, safePath);
    if (!fullPath.startsWith(assetsRoot)) {
      return NextResponse.json({ success: false, message: 'Invalid file path restriction' }, { status: 403 });
    }

    const [category, type, ...nameParts] = safePath.split('/');
    if (
      nameParts.length > 0 &&
      VALID_ASSET_CATEGORIES.includes(category as AssetCategory) &&
      VALID_ASSET_TYPES.includes(type as AssetType)
    ) {
      const name = nameParts.join('/');
      const metadata = await getAssetMetadata(category as AssetCategory, type as AssetType, name);
      const requestedOwner = typeof owner === 'string' ? owner.trim() : '';
      if (requestedOwner && metadata?.owner && metadata.owner !== requestedOwner) {
        return NextResponse.json({ success: false, message: 'Only the owner can delete this asset' }, { status: 403 });
      }
    }

    // Delete file
    await unlink(fullPath);

    if (
      nameParts.length > 0 &&
      VALID_ASSET_CATEGORIES.includes(category as AssetCategory) &&
      VALID_ASSET_TYPES.includes(type as AssetType)
    ) {
      await removeAssetMetadata(category as AssetCategory, type as AssetType, nameParts.join('/'));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    // If file doesn't exist, technically it's already "deleted", so maybe success?
    // But for now let's return error to debug.
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
}
