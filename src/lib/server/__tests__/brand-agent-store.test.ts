import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { DEFAULT_BRAND_PROFILE } from '@/lib/brand/brandProfile';
import { DEFAULT_SUPER_AGENT } from '@/lib/agent/superAgentEngine';
import {
    deleteBrandProfileServer,
    deleteCustomAgentServer,
    getActiveBrandProfileServer,
    readBrandProfiles,
    readCustomAgents,
    setActiveBrandProfileServer,
    upsertBrandProfile,
    upsertCustomAgent,
} from '../brand-agent-store';

describe('brand-agent-store', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brand-store-test-'));
        process.env.IMAGE_EXPRESS_DATA_DIR = tempDir;
    });

    afterEach(async () => {
        delete process.env.IMAGE_EXPRESS_DATA_DIR;
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('returns defaults when no files exist', async () => {
        const { activeProfileId, profiles } = await readBrandProfiles();
        expect(activeProfileId).toBe(DEFAULT_BRAND_PROFILE.id);
        expect(profiles).toHaveLength(1);

        const agents = await readCustomAgents();
        expect(agents.length).toBeGreaterThanOrEqual(1);
        expect(agents[0].id).toBe(DEFAULT_SUPER_AGENT.id);
    });

    it('persists brand profiles to disk and makes the saved profile active', async () => {
        const custom = { ...DEFAULT_BRAND_PROFILE, id: 'acme', name: 'Acme', isDefault: false };
        await upsertBrandProfile(custom);

        const { activeProfileId, profiles } = await readBrandProfiles();
        expect(activeProfileId).toBe('acme');
        expect(profiles.map((p) => p.id)).toEqual([DEFAULT_BRAND_PROFILE.id, 'acme']);
        expect((await getActiveBrandProfileServer()).name).toBe('Acme');

        // Survives via file, not memory
        const raw = await fs.readFile(path.join(tempDir, 'brand', 'brand-profiles.json'), 'utf8');
        expect(JSON.parse(raw).profiles).toHaveLength(2);
    });

    it('switches and deletes profiles with active-id reassignment', async () => {
        await upsertBrandProfile({ ...DEFAULT_BRAND_PROFILE, id: 'acme', name: 'Acme' });
        await setActiveBrandProfileServer(DEFAULT_BRAND_PROFILE.id);
        expect((await readBrandProfiles()).activeProfileId).toBe(DEFAULT_BRAND_PROFILE.id);

        await setActiveBrandProfileServer('acme');
        const afterDelete = await deleteBrandProfileServer('acme');
        expect(afterDelete.activeProfileId).toBe(DEFAULT_BRAND_PROFILE.id);
        expect(afterDelete.profiles.map((p) => p.id)).toEqual([DEFAULT_BRAND_PROFILE.id]);
    });

    it('persists, updates, and deletes custom agents', async () => {
        const agent = { ...DEFAULT_SUPER_AGENT, id: 'poster-bot', name: 'Poster Bot', isDefault: false };
        await upsertCustomAgent(agent);
        await upsertCustomAgent({ ...agent, name: 'Poster Bot v2' });

        const agents = await readCustomAgents();
        expect(agents.filter((a) => a.id === 'poster-bot')).toHaveLength(1);
        expect(agents.find((a) => a.id === 'poster-bot')?.name).toBe('Poster Bot v2');

        const remaining = await deleteCustomAgentServer('poster-bot');
        expect(remaining.some((a) => a.id === 'poster-bot')).toBe(false);
    });
});
