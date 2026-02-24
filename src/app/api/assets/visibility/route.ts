import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import {
  VALID_ASSET_TYPES,
  VALID_ASSET_CATEGORIES,
  type AssetType,
  type AssetCategory,
  getAssetMetadata,
  upsertAssetMetadata
} from '@/lib/server/asset-metadata';

export async function POST(request: Request) {
  try {
    const { type, category, name, isPublic, owner } = await request.json();

    if (!type || !category || !name || typeof isPublic !== 'boolean') {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    if (!VALID_ASSET_TYPES.includes(type as AssetType) || !VALID_ASSET_CATEGORIES.includes(category as AssetCategory)) {
      return NextResponse.json({ success: false, message: 'Invalid asset type/category' }, { status: 400 });
    }

    if (String(name).includes('..') || String(name).includes('/') || String(name).includes('\\')) {
      return NextResponse.json({ success: false, message: 'Invalid asset name' }, { status: 400 });
    }

    const assetType = type as AssetType;
    const assetCategory = category as AssetCategory;
    const safeName = String(name);
    const filePath = path.join(process.cwd(), 'public', 'assets', assetCategory, assetType, safeName);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, message: 'Asset not found' }, { status: 404 });
    }

    const existing = await getAssetMetadata(assetCategory, assetType, safeName);
    const requestedOwner = typeof owner === 'string' && owner.trim().length > 0 ? owner.trim() : 'Guest';
    if (existing?.owner && existing.owner !== requestedOwner) {
      return NextResponse.json({ success: false, message: 'Only the owner can change visibility' }, { status: 403 });
    }

    const metadata = await upsertAssetMetadata({
      category: assetCategory,
      type: assetType,
      name: safeName,
      owner: existing?.owner ?? requestedOwner,
      isPublic
    });

    return NextResponse.json({
      success: true,
      asset: {
        name: safeName,
        category: assetCategory,
        type: assetType,
        owner: metadata.owner,
        isPublic: metadata.isPublic,
        updatedAt: metadata.updatedAt
      }
    });
  } catch (error) {
    console.error('Asset visibility update error:', error);
    return NextResponse.json({ success: false, message: 'Failed to update visibility' }, { status: 500 });
  }
}
