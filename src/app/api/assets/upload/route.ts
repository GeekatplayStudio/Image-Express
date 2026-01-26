import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const VALID_TYPES = ['images', 'models', 'videos', 'audio'] as const;
const VALID_CATEGORIES = ['uploads', 'generated'] as const;

type AssetType = (typeof VALID_TYPES)[number];
type AssetCategory = (typeof VALID_CATEGORIES)[number];

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tif', '.tiff', '.heic']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.oga']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply']);

const detectAssetType = (filename: string, mimeType?: string): AssetType => {
  const ext = path.extname(filename || '').toLowerCase();

  if (mimeType) {
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'model/gltf-binary' || mimeType === 'model/gltf+json') return 'models';
    if (mimeType.startsWith('image/')) return 'images';
  }

  if (VIDEO_EXTENSIONS.has(ext)) return 'videos';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (MODEL_EXTENSIONS.has(ext)) return 'models';
  if (IMAGE_EXTENSIONS.has(ext)) return 'images';

  return 'images';
};

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const rawCategory = (data.get('category') as string) || 'uploads';

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });
    }

    const type = detectAssetType(file.name, (file as unknown as { type?: string }).type) as AssetType;
    const category = (VALID_CATEGORIES.includes(rawCategory as AssetCategory) ? rawCategory : 'uploads') as AssetCategory;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.name);
    const filename = `${path.basename(file.name, ext)}-${uniqueSuffix}${ext}`;
    
    // Determine directory
    const uploadDir = path.join(process.cwd(), 'public', 'assets', category, type);

    // Ensure directory exists
    try {
        await mkdir(uploadDir, { recursive: true });
    } catch (e) {
        // ignore if exists
    }

    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);

    const publicPath = `/assets/${category}/${type}/${filename}`;

    return NextResponse.json({ success: true, path: publicPath, filename, type, category });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
