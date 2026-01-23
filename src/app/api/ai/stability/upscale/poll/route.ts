import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, message: 'Missing API Key' }, { status: 401 });
    }

    // Creative Upscale is Async, so we need a polling endpoint
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
         return NextResponse.json({ success: false, message: 'Missing ID' }, { status: 400 });
    }

    const response = await fetch(`https://api.stability.ai/v2beta/stable-image/upscale/creative/result/${id}`, {
      method: 'GET',
      headers: { 
        Authorization: `Bearer ${apiKey}`, 
        Accept: 'application/json' 
      }
    });

    if (!response.ok) {
       // 202 means still processing
       if (response.status === 202) {
           return NextResponse.json({ success: true, status: 'IN_PROGRESS' });
       }
       const errorText = await response.text();
       return NextResponse.json({ success: false, message: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ 
        success: true, 
        status: 'SUCCEEDED',
        image: data.image 
    });

  } catch (error) {
    console.error('Stability Upscale Poll Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
