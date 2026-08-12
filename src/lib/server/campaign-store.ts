import path from 'path';
import { promises as fs } from 'fs';
import { getDataDir } from '@/lib/server/appPaths';
import type { CampaignProfile } from '@/lib/campaign/campaignProfile';

/**
 * Server-side store for Campaign profiles — the source of truth shared by the
 * editor UI and the API, mirroring the Brand Kit store. Campaigns carry
 * data-URL assets/reference images, so the file can be large; it lives under
 * data/campaign/ (gitignored).
 */

const CAMPAIGN_DIR = () => path.join(getDataDir(), 'campaign');
const CAMPAIGNS_FILE = () => path.join(CAMPAIGN_DIR(), 'campaign-profiles.json');

interface CampaignsFileShape {
    activeCampaignId: string | null;
    campaigns: CampaignProfile[];
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export async function readCampaigns(): Promise<CampaignsFileShape> {
    const stored = await readJsonFile<CampaignsFileShape>(CAMPAIGNS_FILE());
    if (!stored || !Array.isArray(stored.campaigns)) {
        return { activeCampaignId: null, campaigns: [] };
    }
    return stored;
}

export async function upsertCampaign(
    campaign: CampaignProfile,
    makeActive = true,
): Promise<CampaignsFileShape> {
    const current = await readCampaigns();
    const updated = { ...campaign, updatedAt: new Date().toISOString() };
    const index = current.campaigns.findIndex((c) => c.id === updated.id);
    const campaigns = [...current.campaigns];
    if (index >= 0) {
        campaigns[index] = updated;
    } else {
        campaigns.push(updated);
    }
    const next: CampaignsFileShape = {
        activeCampaignId: makeActive ? updated.id : current.activeCampaignId,
        campaigns,
    };
    await writeJsonFile(CAMPAIGNS_FILE(), next);
    return next;
}

export async function setActiveCampaignServer(id: string): Promise<CampaignsFileShape> {
    const current = await readCampaigns();
    if (!current.campaigns.some((c) => c.id === id)) return current;
    const next = { ...current, activeCampaignId: id };
    await writeJsonFile(CAMPAIGNS_FILE(), next);
    return next;
}

export async function deleteCampaignServer(id: string): Promise<CampaignsFileShape> {
    const current = await readCampaigns();
    const campaigns = current.campaigns.filter((c) => c.id !== id);
    const next: CampaignsFileShape = {
        activeCampaignId: campaigns.some((c) => c.id === current.activeCampaignId)
            ? current.activeCampaignId
            : (campaigns[0]?.id ?? null),
        campaigns,
    };
    await writeJsonFile(CAMPAIGNS_FILE(), next);
    return next;
}
