import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, message: 'Missing API Key' }, { status: 401 });
    }

    // Default to Core if not specified, but usually we use Core or SD3
    // v2beta/stable-image/generate/core
    const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`, 
        Accept: 'application/json' 
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Stability Generate Error:", response.status, errorText);
      return NextResponse.json({ success: false, message: `Stability API Error: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    
    // Result is directly base64 in 'image' field for JSON accept
    return NextResponse.json({ 
        success: true, 
        image: data.image,
        seed: data.seed,
        finishReason: data.finish_reason
    });

  } catch (error) {
    console.error('Stability Generate Route Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
