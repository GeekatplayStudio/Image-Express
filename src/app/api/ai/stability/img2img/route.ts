import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, message: 'Missing API Key' }, { status: 401 });
    }

    // v2beta/stable-image/generate/sd3 (or core, but img2img is often just generate with image input)
    // Stability AI Docs: POST /v2beta/stable-image/control/sketch (Sketch to Image) or structure 
    // OR just standard generate with 'image' param for image-to-image in some models.
    // For 'Image to Image' specifically, let's use the 'control/structure' or 'control/sketch' if that's what the user implies, 
    // OR the standard 'generate/sd3' with mode='image-to-image'.
    // The "standard" img2img in the new API is usually via "generate/sd3" or "generate/core" with an 'image' part in the body.
    // Let's assume the client sends the correct endpoint structure or we default to 'generate/core' which supports init_image? 
    // Verifying Stability v2beta...
    // https://platform.stability.ai/docs/api-reference#tag/Generate/paths/~1v2beta~1stable-image~1generate~1sd3/post
    // actually, `generate/sd3` accepts `image` + `strength` for img2img.
    // `generate/core` DOES NOT support img2img yet in v2beta docs clearly? Wait.
    // Let's stick to using 'generate/sd3' for img2img as it's the robust one.
    
    // However, if the user wants 'Sketch to Image', that is `control/sketch`.
    // Let's look at the formData to decide or query param?
    // Let's use `generate/sd3` as the default power-house for img2img.
    
    const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${apiKey}`, 
        Accept: 'application/json' 
      },
      body: formData,
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
