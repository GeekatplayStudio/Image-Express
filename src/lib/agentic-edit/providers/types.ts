export interface ProviderGeneratePayload {
    originalImage: Buffer;
    notesOverlay?: Buffer;
    maskImage?: Buffer;
    poseHint?: Buffer;
    references?: Array<{ role: string; image: Buffer }>;
    promptPositive: string;
    promptNegative?: string;
    params: Record<string, unknown>;
}

export interface ProviderGenerateResult {
    outputImage: Buffer;
    meta: Record<string, unknown>;
}

export interface ModelProvider {
    name: string;
    supports: {
        img2img: boolean;
        inpaint: boolean;
        multiReference: boolean;
        controlPose: boolean;
        mask: boolean;
    };
    generate(payload: ProviderGeneratePayload): Promise<ProviderGenerateResult>;
}
