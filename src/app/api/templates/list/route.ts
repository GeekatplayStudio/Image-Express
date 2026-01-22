import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import path from 'path';
import fs from 'fs';

export async function GET(request: Request) {
  try {
    const templatesDir = path.join(process.cwd(), 'public', 'assets', 'templates');

    // Check if dir exists
    if (!fs.existsSync(templatesDir)) {
        return NextResponse.json({ success: true, templates: [] });
    }

    const files = await readdir(templatesDir);
    
    // Filter for JSON files
    const templateFiles = files.filter(file => file.endsWith('.json'));

    const templates = templateFiles.map(file => {
        const id = file.replace('.json', '');
        // Try to derive a readable name from the filename structure "name-timestamp"
        // We split by hyphens, pop the last element (timestamp), and join the rest
        const parts = id.split('-');
        parts.pop(); // remove timestamp
        const readableName = parts.join(' ') || id;

        return {
            id: id,
            name: readableName,
            path: `/assets/templates/${file}`, // The JSON data
            image: `/assets/templates/${id}.png` // The thumbnail
        };
    }).sort((a, b) => b.id.localeCompare(a.id)); // Sort by newest (timestamp in ID)

    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error('List templates error:', error);
    return NextResponse.json({ success: false, message: 'Failed to list templates' }, { status: 500 });
  }
}
