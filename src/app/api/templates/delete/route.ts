import { NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { assertTrustedCaller } from '@/lib/server/trustedCaller';
import { unlink } from 'fs/promises';
import path from 'path';
import { getTemplatesDir } from '@/lib/server/appPaths';

const DeleteTemplateSchema = z.object({ filePath: z.string().min(1).max(1024) });

/** Ids and paths only - these bodies are tiny. */
const BODY_LIMIT = 8 * 1024;

export async function POST(request: Request) {
  try {
    // Refuse a request driven by another origin: it cannot read the
    // reply, but the change would still happen.
    assertTrustedCaller(request);
    const { filePath } = await parseJsonRequest(request, DeleteTemplateSchema, BODY_LIMIT);

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
    const invalid = legacyValidationResponse(error);
    if (invalid) return invalid;
    console.error('Delete error:', error);
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
}
