import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = 'https://api.hitem3d.ai/open-api/v1';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }

    const res = await fetch(`${BASE_URL}/query-task?task_id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Hitem3D Query failed [${res.status}]:`, errorText);
      try {
        return NextResponse.json(JSON.parse(errorText), { status: res.status });
      } catch {
        return NextResponse.json({ message: `Hitem3D API Error: ${res.statusText}`, detail: errorText }, { status: res.status });
      }
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Hitem3D Poll Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
