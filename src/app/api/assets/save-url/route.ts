import { NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { OutboundUrlError, assertFetchableUrl } from '@/lib/server/outboundUrlPolicy';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import {
  VALID_ASSET_TYPES,
  VALID_ASSET_CATEGORIES,
  type AssetType,
  type AssetCategory,
  upsertAssetMetadata
} from '@/lib/server/asset-metadata';
import { getAssetsDir } from '@/lib/server/appPaths';

const SaveUrlSchema = z.object({
  url: z.string().max(4096).optional(),
  filename: z.string().max(255).optional(),
  type: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
  owner: z.string().max(320).optional(),
  isPublic: z.boolean().optional(),
});

const SAVE_URL_BODY_LIMIT_BYTES = 8 * 1024;

export async function POST(request: Request) {
  try {
    // This previously destructured an untyped body and handed `url` straight to
    // fetch — the server would retrieve any address the caller named.
    const { url, filename, type, category, owner, isPublic } =
      await parseJsonRequest(request, SaveUrlSchema, SAVE_URL_BODY_LIMIT_BYTES);

    if (!url || !filename) {
      return NextResponse.json({ success: false, message: 'Missing url or filename' }, { status: 400 });
    }

    try {
      assertFetchableUrl(url);
    } catch (error) {
      if (error instanceof OutboundUrlError) {
        return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      }
      throw error;
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
    const uploadDir = path.join(getAssetsDir(), folderCategory, folderType);
    
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
    const invalid = legacyValidationResponse(error);
    if (invalid) return invalid;
    console.error('Save external error:', error);
    return NextResponse.json({ success: false, message: 'Failed to save external file' }, { status: 500 });
  }
}
