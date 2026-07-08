import { NextResponse } from 'next/server';

function isAllowedUrl(value: string) {
    return /^https?:\/\//i.test(value);
}

export async function POST(request: Request) {
    try {
        const { url } = await request.json() as { url?: string };

        if (!url || !isAllowedUrl(url)) {
            return NextResponse.json({ success: false, message: 'A valid remote URL is required.' }, { status: 400 });
        }

        const response = await fetch(url);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return new NextResponse(text || `Failed to fetch remote asset (${response.status}).`, {
                status: response.status,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const bytes = await response.arrayBuffer();

        return new Response(bytes, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Fetch asset URL error:', error);
        return NextResponse.json({ success: false, message: 'Failed to fetch remote asset.' }, { status: 500 });
    }
}