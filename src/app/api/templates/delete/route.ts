import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ success: false, message: 'File path is required' }, { status: 400 });
    }

    // Security check: ensure path is within public assets/templates folder
    // The received filePath will likely be something like "/assets/templates/filename.json"
    
    // Normalize path to prevent directory traversal
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    
    // Construct absolute path
    const fullPath = path.join(process.cwd(), 'public', safePath);
    
    // Double check it starts with the correct root prefix to be extra safe
    const expectedRoot = path.join(process.cwd(), 'public', 'assets', 'templates');
    
    if (!fullPath.startsWith(expectedRoot)) {
         return NextResponse.json({ success: false, message: 'Invalid file path restriction' }, { status: 403 });
    }

    // Delete file
    await unlink(fullPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
}
