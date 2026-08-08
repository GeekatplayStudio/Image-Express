import { NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { assertTrustedCaller } from '@/lib/server/trustedCaller';
import { unlink } from 'fs/promises';
import path from 'path';
import { normalizeEmail } from '@/lib/server/auth-utils';
import { resolveRequestUser } from '@/lib/server/user-session';
import {
  VALID_ASSET_TYPES,
  VALID_ASSET_CATEGORIES,
  type AssetType,
  type AssetCategory,
  getAssetMetadata,
  removeAssetMetadata
} from '@/lib/server/asset-metadata';
import { getAssetsDir } from '@/lib/server/appPaths';

const DeleteAssetSchema = z.object({ filePath: z.string().min(1).max(1024), owner: z.string().max(320).optional() });

/** Ids and paths only - these bodies are tiny. */
const BODY_LIMIT = 8 * 1024;

export async function POST(request: Request) {
  try {
    const authenticatedUser = await resolveRequestUser(request);
    // Refuse a request driven by another origin: it cannot read the
    // reply, but the change would still happen.
    assertTrustedCaller(request);
    const { filePath, owner } = await parseJsonRequest(request, DeleteAssetSchema, BODY_LIMIT);

    if (!filePath) {
      return NextResponse.json({ success: false, message: 'File path is required' }, { status: 400 });
    }

    const normalizedInput = String(filePath).trim().replace(/^\/+/, '');

    const requestedOwner = typeof owner === 'string' ? owner.trim() : '';
    if (requestedOwner && requestedOwner !== 'Guest' && !authenticatedUser) {
      return NextResponse.json({ success: false, message: 'Authentication required for user-owned assets.' }, { status: 401 });
    }

    if (
      authenticatedUser
      && requestedOwner
      && requestedOwner !== 'Guest'
      && normalizeEmail(requestedOwner) !== normalizeEmail(authenticatedUser.email)
    ) {
      return NextResponse.json({ success: false, message: 'Authenticated user does not match the requested owner.' }, { status: 403 });
    }

    const effectiveOwner = authenticatedUser?.email || requestedOwner || 'Guest';

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

    const assetsRoot = getAssetsDir();
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
      if (effectiveOwner && metadata?.owner && normalizeEmail(metadata.owner) !== normalizeEmail(effectiveOwner)) {
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
    const invalid = legacyValidationResponse(error);
    if (invalid) return invalid;
    console.error('Delete error:', error);
    // If file doesn't exist, technically it's already "deleted", so maybe success?
    // But for now let's return error to debug.
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
}
