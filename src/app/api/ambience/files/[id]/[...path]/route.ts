import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { resolveAmbienceFile } from '@/lib/server/ambience-store';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
    '.json': 'application/json; charset=utf-8',
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
        const filePath = await resolveAmbienceFile(id, parts || []);
        if (!filePath) {
            return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
        }
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        return new NextResponse(new Uint8Array(data), {
            headers: {
                'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
                'Cache-Control': 'no-cache',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('Serve ambience file error:', error);
        return NextResponse.json({ success: false, error: 'Failed to read the pack file.' }, { status: 500 });
    }
}
