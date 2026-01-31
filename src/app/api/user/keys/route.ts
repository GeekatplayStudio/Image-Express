
import { NextRequest, NextResponse } from 'next/server';
// In a real app, use a database (Postgres/Mongo).
// For this demo, we'll store in a simple in-memory object or file if needed, 
// but since Vercel serverless functions are ephemeral, we can't persist in-memory reliably across calls.
// However, the prompt implies a "server" storage.
// We will mock this with a JSON file or just a simple in-memory store that resets on cold boot, 
// which is acceptable for a "remake" demo unless a DB is explicitly requested.
// Let's use a simple global object for demonstration purposes.

type UserApiKeysPayload = {
    username?: string;
    userId?: string;
    keys?: Record<string, string>;
};

const USER_API_KEYS: Record<string, Record<string, string>> = {};

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as UserApiKeysPayload;
        // Support both username and userId
        const username = body.username || body.userId;
        const keys = body.keys || {};
        
        if (!username) {
            return NextResponse.json({ message: 'Username required' }, { status: 400 });
        }

        // Merge existing keys with new ones
        USER_API_KEYS[username] = {
            ...(USER_API_KEYS[username] || {}),
            ...keys
        };

        return NextResponse.json({ message: 'Keys saved successfully' });
    } catch {
        return NextResponse.json({ message: 'Error saving keys' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        // Support both username and userId
        const username = searchParams.get('username') || searchParams.get('userId');

        if (!username) {
             return NextResponse.json({ message: 'Username required' }, { status: 400 });
        }

        const keys = USER_API_KEYS[username] || {};
        return NextResponse.json({ keys });
    } catch {
         return NextResponse.json({ message: 'Error retrieving keys' }, { status: 500 });
    }
}
