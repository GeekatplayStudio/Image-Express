/**
 * Campaign profiles: a campaign holds everything a set of designs must comply
 * with — allowed fonts, palette colors, approved assets, reference images,
 * and plain-language requirements the AI evaluates. Multiple campaigns are
 * stored and reselectable; persistence mirrors the Brand Kit pattern
 * (localStorage cache + server store as the shared source of truth).
 */

export interface CampaignAsset {
    id: string;
    name: string;
    type: 'image' | 'logo' | 'other';
    dataUrl: string;
}

export interface CampaignReferenceImage {
    id: string;
    name: string;
    dataUrl: string;
}

export interface CampaignProfile {
    id: string;
    name: string;
    /** Free-form description of the campaign. */
    description: string;
    /** Plain-language requirements, evaluated by the AI audit (e.g. "always cheerful, no red, mention the summer sale"). */
    parameters: string;
    /** Allowed fonts; empty = any font passes. */
    fonts: string[];
    /** Allowed palette colors (hex); empty = any color passes. */
    colors: string[];
    assets: CampaignAsset[];
    referenceImages: CampaignReferenceImage[];
    updatedAt: string;
}

const STORAGE_KEY_CAMPAIGNS = 'image-express-campaign-profiles';
const STORAGE_KEY_ACTIVE_ID = 'image-express-active-campaign-id';

export function createEmptyCampaign(name = 'New Campaign'): CampaignProfile {
    return {
        id: `campaign-${Date.now()}`,
        name,
        description: '',
        parameters: '',
        fonts: [],
        colors: [],
        assets: [],
        referenceImages: [],
        updatedAt: new Date().toISOString(),
    };
}

export function loadCampaigns(): CampaignProfile[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CAMPAIGNS);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as CampaignProfile[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveCampaigns(campaigns: CampaignProfile[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY_CAMPAIGNS, JSON.stringify(campaigns));
    } catch {
        // ignore storage errors
    }
}

export function getActiveCampaign(): CampaignProfile | null {
    const campaigns = loadCampaigns();
    if (campaigns.length === 0) return null;
    if (typeof window === 'undefined') return campaigns[0];
    try {
        const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
        return campaigns.find((c) => c.id === activeId) || campaigns[0];
    } catch {
        return campaigns[0];
    }
}

export function setActiveCampaignId(id: string): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
    } catch {
        // ignore
    }
}

export function saveCampaign(campaign: CampaignProfile): CampaignProfile[] {
    const campaigns = loadCampaigns();
    const updated = { ...campaign, updatedAt: new Date().toISOString() };
    const index = campaigns.findIndex((c) => c.id === updated.id);
    const next = index >= 0
        ? campaigns.map((c, i) => (i === index ? updated : c))
        : [...campaigns, updated];
    saveCampaigns(next);
    setActiveCampaignId(updated.id);
    return next;
}

export function deleteCampaign(id: string): CampaignProfile[] {
    const campaigns = loadCampaigns().filter((c) => c.id !== id);
    saveCampaigns(campaigns);
    if (campaigns.length > 0 && getActiveCampaign()?.id === id) {
        setActiveCampaignId(campaigns[0].id);
    }
    return campaigns;
}

/** Hydrate from the server store (shared source of truth); null when unreachable. */
export async function syncCampaignsFromServer(): Promise<{
    campaigns: CampaignProfile[];
    activeCampaign: CampaignProfile | null;
} | null> {
    try {
        const response = await fetch('/api/ai/campaign-manager/profile');
        if (!response.ok) return null;
        const data = await response.json() as {
            success?: boolean;
            campaigns?: CampaignProfile[];
            activeCampaign?: CampaignProfile | null;
        };
        if (!data.success || !Array.isArray(data.campaigns)) return null;
        saveCampaigns(data.campaigns);
        const activeCampaign = data.activeCampaign
            || (data.campaigns.length > 0 ? data.campaigns[0] : null);
        if (activeCampaign) setActiveCampaignId(activeCampaign.id);
        return { campaigns: data.campaigns, activeCampaign };
    } catch {
        return null;
    }
}

/** Push a campaign (or an active-campaign switch, or a deletion) to the server store; best-effort. */
export function pushCampaignToServer(payload: { campaign?: CampaignProfile; activeCampaignId?: string }): void {
    try {
        void fetch('/api/ai/campaign-manager/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch(() => undefined);
    } catch {
        // offline — the localStorage copy stays authoritative for this session
    }
}

export function pushCampaignDeleteToServer(id: string): void {
    try {
        void fetch(`/api/ai/campaign-manager/profile?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        }).catch(() => undefined);
    } catch {
        // best-effort
    }
}
