import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const type = data.get('type') as string || 'images'; // 'images' or 'models'

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.name);
    const filename = `${path.basename(file.name, ext)}-${uniqueSuffix}${ext}`;
    
    // Determine directory
    const uploadDir = path.join(process.cwd(), 'public', 'assets', 'uploads', type);

    // Ensure directory exists
    try {
        await mkdir(uploadDir, { recursive: true });
    } catch (e) {
        // ignore if exists
    }

    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);

    const publicPath = `/assets/uploads/${type}/${filename}`;

    return NextResponse.json({ success: true, path: publicPath, filename });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
