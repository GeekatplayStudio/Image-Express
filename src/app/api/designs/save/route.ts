import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { id: existingId, name, canvasData, thumbnailDataUrl } = await request.json();

    if (!name || !canvasData) {
      return NextResponse.json({ success: false, message: 'Missing data' }, { status: 400 });
    }

    const designsDir = path.join(process.cwd(), 'public', 'assets', 'designs');
    
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
        if (baseFilename.includes('/') || baseFilename.includes('\\')) {
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
            imagePathRel = `/assets/designs/${baseFilename}.png`;
        }
    }

    return NextResponse.json({ 
        success: true, 
        design: {
            id: designId,
            name: name,
            image: imagePathRel || `/assets/designs/${baseFilename}.png`, // Fallback to expected path
            data: `/assets/designs/${baseFilename}.json`,
            lastModified: timestamp
        }
    });

  } catch (error) {
    console.error('Save design error:', error);
    return NextResponse.json({ success: false, message: 'Failed to save design' }, { status: 500 });
  }
}
