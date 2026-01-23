import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import path from 'path';
import fs from 'fs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'images'; 
    const category = searchParams.get('category') || 'uploads'; // 'uploads' or 'generated'
    
    // Validate type to prevent traversing out of allowed directories
    if (!['images', 'models'].includes(type) || !['uploads', 'generated'].includes(category)) {
        return NextResponse.json({ success: false, message: 'Invalid type or category' }, { status: 400 });
    }

    const dirPath = path.join(process.cwd(), 'public', 'assets', category, type);

    // Check if dir exists
    if (!fs.existsSync(dirPath)) {
        return NextResponse.json({ success: true, files: [] });
    }

    const files = await readdir(dirPath);
    
    // Filter files (remove .DS_Store etc) and create full paths
    const assetFiles = files
        .filter(file => !file.startsWith('.'))
        .map(file => ({
            name: file,
            path: `/assets/${category}/${type}/${file}`,
            type: type
        }));

    return NextResponse.json({ success: true, files: assetFiles });
  } catch (error) {
    console.error('List assets error:', error);
    return NextResponse.json({ success: false, message: 'Failed to list assets' }, { status: 500 });
  }
}
