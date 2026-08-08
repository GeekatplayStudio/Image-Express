import { NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { assertTrustedCaller } from '@/lib/server/trustedCaller';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getTemplatesDir } from '@/lib/server/appPaths';

const SaveTemplateSchema = z.object({
    name: z.string().min(1).max(300),
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
    const { name, canvasData, thumbnailDataUrl } =
      await parseJsonRequest(request, SaveTemplateSchema, SAVE_BODY_LIMIT);

    if (!name || !canvasData || !thumbnailDataUrl) {
      return NextResponse.json({ success: false, message: 'Missing data' }, { status: 400 });
    }

    const templatesDir = getTemplatesDir();
    
    // Ensure directory exists
    await mkdir(templatesDir, { recursive: true });

    // Sanitize name
    const cleanName = name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const id = Date.now();
    const baseFilename = `${cleanName}-${id}`;

    // Save JSON
    const jsonPath = path.join(templatesDir, `${baseFilename}.json`);
    await writeFile(jsonPath, JSON.stringify(canvasData, null, 2));

    // Save Thumbnail (convert base64)
    const matches = thumbnailDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        return NextResponse.json({ success: false, message: 'Invalid thumbnail data' }, { status: 400 });
    }
    const buffer = Buffer.from(matches[2], 'base64');
    const imagePath = path.join(templatesDir, `${baseFilename}.png`);
    await writeFile(imagePath, buffer);

    return NextResponse.json({ 
        success: true, 
        template: {
            id: baseFilename,
            name: name,
            image: `/api/assets/serve/templates/${baseFilename}.png`,
            data: `/api/assets/serve/templates/${baseFilename}.json`
        }
    });

  } catch (error) {
    const invalid = legacyValidationResponse(error);
    if (invalid) return invalid;
    console.error('Save template error:', error);
    return NextResponse.json({ success: false, message: 'Failed to save template' }, { status: 500 });
  }
}
