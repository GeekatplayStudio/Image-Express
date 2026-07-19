import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { resolveThemeFile } from '@/lib/server/ui-theme-store';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mjs': 'text/javascript; charset=utf-8',
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; path: string[] }> }
) {
    try {
        const { id, path: parts } = await params;
        const filePath = await resolveThemeFile(id, parts || []);
        if (!filePath) {
            return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
        }
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        return new NextResponse(new Uint8Array(data), {
            headers: {
                'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
                // Packs can be reinstalled in place, so don't cache aggressively.
                'Cache-Control': 'no-cache',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('Serve theme file error:', error);
        return NextResponse.json({ success: false, error: 'Failed to read the theme file.' }, { status: 500 });
    }
}
