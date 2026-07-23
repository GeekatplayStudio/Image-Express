import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';
import { getTemplatesDir } from '@/lib/server/appPaths';

export async function POST(request: Request) {
  try {
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ success: false, message: 'File path is required' }, { status: 400 });
    }

    const filename = path.basename(String(filePath));
    if (!/^[a-zA-Z0-9_-]+\.(json|png)$/.test(filename)) {
         return NextResponse.json({ success: false, message: 'Invalid file path restriction' }, { status: 403 });
    }

    const fullPath = path.join(getTemplatesDir(), filename);
    await unlink(fullPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
}
