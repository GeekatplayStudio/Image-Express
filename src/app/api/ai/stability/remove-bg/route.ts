import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, message: 'Missing API Key' }, { status: 401 });
    }

    // v2beta/stable-image/edit/remove-background
    const response = await fetch('https://api.stability.ai/v2beta/stable-image/edit/remove-background', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`, 
        Accept: 'application/json' 
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Stability Remove BG Error:", response.status, errorText);
      return NextResponse.json({ success: false, message: `Stability API Error: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ 
        success: true, 
        image: data.image 
    });

  } catch (error) {
    console.error('Stability Remove BG Route Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
