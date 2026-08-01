import path from 'path';
import { promises as fs } from 'fs';
import { getDataDir } from '@/lib/server/appPaths';
import { BrandProfile, DEFAULT_BRAND_PROFILE } from '@/lib/brand/brandProfile';
import {
    CustomAgentDefinition,
    DEFAULT_SOCIAL_AGENT,
    DEFAULT_SUPER_AGENT,
} from '@/lib/agent/superAgentEngine';

/**
 * Server-side store for Brand Kit profiles and Super Agent definitions.
 * This is the source of truth shared by the editor UI, the API, and MCP
 * clients — profiles saved in the modal are visible to `get_brand_profile`
 * and vice versa. Files live under data/brand/ (gitignored).
 */

const BRAND_DIR = () => path.join(getDataDir(), 'brand');
const PROFILES_FILE = () => path.join(BRAND_DIR(), 'brand-profiles.json');
const AGENTS_FILE = () => path.join(BRAND_DIR(), 'custom-agents.json');

interface ProfilesFileShape {
    activeProfileId: string;
    profiles: BrandProfile[];
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

export async function readBrandProfiles(): Promise<ProfilesFileShape> {
    const stored = await readJsonFile<ProfilesFileShape>(PROFILES_FILE());
    if (!stored || !Array.isArray(stored.profiles) || stored.profiles.length === 0) {
        return { activeProfileId: DEFAULT_BRAND_PROFILE.id, profiles: [DEFAULT_BRAND_PROFILE] };
    }
    return stored;
}

export async function getActiveBrandProfileServer(): Promise<BrandProfile> {
    const { activeProfileId, profiles } = await readBrandProfiles();
    return profiles.find((p) => p.id === activeProfileId) || profiles[0];
}

export async function upsertBrandProfile(
    profile: BrandProfile,
    makeActive = true
): Promise<ProfilesFileShape> {
    const current = await readBrandProfiles();
    const updated = { ...profile, updatedAt: new Date().toISOString() };
    const index = current.profiles.findIndex((p) => p.id === updated.id);
    const profiles = [...current.profiles];
    if (index >= 0) {
        profiles[index] = updated;
    } else {
        profiles.push(updated);
    }
    const next: ProfilesFileShape = {
        activeProfileId: makeActive ? updated.id : current.activeProfileId,
        profiles,
    };
    await writeJsonFile(PROFILES_FILE(), next);
    return next;
}

export async function setActiveBrandProfileServer(id: string): Promise<ProfilesFileShape> {
    const current = await readBrandProfiles();
    if (!current.profiles.some((p) => p.id === id)) return current;
    const next = { ...current, activeProfileId: id };
    await writeJsonFile(PROFILES_FILE(), next);
    return next;
}

export async function deleteBrandProfileServer(id: string): Promise<ProfilesFileShape> {
    const current = await readBrandProfiles();
    const filtered = current.profiles.filter((p) => p.id !== id);
    const profiles = filtered.length > 0 ? filtered : [DEFAULT_BRAND_PROFILE];
    const next: ProfilesFileShape = {
        activeProfileId: profiles.some((p) => p.id === current.activeProfileId)
            ? current.activeProfileId
            : profiles[0].id,
        profiles,
    };
    await writeJsonFile(PROFILES_FILE(), next);
    return next;
}

export async function readCustomAgents(): Promise<CustomAgentDefinition[]> {
    const stored = await readJsonFile<CustomAgentDefinition[]>(AGENTS_FILE());
    if (!stored || !Array.isArray(stored) || stored.length === 0) {
        return [DEFAULT_SUPER_AGENT, DEFAULT_SOCIAL_AGENT];
    }
    return stored;
}

export async function upsertCustomAgent(
    agent: CustomAgentDefinition
): Promise<CustomAgentDefinition[]> {
    const agents = await readCustomAgents();
    const updated = { ...agent, updatedAt: new Date().toISOString() };
    const index = agents.findIndex((a) => a.id === updated.id);
    const next = [...agents];
    if (index >= 0) {
        next[index] = updated;
    } else {
        next.push(updated);
    }
    await writeJsonFile(AGENTS_FILE(), next);
    return next;
}

export async function deleteCustomAgentServer(id: string): Promise<CustomAgentDefinition[]> {
    const agents = await readCustomAgents();
    const filtered = agents.filter((a) => a.id !== id);
    const next = filtered.length > 0 ? filtered : [DEFAULT_SUPER_AGENT];
    await writeJsonFile(AGENTS_FILE(), next);
    return next;
}
