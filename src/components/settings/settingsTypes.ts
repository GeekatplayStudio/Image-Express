import { inspectComfyServerCatalog } from '@/lib/comfyui/runner';

export const STORAGE_KEYS = {
    // 3D Services
    MESHY_API_KEY: 'meshy_api_key',
    TRIPO_API_KEY: 'tripo_api_key',
    HITEMS_API_KEY: 'hitems_api_key',
    HITEMS_APP_ID: 'hitems_appid',

    // Image Services
    STABILITY_API_KEY: 'stability_api_key',
    OPENAI_API_KEY: 'openai_api_key',
    GOOGLE_API_KEY: 'google_api_key', // Google Nano/Gemini
    BANANA_API_KEY: 'banana_api_key', // Banana.dev

    // Legacy / Others
    IMG_GEN_PROVIDER: 'image-express-provider',
    COMFY_UI_URL: 'image-express-comfy-url',
};

export type ValidationProvider = 'meshy' | 'tripo' | 'hitems' | 'google';
export type ValidationState = 'idle' | 'checking' | 'valid' | 'invalid';
export type SettingsTabId = 'comfy' | 'services' | 'storage' | 'workspace' | 'admin';

export const sanitizeHeaderValue = (value: string) => value.replace(/Bearer /gi, '').replace(/["']/g, '').trim();

export type ComfyCatalogSnapshot = Awaited<ReturnType<typeof inspectComfyServerCatalog>>;

/** Shared Tailwind classes reused across every settings section/card. */
export const modalSectionClass = 'space-y-4 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm sm:p-5';
export const accentSectionClass = 'space-y-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 shadow-sm sm:p-5';
export const fieldCardClass = 'rounded-xl border border-border/50 bg-secondary/20 p-3 transition-colors hover:bg-secondary/30';
