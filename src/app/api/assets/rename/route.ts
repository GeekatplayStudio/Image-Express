import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { normalizeEmail } from '@/lib/server/auth-utils';
import { resolveRequestUser } from '@/lib/server/user-session';
import {
  VALID_ASSET_TYPES,
  VALID_ASSET_CATEGORIES,
  type AssetType,
  type AssetCategory,
  getAssetMetadata,
  renameAssetMetadata
} from '@/lib/server/asset-metadata';

export async function POST(request: Request) {
  try {
        const authenticatedUser = await resolveRequestUser(request);
    const { type, oldName, newName, category, owner } = await request.json();

    if (!type || !oldName || !newName) {
        return NextResponse.json({ success: false, message: 'Missing parameters' }, { status: 400 });
    }

    if (!VALID_ASSET_TYPES.includes(type as AssetType) || (category && !VALID_ASSET_CATEGORIES.includes(category as AssetCategory))) {
        return NextResponse.json({ success: false, message: 'Invalid types' }, { status: 400 });
    }

    const folderCategory = (category && VALID_ASSET_CATEGORIES.includes(category as AssetCategory) ? category : 'uploads') as AssetCategory;
    const folderType = (VALID_ASSET_TYPES.includes(type as AssetType) ? type : 'images') as AssetType;
    const requestedOwner = typeof owner === 'string' ? owner.trim() : '';

    if (requestedOwner && requestedOwner !== 'Guest' && !authenticatedUser) {
        return NextResponse.json({ success: false, message: 'Authentication required for user-owned assets' }, { status: 401 });
    }

    if (
        authenticatedUser
        && requestedOwner
        && requestedOwner !== 'Guest'
        && normalizeEmail(requestedOwner) !== normalizeEmail(authenticatedUser.email)
    ) {
        return NextResponse.json({ success: false, message: 'Authenticated user does not match the requested owner' }, { status: 403 });
    }

    const effectiveOwner = authenticatedUser?.email || requestedOwner || 'Guest';

    // Sanitize new name slightly (basic check)
    if (newName.includes('..') || newName.includes('/') || newName.includes('\\')) {
        return NextResponse.json({ success: false, message: 'Invalid filename' }, { status: 400 });
    }

    const dirPath = path.join(process.cwd(), 'public', 'assets', folderCategory, folderType);
    const oldPath = path.join(dirPath, oldName);
    
    // Check if new name requires preserving extension
    const oldExt = path.extname(oldName);
    let finalNewName = newName;
    if (!path.extname(finalNewName)) {
        finalNewName += oldExt;
    } else if (path.extname(finalNewName) !== oldExt) {
        // Warn or force? Let's just append if different? No, user might be renaming ext.
        // Usually we want to keep the extension. Let's enforce keeping original extension if user didn't provide one.
    }
    
    // Actually, simple logic: if user provided name doesn't have the same extension, append it.
    if (!finalNewName.toLowerCase().endsWith(oldExt.toLowerCase())) {
        finalNewName += oldExt;
    }

    const newFilePath = path.join(dirPath, finalNewName);

    if (!fs.existsSync(oldPath)) {
        return NextResponse.json({ success: false, message: 'Asset not found' }, { status: 404 });
    }

    if (effectiveOwner) {
        const metadata = await getAssetMetadata(folderCategory, folderType, oldName);
        if (metadata?.owner && normalizeEmail(metadata.owner) !== normalizeEmail(effectiveOwner)) {
            return NextResponse.json({ success: false, message: 'Only the owner can rename this asset' }, { status: 403 });
        }
    }

    if (fs.existsSync(newFilePath)) {
         return NextResponse.json({ success: false, message: 'Filename already exists' }, { status: 409 });
    }

    await fs.promises.rename(oldPath, newFilePath);
    await renameAssetMetadata(folderCategory, folderType, oldName, finalNewName);

    return NextResponse.json({ 
        success: true, 
        newName: finalNewName,
        newPath: `/api/assets/serve/${folderCategory}/${folderType}/${finalNewName}`
    });

  } catch (error) {
    console.error('Rename asset error:', error);
    return NextResponse.json({ success: false, message: 'Failed to rename asset' }, { status: 500 });
  }
}
