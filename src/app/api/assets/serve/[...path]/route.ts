import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import mime from 'mime';

/**
 * Dynamic Asset Server
 * Serves files from the 'public/assets' directory.
 * Useful in development where runtime-added files aren't immediately served by Next.js static handler.
 */
export async function GET(
    request: NextRequest, 
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const pathParams = (await params).path;
        if (!pathParams || pathParams.length === 0) {
            return new NextResponse('File not found', { status: 404 });
        }

        // Construct file path: public/assets/...
        // The route is /api/assets/serve/[...path]
        // mapped to public/assets/[...path]
        
        // Security: Prevent traversal
        const safePath = path.posix.normalize(pathParams.join('/'));
        if (safePath.includes('..')) {
             return new NextResponse('Invalid path', { status: 403 });
        }

        const filePath = path.join(process.cwd(), 'public', 'assets', safePath);

        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            return new NextResponse('File not found', { status: 404 });
        }

        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            return new NextResponse('Not a file', { status: 400 });
        }

        const fileBuffer = fs.readFileSync(filePath);
        const contentType = mime.getType(filePath) || 'application/octet-stream';

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Length': stats.size.toString(),
                'Cache-Control': 'public, max-age=0, must-revalidate' // No caching in dev for instant updates
            }
        });

    } catch (e) {
        console.error('Error serving asset:', e);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
