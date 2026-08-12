import type * as fabric from 'fabric';
import {
    autoFixViolationOnCanvas,
    runHeuristicBrandAudit,
    type BrandAuditReport,
    type BrandViolation,
    type CanvasMetadataSummary,
} from '@/lib/brand/brandAuditEngine';
import { DEFAULT_BRAND_PROFILE, type BrandProfile } from '@/lib/brand/brandProfile';
import type { CampaignProfile } from '@/lib/campaign/campaignProfile';

/**
 * Campaign audits reuse the brand audit machinery by expressing a campaign as
 * a synthetic BrandProfile: fonts and palette map straight across, and every
 * rule a campaign does not define is zeroed so the brand engine skips it
 * (margins, contrast, logo placement, minimum text sizes). What campaigns add
 * on top — the plain-language requirements — travels to the AI audit as extra
 * prompt instructions.
 */
export function campaignToBrandProfile(campaign: CampaignProfile): BrandProfile {
    const colors = campaign.colors.filter(Boolean);
    return {
        id: `campaign-adapter-${campaign.id}`,
        name: campaign.name,
        description: campaign.description,
        palette: {
            id: `campaign-palette-${campaign.id}`,
            name: `${campaign.name} palette`,
            primary: colors[0] || DEFAULT_BRAND_PROFILE.palette.primary,
            secondary: colors[1] || colors[0] || DEFAULT_BRAND_PROFILE.palette.secondary,
            accent: colors[2] || colors[0] || DEFAULT_BRAND_PROFILE.palette.accent,
            background: '#ffffff',
            allowedColors: colors,
        },
        typography: {
            primaryFont: campaign.fonts[0] || 'Inter',
            secondaryFont: campaign.fonts[1] || campaign.fonts[0] || 'Inter',
            allowedFonts: campaign.fonts,
            // Zeroed: campaigns do not constrain text sizes.
            minHeadingSize: 0,
            minBodySize: 0,
        },
        logo: {
            requiredPosition: 'any',
            minPadding: 0,
            minWidth: 0,
        },
        layout: {
            minMargin: 0,
            contrastRatioMin: 0,
        },
        assets: [],
        updatedAt: campaign.updatedAt,
    };
}

const severityPenalty = (violation: BrandViolation): number => {
    if (violation.severity === 'high') return 25;
    if (violation.severity === 'medium') return 15;
    return 8;
};

/**
 * Deterministic campaign audit: font allowed-list and palette compliance.
 * A campaign with no fonts configured places no font constraint (the brand
 * engine would flag every font against an empty allowed list, so those
 * violations are filtered back out and the score recomputed).
 */
export function runHeuristicCampaignAudit(
    metadata: CanvasMetadataSummary,
    campaign: CampaignProfile,
): BrandAuditReport {
    const adapter = campaignToBrandProfile(campaign);
    const report = runHeuristicBrandAudit(metadata, adapter);

    const violations = campaign.fonts.length > 0
        ? report.violations
        : report.violations.filter((violation) => violation.category !== 'typography');

    if (violations.length === report.violations.length) {
        return { ...report, profileName: campaign.name };
    }

    const overallScore = Math.max(0, Math.min(100, 100 - violations.reduce(
        (acc, violation) => acc + severityPenalty(violation), 0,
    )));
    const status: BrandAuditReport['status'] = overallScore >= 85 ? 'pass' : overallScore >= 60 ? 'warning' : 'fail';
    return {
        ...report,
        profileName: campaign.name,
        violations,
        overallScore,
        status,
        summary: violations.length === 0
            ? `Design complies with campaign "${campaign.name}".`
            : `Found ${violations.length} compliance issue(s) against campaign "${campaign.name}". Overall compliance rating is ${overallScore}%.`,
    };
}

/** The plain-language requirements, phrased for the AI auditor's prompt. */
export function buildCampaignAuditInstructions(campaign: CampaignProfile): string {
    const sections: string[] = [];
    if (campaign.parameters.trim()) {
        sections.push(`CAMPAIGN REQUIREMENTS (plain language, judge the design against every one):\n${campaign.parameters.trim()}`);
    }
    if (campaign.description.trim()) {
        sections.push(`CAMPAIGN CONTEXT: ${campaign.description.trim()}`);
    }
    if (campaign.referenceImages.length > 0) {
        sections.push(`REFERENCE STYLE: The campaign has ${campaign.referenceImages.length} reference image(s) named ${campaign.referenceImages.map((r) => r.name).join(', ')}. Judge whether the design's style plausibly matches that direction.`);
    }
    return sections.join('\n\n');
}

/** Auto-fix delegates to the brand fixer through the campaign adapter (font swap, palette snap). */
export function autoFixCampaignViolationOnCanvas(
    violation: BrandViolation,
    canvas: fabric.Canvas,
    campaign: CampaignProfile,
): boolean {
    return autoFixViolationOnCanvas(violation, canvas, campaignToBrandProfile(campaign));
}

export function autoFixAllCampaignViolationsOnCanvas(
    report: BrandAuditReport,
    canvas: fabric.Canvas,
    campaign: CampaignProfile,
): number {
    let fixed = 0;
    for (const violation of report.violations) {
        if (autoFixCampaignViolationOnCanvas(violation, canvas, campaign)) fixed += 1;
    }
    return fixed;
}
