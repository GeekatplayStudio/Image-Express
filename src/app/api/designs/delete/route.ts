import { NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { assertTrustedCaller } from '@/lib/server/trustedCaller';
import { unlink, access } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { getDesignsDir } from '@/lib/server/appPaths';

const DeleteDesignSchema = z.object({ id: z.string().min(1).max(300) });

/** Ids and paths only — these bodies are tiny. */
const BODY_LIMIT = 8 * 1024;

export async function POST(request: Request) {
  try {
    // Refuse a request driven by another origin: it cannot read the
    // reply, but the deletion would still happen.
    assertTrustedCaller(request);
    const { id } = await parseJsonRequest(request, DeleteDesignSchema, BODY_LIMIT);

    if (!id || !/^[a-zA-Z0-9_-]+$/.test(String(id))) {
      return NextResponse.json({ success: false, message: 'ID is required' }, { status: 400 });
    }

    const designsDir = getDesignsDir();
    
    // Deleting .json and .png
    // The design IDs in my list implementation are filenames without extension (which includes timestamps for unique ones)
    
    const filesToDelete = [`${id}.json`, `${id}.png`];

    for (const file of filesToDelete) {
        const fullPath = path.join(designsDir, file);
        try {
            await access(fullPath, constants.F_OK);
            await unlink(fullPath);
        } catch {
            // File doesn't exist or ignore
        }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const invalid = legacyValidationResponse(error);
    if (invalid) return invalid;
    console.error('Delete design error:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete design' }, { status: 500 });
  }
}
