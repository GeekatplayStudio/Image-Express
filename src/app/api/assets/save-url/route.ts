import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { url, filename, type, category } = await request.json();

    if (!url || !filename) {
      return NextResponse.json({ success: false, message: 'Missing url or filename' }, { status: 400 });
    }

    const folderType = type || 'models'; // Default to models for generated content usually
    const folderCategory = category || 'uploads';
    
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

    const publicPath = `/assets/uploads/${folderType}/${uniqueName}`;

    return NextResponse.json({ success: true, path: publicPath });
  } catch (error) {
    console.error('Save external error:', error);
    return NextResponse.json({ success: false, message: 'Failed to save external file' }, { status: 500 });
  }
}
