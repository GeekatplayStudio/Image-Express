import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import fs from 'fs';
import { getTemplatesDir } from '@/lib/server/appPaths';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const templatesDir = getTemplatesDir();

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
        path: `/api/assets/serve/templates/${file}`,
        image: `/api/assets/serve/templates/${id}.png`
      };
    }).sort((a, b) => b.id.localeCompare(a.id)); // Sort by newest (timestamp in ID)

    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error('List templates error:', error);
    return NextResponse.json({ success: false, message: 'Failed to list templates' }, { status: 500 });
  }
}
