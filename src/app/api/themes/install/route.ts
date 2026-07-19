import { NextRequest, NextResponse } from 'next/server';
import {
    installThemeFromZip,
    MAX_THEME_ZIP_BYTES,
    ThemeInstallError,
} from '@/lib/server/ui-theme-store';

export const dynamic = 'force-dynamic';

/**
 * Install a theme pack zip. Accepts either:
 *  - multipart/form-data with a "file" field (and optional "overwrite": "true"), or
 *  - JSON { url: string, overwrite?: boolean } — the zip is downloaded server-side.
 */
export async function POST(request: NextRequest) {
    try {
        let buffer: Buffer | null = null;
        let overwrite = false;

        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('multipart/form-data')) {
            const form = await request.formData();
            const file = form.get('file');
            if (!(file instanceof Blob)) {
                return NextResponse.json({ success: false, error: 'No theme zip file was uploaded.' }, { status: 400 });
            }
            overwrite = form.get('overwrite') === 'true';
            buffer = Buffer.from(await file.arrayBuffer());
        } else {
            const body = await request.json().catch(() => null) as { url?: string; overwrite?: boolean } | null;
            const url = body?.url;
            overwrite = body?.overwrite === true;
            if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
                return NextResponse.json({ success: false, error: 'Provide a theme zip file or an http(s) URL.' }, { status: 400 });
            }
            const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
            if (!response.ok) {
                return NextResponse.json({ success: false, error: `Download failed (${response.status}).` }, { status: 400 });
            }
            const declared = Number(response.headers.get('content-length') || 0);
            if (declared > MAX_THEME_ZIP_BYTES) {
                return NextResponse.json({ success: false, error: 'The theme zip is too large.' }, { status: 400 });
            }
            buffer = Buffer.from(await response.arrayBuffer());
        }

        if (!buffer || buffer.byteLength === 0) {
            return NextResponse.json({ success: false, error: 'The theme zip is empty.' }, { status: 400 });
        }

        const theme = await installThemeFromZip(buffer, { overwrite });
        return NextResponse.json({ success: true, theme });
    } catch (error) {
        if (error instanceof ThemeInstallError) {
            return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        console.error('Install theme error:', error);
        return NextResponse.json({ success: false, error: 'Failed to install the theme.' }, { status: 500 });
    }
}
