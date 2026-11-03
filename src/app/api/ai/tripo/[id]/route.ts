import { NextRequest, NextResponse } from 'next/server';

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

    const res = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${encodeURIComponent(id)}`, {
      headers: {
        'Authorization': authHeader,
      },
    });

    // Tripo's gateway answers some failures with HTML rather than JSON.
    // Parsing that blindly threw, and the catch below turned a 502 from
    // the provider into our own 500 — which the poller cannot tell apart
    // from a bug on this side.
    const responseText = await res.text();
    try {
      return NextResponse.json(JSON.parse(responseText), { status: res.status });
    } catch {
      return NextResponse.json(
        { message: `Tripo API Error: ${res.statusText}`, detail: responseText },
        { status: res.ok ? 502 : res.status },
      );
    }
  } catch (error) {
    console.error('Tripo Poll Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
