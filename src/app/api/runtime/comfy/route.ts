import { NextResponse } from 'next/server';
import {
    resolveConfiguredComfyCloudApiKey,
    resolveConfiguredComfyCloudUrl,
} from '@/lib/comfyui/connection';

export async function GET(): Promise<NextResponse> {
    return NextResponse.json({
        cloudUrl: resolveConfiguredComfyCloudUrl(),
        cloudApiKey: resolveConfiguredComfyCloudApiKey(),
    }, {
        headers: {
            'cache-control': 'no-store',
        },
    });
}