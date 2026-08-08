import { NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { assertTrustedCaller } from '@/lib/server/trustedCaller';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getDesignsDir } from '@/lib/server/appPaths';

const SaveDesignSchema = z.object({
    id: z.string().max(300).optional(),
    name: z.string().min(1).max(300),
    // The canvas document and thumbnail are opaque here: this route stores
    // them, and the editor owns their shape.
    canvasData: z.unknown(),
    // Bounded by the whole-body limit below, not separately.
    thumbnailDataUrl: z.string().optional(),
});

/**
 * Deliberately generous. A design carries its whole canvas plus a base64
 * thumbnail, and can legitimately embed images, so a tight cap would break
 * saving real work. The point here is that the body is bounded at all — it
 * previously was not.
 */
const SAVE_BODY_LIMIT = 128 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    assertTrustedCaller(request);
    const { id: existingId, name, canvasData, thumbnailDataUrl } =
      await parseJsonRequest(request, SaveDesignSchema, SAVE_BODY_LIMIT);

    if (!name || !canvasData) {
      return NextResponse.json({ success: false, message: 'Missing data' }, { status: 400 });
    }

    const designsDir = getDesignsDir();
    
    // Ensure directory exists
    await mkdir(designsDir, { recursive: true });

    let baseFilename;
    let designId;
    const timestamp = Date.now();

    if (existingId) {
        // Updating existing design
        baseFilename = existingId;
        designId = existingId;
        // Verify we aren't path traversing? existingId should be simple filename
        if (!/^[a-zA-Z0-9_-]+$/.test(String(baseFilename))) {
             return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
        }
    } else {
        // Create new
        const cleanName = name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        baseFilename = `${cleanName}-${timestamp}`;
        designId = baseFilename;
    }

    // Save JSON
    const jsonPath = path.join(designsDir, `${baseFilename}.json`);
    await writeFile(jsonPath, JSON.stringify(canvasData, null, 2));

    let imagePathRel = null;

    // Save Thumbnail if provided
    if (thumbnailDataUrl) {
        const matches = thumbnailDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
            const buffer = Buffer.from(matches[2], 'base64');
            const imagePath = path.join(designsDir, `${baseFilename}.png`);
            await writeFile(imagePath, buffer);
            imagePathRel = `/api/assets/serve/designs/${baseFilename}.png`;
        }
    }

    return NextResponse.json({ 
        success: true, 
        design: {
            id: designId,
            name: name,
            image: imagePathRel || `/api/assets/serve/designs/${baseFilename}.png`,
        thumbnail: imagePathRel || `/api/assets/serve/designs/${baseFilename}.png`,
            data: `/api/assets/serve/designs/${baseFilename}.json`,
            lastModified: timestamp
        }
    });

  } catch (error) {
    const invalid = legacyValidationResponse(error);
    if (invalid) return invalid;
    console.error('Save design error:', error);
    return NextResponse.json({ success: false, message: 'Failed to save design' }, { status: 500 });
  }
}
