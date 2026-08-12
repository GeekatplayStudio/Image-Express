import type { CanvasMetadataSummary } from '@/lib/brand/brandAuditEngine';
import {
    buildCampaignAuditInstructions,
    campaignToBrandProfile,
    runHeuristicCampaignAudit,
} from '@/lib/campaign/campaignAuditEngine';
import { createEmptyCampaign } from '@/lib/campaign/campaignProfile';

const metadataWith = (layers: CanvasMetadataSummary['layers']): CanvasMetadataSummary => ({
    canvasWidth: 800,
    canvasHeight: 600,
    layerCount: layers.length,
    layers,
});

const textLayer = (overrides: Partial<CanvasMetadataSummary['layers'][number]> = {}) => ({
    id: 'layer-1',
    name: 'Headline',
    type: 'textbox',
    left: 100,
    top: 100,
    width: 200,
    height: 50,
    fontFamily: 'Comic Sans MS',
    fill: '#ff00ff',
    text: 'Hello',
    ...overrides,
});

describe('campaignToBrandProfile', () => {
    it('maps fonts and colors across and zeroes every rule campaigns do not define', () => {
        const campaign = {
            ...createEmptyCampaign('Summer'),
            fonts: ['Inter', 'Lato'],
            colors: ['#111111', '#222222'],
        };
        const adapter = campaignToBrandProfile(campaign);
        expect(adapter.typography.allowedFonts).toEqual(['Inter', 'Lato']);
        expect(adapter.typography.primaryFont).toBe('Inter');
        expect(adapter.palette.allowedColors).toEqual(['#111111', '#222222']);
        expect(adapter.layout.minMargin).toBe(0);
        expect(adapter.layout.contrastRatioMin).toBe(0);
        expect(adapter.typography.minBodySize).toBe(0);
        expect(adapter.logo.requiredPosition).toBe('any');
    });
});

describe('runHeuristicCampaignAudit', () => {
    it('flags off-campaign fonts and colors', () => {
        const campaign = {
            ...createEmptyCampaign('Strict'),
            fonts: ['Inter'],
            colors: ['#111111'],
        };
        const report = runHeuristicCampaignAudit(metadataWith([textLayer()]), campaign);
        const categories = report.violations.map((v) => v.category).sort();
        expect(categories).toEqual(['color', 'typography']);
        expect(report.profileName).toBe('Strict');
    });

    it('places no font constraint when the campaign lists no fonts', () => {
        const campaign = {
            ...createEmptyCampaign('Colors only'),
            colors: ['#111111'],
        };
        const report = runHeuristicCampaignAudit(metadataWith([textLayer()]), campaign);
        expect(report.violations.map((v) => v.category)).toEqual(['color']);
        // Score recomputed after dropping the font violation
        expect(report.overallScore).toBe(85);
    });

    it('passes a compliant canvas', () => {
        const campaign = {
            ...createEmptyCampaign('Loose'),
            fonts: ['Comic Sans MS'],
            colors: ['#ff00ff'],
        };
        const report = runHeuristicCampaignAudit(metadataWith([textLayer()]), campaign);
        expect(report.violations).toEqual([]);
        expect(report.status).toBe('pass');
    });

    it('places no color constraint when the campaign lists no colors', () => {
        const campaign = createEmptyCampaign('Anything goes');
        const report = runHeuristicCampaignAudit(metadataWith([textLayer()]), campaign);
        expect(report.violations).toEqual([]);
    });
});

describe('buildCampaignAuditInstructions', () => {
    it('includes plain-language requirements, context, and reference count', () => {
        const campaign = {
            ...createEmptyCampaign('Summer'),
            description: 'For families',
            parameters: 'Always cheerful. Never red.',
            referenceImages: [{ id: 'r1', name: 'moodboard', dataUrl: 'data:image/png;base64,AA' }],
        };
        const instructions = buildCampaignAuditInstructions(campaign);
        expect(instructions).toContain('Always cheerful. Never red.');
        expect(instructions).toContain('For families');
        expect(instructions).toContain('moodboard');
    });

    it('returns an empty string for a bare campaign', () => {
        expect(buildCampaignAuditInstructions(createEmptyCampaign('Bare'))).toBe('');
    });
});
