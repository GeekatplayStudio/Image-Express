import {
    createEmptyCampaign,
    deleteCampaign,
    getActiveCampaign,
    loadCampaigns,
    saveCampaign,
    setActiveCampaignId,
} from '@/lib/campaign/campaignProfile';

describe('campaign profile persistence', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('starts empty and round-trips a saved campaign', () => {
        expect(loadCampaigns()).toEqual([]);
        const campaign = { ...createEmptyCampaign('Summer Sale'), colors: ['#ff0000'] };
        const list = saveCampaign(campaign);
        expect(list).toHaveLength(1);
        expect(loadCampaigns()[0].name).toBe('Summer Sale');
        expect(loadCampaigns()[0].colors).toEqual(['#ff0000']);
    });

    it('stores multiple campaigns and tracks the active one', () => {
        const first = createEmptyCampaign('First');
        const second = { ...createEmptyCampaign('Second'), id: 'campaign-second' };
        saveCampaign(first);
        saveCampaign(second);
        expect(loadCampaigns()).toHaveLength(2);
        // saveCampaign makes the saved one active
        expect(getActiveCampaign()?.name).toBe('Second');
        setActiveCampaignId(first.id);
        expect(getActiveCampaign()?.name).toBe('First');
    });

    it('updates an existing campaign in place by id', () => {
        const campaign = createEmptyCampaign('Original');
        saveCampaign(campaign);
        saveCampaign({ ...campaign, name: 'Renamed' });
        const list = loadCampaigns();
        expect(list).toHaveLength(1);
        expect(list[0].name).toBe('Renamed');
    });

    it('deletes campaigns and reassigns the active id', () => {
        const first = createEmptyCampaign('First');
        const second = { ...createEmptyCampaign('Second'), id: 'campaign-second' };
        saveCampaign(first);
        saveCampaign(second);
        deleteCampaign(second.id);
        const list = loadCampaigns();
        expect(list).toHaveLength(1);
        expect(getActiveCampaign()?.id).toBe(first.id);
    });
});
