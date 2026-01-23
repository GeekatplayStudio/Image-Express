import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    // Upscale type: conservative or creative (comes in formData usually, or we default)
    // Actually URL endpoint differs: 
    // v2beta/stable-image/upscale/conservative
    // v2beta/stable-image/upscale/creative
    // Let's check a query param or a body field 'type' that we intercept?
    // FormData is harder to inspect without parsing.
    // Let's pass 'upscale_type' in query param for routing simplicity.
    
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'conservative'; // 'conservative' | 'creative'

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
        // Creative upscale is async! returns id. Conservative is sync.
        if (response.status === 202) {
             const data = await response.json();
             return NextResponse.json({ success: true, id: data.id, status: 'IN_PROGRESS' });
        }
        
        const errorText = await response.text();
        console.error("Stability Upscale Error:", response.status, errorText);
        return NextResponse.json({ success: false, message: `Stability API Error: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ 
        success: true, 
        image: data.image 
    });

  } catch (error) {
    console.error('Stability Upscale Route Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
