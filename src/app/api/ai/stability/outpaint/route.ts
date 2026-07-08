
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, message: 'Missing API Key' }, { status: 401 });
    }

    // Reconstruct FormData for robust transmission
    const outgoingFormData = new FormData();
    if(formData.has('image')) outgoingFormData.append('image', formData.get('image') as Blob);
    if(formData.has('prompt')) outgoingFormData.append('prompt', formData.get('prompt') as string);
    if(formData.has('output_format')) outgoingFormData.append('output_format', formData.get('output_format') as string);
    
    // Directions
    if(formData.has('left')) outgoingFormData.append('left', formData.get('left') as string);
    if(formData.has('right')) outgoingFormData.append('right', formData.get('right') as string);
    if(formData.has('up')) outgoingFormData.append('up', formData.get('up') as string);
    if(formData.has('down')) outgoingFormData.append('down', formData.get('down') as string);

    const response = await fetch('https://api.stability.ai/v2beta/stable-image/edit/outpaint', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`, 
        Accept: 'application/json' 
      },
      body: outgoingFormData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Stability Outpaint Error:", response.status, errorText);
        return NextResponse.json({ success: false, message: `Stability API Error: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ 
        success: true, 
        image: data.image,
        seed: data.seed,
        finishReason: data.finish_reason
    });

  } catch (error) {
    console.error('Stability Outpaint Route Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
