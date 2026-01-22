import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = 'https://api.meshy.ai/v2';

async function handleRequest(req: NextRequest, method: string) {
  try {
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get('endpoint');
    
    if (!endpoint) {
         return NextResponse.json({ message: 'Missing endpoint' }, { status: 400 });
    }

    // Security/Format check: Allow "text-to-3d", "image-to-3d", and "text-to-3d/taskId" strategies
    if (!endpoint.startsWith('text-to-3d') && !endpoint.startsWith('image-to-3d')) {
         return NextResponse.json({ message: 'Invalid endpoint' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }

    const apiUrl = `${BASE_URL}/${endpoint}`;

    const options: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
        }
    };

    if (method === 'POST') {
        const body = await req.json();
        options.body = JSON.stringify(body);
    }

    const res = await fetch(apiUrl, options);

    if (!res.ok) {
        const errorText = await res.text();
        console.error(`Meshy API failed [${res.status}]:`, errorText);
        try {
            return NextResponse.json(JSON.parse(errorText), { status: res.status });
        } catch {
            return NextResponse.json({ message: `Meshy API Error: ${res.statusText}`, detail: errorText }, { status: res.status });
        }
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Meshy Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
    return handleRequest(req, 'GET');
}

export async function POST(req: NextRequest) {
    return handleRequest(req, 'POST');
}
