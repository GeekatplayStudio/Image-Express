import { NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { OutboundUrlError, assertFetchableUrl } from '@/lib/server/outboundUrlPolicy';

const FetchUrlSchema = z.object({
    url: z.string().max(4096).optional(),
});

/** A URL is short; the response can be large, but the request never is. */
const FETCH_URL_BODY_LIMIT_BYTES = 8 * 1024;

export async function POST(request: Request) {
    try {
        const { url } = await parseJsonRequest(request, FetchUrlSchema, FETCH_URL_BODY_LIMIT_BYTES);

        if (!url) {
            return NextResponse.json({ success: false, message: 'A valid remote URL is required.' }, { status: 400 });
        }

        try {
            // The old check was `/^https?:\/\//`, which allowed the server to be
            // pointed at the cloud metadata endpoint or anything on its LAN.
            assertFetchableUrl(url);
        } catch (error) {
            if (error instanceof OutboundUrlError) {
                return NextResponse.json({ success: false, message: error.message }, { status: 400 });
            }
            throw error;
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
        const invalid = legacyValidationResponse(error);
        if (invalid) return invalid;
        console.error('Fetch asset URL error:', error);
        return NextResponse.json({ success: false, message: 'Failed to fetch remote asset.' }, { status: 500 });
    }
}