import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ success: false, message: 'File path is required' }, { status: 400 });
    }

    // Security check: ensure path is within public assets folder
    // The received filePath will likely be something like "/assets/uploads/images/filename.png"
    // We want to map this to the real file system path.
    
    // Normalize path to prevent directory traversal
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    
    // Construct absolute path
    const fullPath = path.join(process.cwd(), 'public', safePath);
    
    // Double check it starts with the correct root prefix to be extra safe
    const expectedRootUploads = path.join(process.cwd(), 'public', 'assets', 'uploads');
    const expectedRootGenerated = path.join(process.cwd(), 'public', 'assets', 'generated');
    
    if (!fullPath.startsWith(expectedRootUploads) && !fullPath.startsWith(expectedRootGenerated)) {
         return NextResponse.json({ success: false, message: 'Invalid file path restriction' }, { status: 403 });
    }

    // Delete file
    await unlink(fullPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    // If file doesn't exist, technically it's already "deleted", so maybe success?
    // But for now let's return error to debug.
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
}
