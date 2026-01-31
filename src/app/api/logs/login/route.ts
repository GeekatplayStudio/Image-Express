import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'login.log');

async function ensureLogDir() {
    try {
        await fs.mkdir(LOG_DIR, { recursive: true });
    } catch (error) {
        // Directory creation errors will be surfaced when writing; swallow here for idempotency.
    }
}

function getClientIp(request: Request) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp;
    }
    return 'unknown';
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const username = (body?.username ?? '').toString().trim() || 'unknown';
        const timestamp = new Date().toISOString();
        const ip = getClientIp(request);
        const userAgent = request.headers.get('user-agent') || 'unknown';
        const line = `[${timestamp}] user="${username}" ip="${ip}" ua="${userAgent.replace(/"/g, '')}"\n`;

        await ensureLogDir();
        await fs.appendFile(LOG_FILE, line, { encoding: 'utf8' });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to write login log', error);
        return NextResponse.json({ success: false, message: 'Failed to write log' }, { status: 500 });
    }
}

export async function GET() {
    try {
        await ensureLogDir();
        let content = '';
        try {
            content = await fs.readFile(LOG_FILE, 'utf8');
        } catch (error: unknown) {
            const nodeError = error as NodeJS.ErrnoException | null;
            if (!nodeError || nodeError.code !== 'ENOENT') {
                throw error;
            }
            content = 'No log entries yet.';
        }
        return new NextResponse(content, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store'
            }
        });
    } catch (error) {
        console.error('Failed to read login log', error);
        return new NextResponse('Failed to read log', { status: 500 });
    }
}
