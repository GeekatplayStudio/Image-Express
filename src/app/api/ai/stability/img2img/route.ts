import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    // Debug logging
    console.log("Img2Img Request Received");
    console.log("Prompt:", formData.get('prompt'));
    console.log("Strength:", formData.get('strength'));
    console.log("Mode:", formData.get('mode'));
    const imageFile = formData.get('image');
    console.log("Image present:", !!imageFile, "Type:", imageFile instanceof Blob ? imageFile.type : typeof imageFile, "Size:", imageFile instanceof Blob ? imageFile.size : 'N/A');

    if (!apiKey) {
      return NextResponse.json({ success: false, message: 'Missing API Key' }, { status: 401 });
    }

    // Reconstruct FormData
    const outgoingFormData = new FormData();
    outgoingFormData.append('prompt', (formData.get('prompt') || '').toString());
    outgoingFormData.append('mode', 'image-to-image');
    if(formData.get('strength')) outgoingFormData.append('strength', formData.get('strength')!.toString());
    if(formData.has('image')) outgoingFormData.append('image', formData.get('image') as Blob);
    outgoingFormData.append('output_format', 'png');

    const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`, 
        Accept: 'application/json' 
      },
      body: outgoingFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Stability Img2Img Error:", response.status, errorText);
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
    console.error('Stability Img2Img Route Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
