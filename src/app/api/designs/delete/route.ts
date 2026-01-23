import { NextResponse } from 'next/server';
import { unlink, access } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, message: 'ID is required' }, { status: 400 });
    }

    const designsDir = path.join(process.cwd(), 'public', 'assets', 'designs');
    
    // Deleting .json and .png
    // The design IDs in my list implementation are filenames without extension (which includes timestamps for unique ones)
    
    const filesToDelete = [`${id}.json`, `${id}.png`];

    for (const file of filesToDelete) {
        const fullPath = path.join(designsDir, file);
        try {
            await access(fullPath, constants.F_OK);
            await unlink(fullPath);
        } catch (e) {
            // File doesn't exist or ignore
        }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete design error:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete design' }, { status: 500 });
  }
}
