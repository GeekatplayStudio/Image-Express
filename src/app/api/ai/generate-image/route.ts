import { NextResponse } from 'next/server';

/**
 * AI Generation Route
 * Handles requests for image generation via:
 * 1. Local ComfyUI (if configured)
 * 2. Stability AI (Primary Remote Provider)
 * 3. OpenAI DALL-E 3 (Fallback Remote Provider)
 */
export async function POST(request: Request) {
  try {
    const { prompt, width, height, serverUrl, provider, apiKey } = await request.json();

    if (provider === 'comfy') {
        const comfyHost = serverUrl || 'http://127.0.0.1:8188';
        
        // 1. Get a Client ID (UUID)
        const clientId = crypto.randomUUID();

        // 2. Build Basic Workflow (Default Text to Image)
        // This is a minimal standard workflow for ComfyUI.
        const workflow = {
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": Math.floor(Math.random() * 1000000000000),
                    "steps": 20,
                    "cfg": 8,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1,
                    "model": ["4", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["5", 0]
                }
            },
            "4": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {
                    "ckpt_name": "v1-5-pruned-emaonly.ckpt" // Fallback: user should ideally select this or we query available
                }
            },
            "5": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "width": width || 512,
                    "height": height || 512,
                    "batch_size": 1
                }
            },
            "6": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": prompt,
                    "clip": ["4", 1]
                }
            },
            "7": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": "text, watermark",
                    "clip": ["4", 1]
                }
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["3", 0],
                    "vae": ["4", 2]
                }
            },
            "9": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": "ComfyUI",
                    "images": ["8", 0]
                }
            }
        };

        // Note: For a robust implementation, we should fetch /object_info to get valid model names first
        // or allow user to type it in settings. For V1 we assume standard setup.

        // 3. Queue Prompt
        const res = await fetch(`${comfyHost}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: workflow,
                client_id: clientId
            })
        });
        
        if (!res.ok) throw new Error('Failed to queue prompt on ComfyUI');
        const queueData = await res.json();
        
        // We return the prompt ID so the client can poll history or websocket
        return NextResponse.json({ success: true, promptId: queueData.prompt_id, provider: 'comfy' });

    } else {
        if (!apiKey) {
             return NextResponse.json({ success: false, message: 'API Key is required for remote generation.' });
        }

        // Try Stability AI First (SDXL)
        // Note: Stability uses different format than OpenAI.
        const stabilityUrl = 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image';
        
        const stabilityRes = await fetch(stabilityUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                text_prompts: [
                    {
                        text: prompt,
                    },
                ],
                cfg_scale: 7,
                height: height ? Math.floor(height / 64) * 64 : 1024,
                width: width ? Math.floor(width / 64) * 64 : 1024,
                steps: 30,
                samples: 1,
            }),
        });
        
        if (stabilityRes.ok) {
            const data = await stabilityRes.json();
            // Stability returns base64
            const base64Image = data.artifacts[0].base64;
            return NextResponse.json({ 
                success: true, 
                imageUrl: `data:image/png;base64,${base64Image}`, 
                provider: 'stability' 
            });
        }
        
        // If Stability fails (e.g. 401 Unauthorized), Fallback to OpenAI
        // But only if it was an auth error, otherwise it might be a bad request we should report.
        // For simplicity in this demo, if Stability fails with 401/403 (likely due to wrong key type), we try OpenAI.
        if (stabilityRes.status === 401 || stabilityRes.status === 403 || stabilityRes.status === 404) {
             // Try OpenAI DALL-E 3
            const ratio = width && height ? width / height : 1;
            let openAiSize = "1024x1024";
            if (ratio >= 1.3) openAiSize = "1792x1024";
            else if (ratio <= 0.7) openAiSize = "1024x1792";

            const openAiRes = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "dall-e-3",
                    prompt: prompt,
                    n: 1,
                    size: openAiSize,
                    quality: "standard",
                    response_format: "url"
                })
            });
            
            const data = await openAiRes.json();
            
            if (!openAiRes.ok) {
                // If both failed, report OpenAI error (or Stability error if we prefer)
                // Let's report the one that seemed more relevant or just generic.
                const errorMsg = data.error?.message || 'Remote API Failed (Invalid Key for both Stability and OpenAI)';
                console.error('API Error:', errorMsg);
                return NextResponse.json({ success: false, message: errorMsg });
            }
            
            return NextResponse.json({ success: true, imageUrl: data.data[0].url, provider: 'openai' });
        } else {
            // It was a Stability API specific error (like out of credits, bad parameters, etc)
             const data = await stabilityRes.json();
             return NextResponse.json({ success: false, message: `Stability AI Error: ${data.message || 'Unknown'}` });
        }
    }

  } catch (error) {
    console.error('Generation Error:', error);
    return NextResponse.json({ success: false, message: 'Generation failed: ' + (error as any).message }, { status: 500 });
  }
}
