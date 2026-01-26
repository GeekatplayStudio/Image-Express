import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import path from 'path';
import fs from 'fs';

const VALID_TYPES = ['images', 'models', 'videos', 'audio'] as const;
const VALID_CATEGORIES = ['uploads', 'generated'] as const;

type AssetType = (typeof VALID_TYPES)[number];
type AssetCategory = (typeof VALID_CATEGORIES)[number];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
  const rawType = searchParams.get('type') || 'images'; 
  const rawCategory = searchParams.get('category') || 'uploads';
  const type = (VALID_TYPES.includes(rawType as AssetType) ? rawType : 'images') as AssetType;
  const category = (VALID_CATEGORIES.includes(rawCategory as AssetCategory) ? rawCategory : 'uploads') as AssetCategory;
    
    // Validate type to prevent traversing out of allowed directories
  if (!VALID_TYPES.includes(type) || !VALID_CATEGORIES.includes(category)) {
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
          type,
          category
        }));

    return NextResponse.json({ success: true, files: assetFiles });
  } catch (error) {
    console.error('List assets error:', error);
    return NextResponse.json({ success: false, message: 'Failed to list assets' }, { status: 500 });
  }
}
