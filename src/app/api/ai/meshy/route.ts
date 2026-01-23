import { NextRequest, NextResponse } from 'next/server';

const BASE_URL_V1 = 'https://api.meshy.ai/openapi/v1';
const BASE_URL_V2 = 'https://api.meshy.ai/openapi/v2';

async function handleRequest(req: NextRequest, method: string) {
  try {
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get('endpoint');
    
    if (!endpoint) {
         return NextResponse.json({ message: 'Missing endpoint' }, { status: 400 });
    }

    // Determine correct version based on endpoint
    let baseUrl = BASE_URL_V2;
    if (endpoint.startsWith('image-to-3d')) {
        baseUrl = BASE_URL_V1;
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }

    const apiUrl = `${baseUrl}/${endpoint}`;

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
