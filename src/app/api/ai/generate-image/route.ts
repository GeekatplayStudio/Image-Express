import { NextResponse } from 'next/server';
import { GenerationParamsSchema } from '@/lib/ai/types';
import { AiRuntimeManager } from '@/lib/ai/runtime';

/**
 * AI Generation Route
 * Handles requests for image generation via:
 * 1. Local ComfyUI (if configured)
 * 2. Stability AI (Primary Remote Provider)
 * 3. OpenAI DALL-E 3 (Fallback Remote Provider)
 */
export async function POST(request: Request) {
  try {
        const body = await request.json();
        
        // Validate request schema using Zod
        const validation = GenerationParamsSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({
                error: 'Invalid request parameters',
                details: validation.error.flatten(),
            }, { status: 400 });
        }

        const {
                prompt,
                width,
                height,
                serverUrl,
                provider,
        } = validation.data;

    if (provider === 'comfy') {
        const comfyHost = serverUrl || 'http://localhost:8188';
        
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
        const result = await AiRuntimeManager.generateImage(validation.data);
        const status = result.status || (result.success ? 200 : 502);
        
        // Remove helper status from final JSON to prevent schema mismatches
        const responsePayload = { ...result };
        delete responsePayload.status;
        return NextResponse.json(responsePayload, { status });
    }


  } catch (error) {
    console.error('Generation Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ success: false, message: `Generation failed: ${message}` }, { status: 500 });
  }
}
