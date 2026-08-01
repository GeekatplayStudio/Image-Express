export interface ColorPalette {
    id: string;
    name: string;
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    allowedColors: string[];
}

export interface TypographyRules {
    primaryFont: string;
    secondaryFont: string;
    accentFont?: string;
    allowedFonts: string[];
    minHeadingSize: number;
    minBodySize: number;
}

export interface LogoRules {
    logoAssetUrl?: string;
    requiredPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'any';
    minPadding: number;
    minWidth: number;
}

export interface LayoutRules {
    targetWidth?: number;
    targetHeight?: number;
    minMargin: number;
    contrastRatioMin: number;
    forbiddenShapes?: string[];
}

export interface ApprovedAsset {
    id: string;
    name: string;
    type: 'logo' | 'shape' | 'icon' | 'template';
    url?: string;
    svgData?: string;
}

export interface BrandProfile {
    id: string;
    name: string;
    description: string;
    isDefault?: boolean;
    palette: ColorPalette;
    typography: TypographyRules;
    logo: LogoRules;
    layout: LayoutRules;
    assets: ApprovedAsset[];
    updatedAt: string;
}

export const DEFAULT_BRAND_PROFILE: BrandProfile = {
    id: 'default-brand-kit',
    name: 'Image Express Official',
    description: 'Default brand guidelines for Image Express marketing and social graphics.',
    isDefault: true,
    palette: {
        id: 'default-palette',
        name: 'Express Vivid',
        primary: '#2563eb',
        secondary: '#0f172a',
        accent: '#f59e0b',
        background: '#ffffff',
        allowedColors: ['#2563eb', '#0f172a', '#f59e0b', '#ffffff', '#64748b', '#f8fafc', '#1e293b'],
    },
    typography: {
        primaryFont: 'Inter',
        secondaryFont: 'Roboto',
        accentFont: 'Outfit',
        allowedFonts: ['Inter', 'Roboto', 'Outfit', 'Arial', 'sans-serif'],
        minHeadingSize: 24,
        minBodySize: 12,
    },
    logo: {
        requiredPosition: 'top-left',
        minPadding: 16,
        minWidth: 40,
    },
    layout: {
        minMargin: 20,
        contrastRatioMin: 4.5,
    },
    assets: [
        {
            id: 'brand-shape-star',
            name: 'Brand Star',
            type: 'shape',
        },
    ],
    updatedAt: new Date().toISOString(),
};

const STORAGE_KEY_PROFILES = 'image-express-brand-profiles';
const STORAGE_KEY_ACTIVE_ID = 'image-express-active-brand-id';

export function loadBrandProfiles(): BrandProfile[] {
    if (typeof window === 'undefined') return [DEFAULT_BRAND_PROFILE];
    try {
        const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
        if (!raw) return [DEFAULT_BRAND_PROFILE];
        const parsed = JSON.parse(raw) as BrandProfile[];
        if (!Array.isArray(parsed) || parsed.length === 0) return [DEFAULT_BRAND_PROFILE];
        return parsed;
    } catch {
        return [DEFAULT_BRAND_PROFILE];
    }
}

export function saveBrandProfiles(profiles: BrandProfile[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
    } catch {
        // ignore storage errors
    }
}

export function getActiveBrandProfile(): BrandProfile {
    const profiles = loadBrandProfiles();
    if (typeof window === 'undefined') return profiles[0] || DEFAULT_BRAND_PROFILE;
    try {
        const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
        const match = profiles.find((p) => p.id === activeId);
        return match || profiles[0] || DEFAULT_BRAND_PROFILE;
    } catch {
        return profiles[0] || DEFAULT_BRAND_PROFILE;
    }
}

export function setActiveBrandProfileId(id: string): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
    } catch {
        // ignore
    }
}

export function saveBrandProfile(profile: BrandProfile): BrandProfile[] {
    const profiles = loadBrandProfiles();
    const existingIndex = profiles.findIndex((p) => p.id === profile.id);
    const updated = { ...profile, updatedAt: new Date().toISOString() };
    let nextProfiles: BrandProfile[];
    if (existingIndex >= 0) {
        nextProfiles = [...profiles];
        nextProfiles[existingIndex] = updated;
    } else {
        nextProfiles = [...profiles, updated];
    }
    saveBrandProfiles(nextProfiles);
    setActiveBrandProfileId(updated.id);
    return nextProfiles;
}

/**
 * Hydrates local profiles from the server store (the source of truth shared
 * with MCP clients). Returns the merged list, or null when the API is
 * unreachable (offline/static export) — callers keep local state then.
 */
export async function syncBrandProfilesFromServer(): Promise<{
    profiles: BrandProfile[];
    activeProfile: BrandProfile;
} | null> {
    try {
        const response = await fetch('/api/ai/brand-manager/profile');
        if (!response.ok) return null;
        const data = await response.json() as {
            success?: boolean;
            profiles?: BrandProfile[];
            activeProfile?: BrandProfile;
        };
        if (!data.success || !Array.isArray(data.profiles) || data.profiles.length === 0) return null;
        const activeProfile = data.activeProfile || data.profiles[0];
        saveBrandProfiles(data.profiles);
        setActiveBrandProfileId(activeProfile.id);
        return { profiles: data.profiles, activeProfile };
    } catch {
        return null;
    }
}

/** Pushes a profile (or an active-profile switch) to the server store; best-effort. */
export function pushBrandProfileToServer(payload: { profile?: BrandProfile; activeProfileId?: string }): void {
    try {
        void fetch('/api/ai/brand-manager/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch(() => undefined);
    } catch {
        // offline — local storage copy remains authoritative for this session
    }
}

export function deleteBrandProfile(id: string): BrandProfile[] {
    const profiles = loadBrandProfiles();
    const filtered = profiles.filter((p) => p.id !== id);
    const result = filtered.length > 0 ? filtered : [DEFAULT_BRAND_PROFILE];
    saveBrandProfiles(result);
    if (getActiveBrandProfile().id === id) {
        setActiveBrandProfileId(result[0].id);
    }
    return result;
}
