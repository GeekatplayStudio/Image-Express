import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import fs from 'fs';

export async function POST(request: Request) {
  try {
    const { name, canvasData, thumbnailDataUrl } = await request.json();

    if (!name || !canvasData || !thumbnailDataUrl) {
      return NextResponse.json({ success: false, message: 'Missing data' }, { status: 400 });
    }

    const templatesDir = path.join(process.cwd(), 'public', 'assets', 'templates');
    
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
            image: `/assets/templates/${baseFilename}.png`,
            data: `/assets/templates/${baseFilename}.json`
        }
    });

  } catch (error) {
    console.error('Save template error:', error);
    return NextResponse.json({ success: false, message: 'Failed to save template' }, { status: 500 });
  }
}
