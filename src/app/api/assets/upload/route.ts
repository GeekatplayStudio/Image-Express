import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { normalizeEmail } from '@/lib/server/auth-utils';
import { resolveRequestUser } from '@/lib/server/user-session';
import {
  VALID_ASSET_CATEGORIES,
  type AssetCategory,
  type AssetType,
  upsertAssetMetadata
} from '@/lib/server/asset-metadata';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tif', '.tiff', '.heic']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.oga']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply']);
const MAX_UPLOAD_BYTES: Record<AssetType, number> = {
  images: 50 * 1024 * 1024,
  videos: 200 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  models: 250 * 1024 * 1024,
};

const detectAssetType = (filename: string, mimeType?: string): AssetType | null => {
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

  return null;
};

const normalizeRequestedOwner = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const sanitizeFilenameStem = (value: string) => {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return normalized || 'upload';
};

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const rawCategory = (data.get('category') as string) || 'uploads';
    const requestedOwner = normalizeRequestedOwner(data.get('owner'));
    const isPublic = (data.get('isPublic') as string) === 'true';
    const authenticatedUser = await resolveRequestUser(request);

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });
    }

    if (requestedOwner && requestedOwner !== 'Guest' && !authenticatedUser) {
      return NextResponse.json({ success: false, message: 'Authentication required for user-owned uploads.' }, { status: 401 });
    }

    if (
      authenticatedUser
      && requestedOwner
      && requestedOwner !== 'Guest'
      && normalizeEmail(requestedOwner) !== normalizeEmail(authenticatedUser.email)
    ) {
      return NextResponse.json({ success: false, message: 'Authenticated user does not match the requested owner.' }, { status: 403 });
    }

    const type = detectAssetType(file.name, (file as unknown as { type?: string }).type);
    if (!type) {
      return NextResponse.json({ success: false, message: 'Unsupported file type.' }, { status: 415 });
    }

    if (file.size > MAX_UPLOAD_BYTES[type]) {
      return NextResponse.json({ success: false, message: 'File is too large for this asset type.' }, { status: 413 });
    }

    const category = (VALID_ASSET_CATEGORIES.includes(rawCategory as AssetCategory) ? rawCategory : 'uploads') as AssetCategory;
    const owner = authenticatedUser?.email || requestedOwner || 'Guest';

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.name);
    const filename = `${sanitizeFilenameStem(path.basename(file.name, ext))}-${uniqueSuffix}${ext.toLowerCase()}`;
    
    // Determine directory
    const uploadDir = path.join(process.cwd(), 'public', 'assets', category, type);

    // Ensure directory exists
    try {
        await mkdir(uploadDir, { recursive: true });
    } catch {
        // ignore if exists
    }

    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);
    await upsertAssetMetadata({ category, type, name: filename, owner, isPublic });

    // Use our dynamic serve route instead of static public path to bypass dev server lag
    // Original: /assets/${category}/${type}/${filename}
    // New: /api/assets/serve/${category}/${type}/${filename}
    const publicPath = `/api/assets/serve/${category}/${type}/${filename}`;

    return NextResponse.json({ success: true, path: publicPath, filename, type, category, owner, isPublic });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
