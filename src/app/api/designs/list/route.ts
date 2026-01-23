import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import fs from 'fs';

export async function GET(request: Request) {
  try {
    const designsDir = path.join(process.cwd(), 'public', 'assets', 'designs');

    // Check if dir exists
    if (!fs.existsSync(designsDir)) {
        return NextResponse.json({ success: true, designs: [] });
    }

    const files = await readdir(designsDir);
    
    // Filter for JSON files
    const designFiles = files.filter(file => file.endsWith('.json'));

    const designs = await Promise.all(designFiles.map(async file => {
        const id = file.replace('.json', '');
        // Try to derive a readable name from the filename structure "name-timestamp"
        const parts = id.split('-');
        const timestamp = parts.pop();
        const readableName = parts.join(' ') || id;
        
        const filePath = path.join(designsDir, file);
        const stats = await stat(filePath);

        return {
            id: id,
            name: readableName, // Simplified name extraction
            data: `/assets/designs/${file}`, // The JSON data URL
            image: `/assets/designs/${id}.png`, // The thumbnail URL
            lastModified: stats.mtimeMs
        };
    }));

    // Sort by lastModified desc
    designs.sort((a, b) => b.lastModified - a.lastModified);

    return NextResponse.json({ success: true, designs });
  } catch (error) {
    console.error('List designs error:', error);
    return NextResponse.json({ success: false, message: 'Failed to list designs' }, { status: 500 });
  }
}
