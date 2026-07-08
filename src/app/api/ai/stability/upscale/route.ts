import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'conservative'; // 'conservative' | 'creative'
    
    console.log(`Upscale Request Received (${type})`);
    console.log("Prompt:", formData.get('prompt'));
    const img = formData.get('image');
    console.log("Image present:", !!img, "Size:", img instanceof Blob ? img.size : 'N/A');

    if (!apiKey) {
      return NextResponse.json({ success: false, message: 'Missing API Key' }, { status: 401 });
    }

    const endpoint = `https://api.stability.ai/v2beta/stable-image/upscale/${type}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`, 
        Accept: 'application/json' 
      },
      body: formData,
    });

    if (!response.ok) {
        // Handle explicit errors
        const errorText = await response.text();
        console.error("Stability Upscale Error:", response.status, errorText);
        let msg = `Stability API Error: ${response.status}`;
        try {
            const errJson = JSON.parse(errorText);
            if(errJson.errors?.[0]?.message) msg = errJson.errors[0].message;
        } catch {}
        return NextResponse.json({ success: false, message: msg }, { status: response.status });
    }

    const data = await response.json();
    
    // Handle Creative Mode result (Async -> returns ID)
    if (type === 'creative') {
        if (data.id) {
            return NextResponse.json({ success: true, id: data.id, status: 'IN_PROGRESS' });
        } else {
             // Should not happen for 200 OK on creative
             return NextResponse.json({ success: false, message: 'No generation ID received from Stability AI' }, { status: 500 });
        }
    }
    
    // Handle Conservative Mode result (Sync -> returns Image Base64)
    if (data.image) {
        return NextResponse.json({ 
            success: true, 
            image: data.image 
        });
    }

    return NextResponse.json({ success: false, message: 'Unexpected response format from Stability AI' });

  } catch (error) {
    console.error('Stability Upscale Route Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
