import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }

    // Log the start of the header to verify transmission
    console.log("[Tripo Proxy] Auth Header received. Prefix:", authHeader.substring(0, 15) + "...");

    const res = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
        let errorData;
        try {
             errorData = await res.json();
        } catch {
             errorData = { error: await res.text() };
        }
        console.error('Tripo API Error:', res.status, errorData);
        return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Tripo Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
