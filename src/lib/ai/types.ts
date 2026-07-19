import { z } from 'zod';

export const GenerationParamsSchema = z.object({
    prompt: z.string().min(1, 'Prompt must not be empty'),
    width: z.number().int().positive().optional().or(z.null()),
    height: z.number().int().positive().optional().or(z.null()),
    serverUrl: z.string().url('Invalid server URL').optional().or(z.literal('')).or(z.null()),
    provider: z.enum(['comfy', 'stability', 'google', 'openai', 'ollama', 'banana', 'remote']),
    apiKey: z.string().optional().or(z.null()),
    specificProvider: z.string().optional().or(z.null()),
    localAiBaseUrl: z.string().url('Invalid local AI base URL').optional().or(z.literal('')).or(z.null()),
    localAiModel: z.string().optional().or(z.null()),
    mockMode: z.boolean().default(false),
});

export type GenerationParams = z.infer<typeof GenerationParamsSchema>;
