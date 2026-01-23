import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function POST(request: Request) {
  try {
    const { type, oldName, newName, category } = await request.json();

    if (!type || !oldName || !newName) {
        return NextResponse.json({ success: false, message: 'Missing parameters' }, { status: 400 });
    }

    if (!['images', 'models'].includes(type) || (category && !['uploads', 'generated'].includes(category))) {
        return NextResponse.json({ success: false, message: 'Invalid types' }, { status: 400 });
    }

    const folderCategory = category || 'uploads';

    // Sanitize new name slightly (basic check)
    if (newName.includes('..') || newName.includes('/') || newName.includes('\\')) {
        return NextResponse.json({ success: false, message: 'Invalid filename' }, { status: 400 });
    }

    const dirPath = path.join(process.cwd(), 'public', 'assets', folderCategory, type);
    const oldPath = path.join(dirPath, oldName);
    
    // Check if new name requires preserving extension
    const oldExt = path.extname(oldName);
    let finalNewName = newName;
    if (!path.extname(finalNewName)) {
        finalNewName += oldExt;
    } else if (path.extname(finalNewName) !== oldExt) {
        // Warn or force? Let's just append if different? No, user might be renaming ext.
        // Usually we want to keep the extension. Let's enforce keeping original extension if user didn't provide one.
    }
    
    // Actually, simple logic: if user provided name doesn't have the same extension, append it.
    if (!finalNewName.toLowerCase().endsWith(oldExt.toLowerCase())) {
        finalNewName += oldExt;
    }

    const newFilePath = path.join(dirPath, finalNewName);

    if (!fs.existsSync(oldPath)) {
        return NextResponse.json({ success: false, message: 'Asset not found' }, { status: 404 });
    }

    if (fs.existsSync(newFilePath)) {
         return NextResponse.json({ success: false, message: 'Filename already exists' }, { status: 409 });
    }

    await fs.promises.rename(oldPath, newFilePath);

    return NextResponse.json({ 
        success: true, 
        newName: finalNewName,
        newPath: `/assets/uploads/${type}/${finalNewName}`
    });

  } catch (error) {
    console.error('Rename asset error:', error);
    return NextResponse.json({ success: false, message: 'Failed to rename asset' }, { status: 500 });
  }
}
