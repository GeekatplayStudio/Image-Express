import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error("Missing Authorization Header");
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }

    // Capture the incoming form data
    const formData = await req.formData();
    
    // Validate file
    const file = formData.get('file');
    if (!file) {
      console.error("No file provided");
      return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    }

    console.log("Forwarding file execution to Tripo...");

    // Forward to Tripo
    // Fetch needs FormData instance, passing original ensures boundaries are correct?
    // Node-fetch might struggle with re-using FormData from Request.
    // Better to reconstruct a new FormData.
    const forwardData = new FormData();
    forwardData.append('file', file);
    
    const res = await fetch('https://api.tripo3d.ai/v2/openapi/upload', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        // Let fetch set Content-Type for multipart/form-data boundary
      },
      body: forwardData,
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error("Tripo Upload Failed:", res.status, errorText);
        return NextResponse.json({ message: `Tripo Upload Failed: ${errorText}`}, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error('Tripo Upload Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
