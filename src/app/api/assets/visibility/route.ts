import { NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { assertTrustedCaller } from '@/lib/server/trustedCaller';
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
  upsertAssetMetadata
} from '@/lib/server/asset-metadata';
import { getAssetsDir } from '@/lib/server/appPaths';

const VisibilitySchema = z.object({
    type: z.string().min(1).max(50),
    category: z.string().min(1).max(50),
    name: z.string().min(1).max(255),
    // Not optional: this flag decides whether an asset becomes public.
    isPublic: z.boolean(),
    owner: z.string().max(320).optional(),
});

const BODY_LIMIT = 8 * 1024;

export async function POST(request: Request) {
  try {
    const authenticatedUser = await resolveRequestUser(request);
    assertTrustedCaller(request);
    const { type, category, name, isPublic, owner } =
      await parseJsonRequest(request, VisibilitySchema, BODY_LIMIT);

    if (!type || !category || !name || typeof isPublic !== 'boolean') {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    if (!VALID_ASSET_TYPES.includes(type as AssetType) || !VALID_ASSET_CATEGORIES.includes(category as AssetCategory)) {
      return NextResponse.json({ success: false, message: 'Invalid asset type/category' }, { status: 400 });
    }

    if (String(name).includes('..') || String(name).includes('/') || String(name).includes('\\')) {
      return NextResponse.json({ success: false, message: 'Invalid asset name' }, { status: 400 });
    }

    const requestedOwner = typeof owner === 'string' && owner.trim().length > 0 ? owner.trim() : 'Guest';
    if (requestedOwner !== 'Guest' && !authenticatedUser) {
      return NextResponse.json({ success: false, message: 'Authentication required for user-owned assets.' }, { status: 401 });
    }

    if (
      authenticatedUser
      && requestedOwner !== 'Guest'
      && normalizeEmail(requestedOwner) !== normalizeEmail(authenticatedUser.email)
    ) {
      return NextResponse.json({ success: false, message: 'Authenticated user does not match the requested owner.' }, { status: 403 });
    }

    const effectiveOwner = authenticatedUser?.email || requestedOwner;

    const assetType = type as AssetType;
    const assetCategory = category as AssetCategory;
    const safeName = String(name);
    const filePath = path.join(getAssetsDir(), assetCategory, assetType, safeName);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, message: 'Asset not found' }, { status: 404 });
    }

    const existing = await getAssetMetadata(assetCategory, assetType, safeName);
    if (existing?.owner && normalizeEmail(existing.owner) !== normalizeEmail(effectiveOwner)) {
      return NextResponse.json({ success: false, message: 'Only the owner can change visibility' }, { status: 403 });
    }

    const metadata = await upsertAssetMetadata({
      category: assetCategory,
      type: assetType,
      name: safeName,
      owner: existing?.owner ?? effectiveOwner,
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
    const invalid = legacyValidationResponse(error);
    if (invalid) return invalid;
    console.error('Asset visibility update error:', error);
    return NextResponse.json({ success: false, message: 'Failed to update visibility' }, { status: 500 });
  }
}
