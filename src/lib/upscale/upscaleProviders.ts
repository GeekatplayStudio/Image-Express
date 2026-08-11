/**
 * The upscale service catalog: every provider the Upscale tool can route a
 * job through, with the guidance Settings shows when the user is choosing
 * which service to configure. One place to add a provider — the Settings
 * panel, the Upscale modal, and the proxy route all read from here.
 */

export type UpscaleProviderId =
    | 'comfy'
    | 'stability'
    | 'fal'
    | 'replicate'
    | 'freepik'
    | 'topaz'
    | 'claid';

export type UpscaleProviderDefinition = {
    id: UpscaleProviderId;
    /** Display name, not translated — these are product names. */
    name: string;
    /** localStorage key holding the API key ('' = no key needed). */
    apiKeyStorageKey: string;
    /** Key name inside the /api/user/keys record for account sync. */
    accountKeyName: string;
    /** i18n key for the one-line "best for" guidance. */
    guidanceKey: string;
    /** Scale factors the service accepts through our integration. */
    scales: number[];
    /** Whether the provider exposes a creativity/generative-detail dial. */
    supportsCreativity: boolean;
    /** True when the work happens on this machine (no key, no upload). */
    isLocal: boolean;
};

export const UPSCALE_PROVIDERS: UpscaleProviderDefinition[] = [
    {
        id: 'comfy',
        name: 'ComfyUI (local)',
        apiKeyStorageKey: '',
        accountKeyName: '',
        guidanceKey: 'upscale.guidance.comfy',
        scales: [2, 4],
        supportsCreativity: false,
        isLocal: true,
    },
    {
        id: 'stability',
        name: 'Stability AI',
        apiKeyStorageKey: 'stability_api_key',
        accountKeyName: 'stability',
        guidanceKey: 'upscale.guidance.stability',
        scales: [4],
        supportsCreativity: true,
        isLocal: false,
    },
    {
        id: 'fal',
        name: 'Fal.ai (Clarity)',
        apiKeyStorageKey: 'fal_api_key',
        accountKeyName: 'fal',
        guidanceKey: 'upscale.guidance.fal',
        scales: [2, 4],
        supportsCreativity: true,
        isLocal: false,
    },
    {
        id: 'replicate',
        name: 'Replicate (Real-ESRGAN)',
        apiKeyStorageKey: 'replicate_api_key',
        accountKeyName: 'replicate',
        guidanceKey: 'upscale.guidance.replicate',
        scales: [2, 4, 8],
        supportsCreativity: false,
        isLocal: false,
    },
    {
        id: 'freepik',
        name: 'Magnific (Freepik)',
        apiKeyStorageKey: 'freepik_api_key',
        accountKeyName: 'freepik',
        guidanceKey: 'upscale.guidance.freepik',
        scales: [2, 4, 8, 16],
        supportsCreativity: true,
        isLocal: false,
    },
    {
        id: 'topaz',
        name: 'Topaz Labs',
        apiKeyStorageKey: 'topaz_api_key',
        accountKeyName: 'topaz',
        guidanceKey: 'upscale.guidance.topaz',
        scales: [2, 4],
        supportsCreativity: false,
        isLocal: false,
    },
    {
        id: 'claid',
        name: 'Claid.ai',
        apiKeyStorageKey: 'claid_api_key',
        accountKeyName: 'claid',
        guidanceKey: 'upscale.guidance.claid',
        scales: [2, 4],
        supportsCreativity: false,
        isLocal: false,
    },
];

export const getUpscaleProvider = (id: string): UpscaleProviderDefinition | undefined => (
    UPSCALE_PROVIDERS.find((provider) => provider.id === id)
);

export const isUpscaleProviderId = (value: string): value is UpscaleProviderId => (
    UPSCALE_PROVIDERS.some((provider) => provider.id === value)
);

export type UpscalePreferences = {
    /** The service the Upscale tool preselects. */
    defaultProvider: UpscaleProviderId;
    defaultScale: number;
    /** 0..1, only meaningful for providers with supportsCreativity. */
    creativity: number;
};

export const UPSCALE_PREFERENCES_STORAGE_KEY = 'image-express-upscale-preferences';

const DEFAULT_UPSCALE_PREFERENCES: UpscalePreferences = {
    defaultProvider: 'comfy',
    defaultScale: 2,
    creativity: 0.35,
};

const clampCreativity = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isFinite(parsed)) return DEFAULT_UPSCALE_PREFERENCES.creativity;
    return Math.min(1, Math.max(0, parsed));
};

const sanitizeScale = (value: unknown, provider: UpscaleProviderDefinition): number => {
    const parsed = typeof value === 'number' ? value : Number.NaN;
    if (provider.scales.includes(parsed)) return parsed;
    return provider.scales[0];
};

export const loadUpscalePreferences = (): UpscalePreferences => {
    if (typeof window === 'undefined') {
        return DEFAULT_UPSCALE_PREFERENCES;
    }
    try {
        const raw = window.localStorage.getItem(UPSCALE_PREFERENCES_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<UpscalePreferences>) : {};
        const provider = typeof parsed.defaultProvider === 'string' && isUpscaleProviderId(parsed.defaultProvider)
            ? getUpscaleProvider(parsed.defaultProvider)!
            : getUpscaleProvider(DEFAULT_UPSCALE_PREFERENCES.defaultProvider)!;
        return {
            defaultProvider: provider.id,
            defaultScale: sanitizeScale(parsed.defaultScale, provider),
            creativity: clampCreativity(parsed.creativity),
        };
    } catch {
        return DEFAULT_UPSCALE_PREFERENCES;
    }
};

export const saveUpscalePreferences = (updates: Partial<UpscalePreferences>): UpscalePreferences => {
    const current = loadUpscalePreferences();
    const merged = { ...current, ...updates };
    const provider = isUpscaleProviderId(merged.defaultProvider)
        ? getUpscaleProvider(merged.defaultProvider)!
        : getUpscaleProvider(DEFAULT_UPSCALE_PREFERENCES.defaultProvider)!;
    const next: UpscalePreferences = {
        defaultProvider: provider.id,
        defaultScale: sanitizeScale(merged.defaultScale, provider),
        creativity: clampCreativity(merged.creativity),
    };
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(UPSCALE_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    }
    return next;
};
