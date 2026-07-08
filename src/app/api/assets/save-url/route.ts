import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import {
  VALID_ASSET_TYPES,
  VALID_ASSET_CATEGORIES,
  type AssetType,
  type AssetCategory,
  upsertAssetMetadata
} from '@/lib/server/asset-metadata';

export async function POST(request: Request) {
  try {
    const { url, filename, type, category, owner, isPublic } = await request.json();

    if (!url || !filename) {
      return NextResponse.json({ success: false, message: 'Missing url or filename' }, { status: 400 });
    }

    const folderType = (type && VALID_ASSET_TYPES.includes(type as AssetType) ? type : 'models') as AssetType;
    const folderCategory = (category && VALID_ASSET_CATEGORIES.includes(category as AssetCategory) ? category : 'uploads') as AssetCategory;
    
    // Fetch the content
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch from ${url}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to disk
    const uploadDir = path.join(process.cwd(), 'public', 'assets', folderCategory, folderType);
    
    await mkdir(uploadDir, { recursive: true });

    // Clean filename
    const cleanName = filename.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    const uniqueName = `${Date.now()}-${cleanName}`;
    const filepath = path.join(uploadDir, uniqueName);

    await writeFile(filepath, buffer);
    await upsertAssetMetadata({
      category: folderCategory,
      type: folderType,
      name: uniqueName,
      owner: typeof owner === 'string' ? owner : 'Guest',
      isPublic: Boolean(isPublic)
    });

    const publicPath = `/api/assets/serve/${folderCategory}/${folderType}/${uniqueName}`;

    return NextResponse.json({
      success: true,
      path: publicPath,
      type: folderType,
      category: folderCategory,
      owner: typeof owner === 'string' ? owner : 'Guest',
      isPublic: Boolean(isPublic)
    });
  } catch (error) {
    console.error('Save external error:', error);
    return NextResponse.json({ success: false, message: 'Failed to save external file' }, { status: 500 });
  }
}
