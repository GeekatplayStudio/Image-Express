/**
 * Structured AI critique: profiles, the prompt that asks for them, and the
 * parser that turns a model's reply into a report with a fixed shape.
 *
 * The critique used to be free text under four headings. Two runs on the same
 * image produced differently organised prose, nothing could be scored or
 * compared, and nothing could be acted on from the result.
 *
 * A local vision model does not reliably follow a schema, so the structure is
 * enforced here rather than trusted: the criteria come from the profile, in the
 * profile's order, whatever the model returned; scores are clamped; severities
 * are normalised; and there is always at least one action to take. A reply that
 * is not JSON at all still yields a valid report, with the text as its summary.
 */

export type CritiqueProfileId = 'general' | 'composition' | 'typography' | 'brand' | 'conversion';

export type CritiqueSeverity = 'high' | 'medium' | 'low';

/** Where in the editor an action is carried out. */
export type CritiqueJump = 'text' | 'color' | 'layout' | 'crop' | 'none';

export interface CritiqueProfile {
    id: CritiqueProfileId;
    labelKey: string;
    /** What the critic is asked to judge. English: it goes into the prompt. */
    brief: string;
    /** Scored criteria, always reported in this order. */
    criteria: readonly string[];
    /** Used when the model offers no action of its own. */
    fallbackAction: CritiqueAction;
}

export interface CritiqueCriterionScore {
    name: string;
    /** 0–100, or null when the model did not score it. */
    score: number | null;
}

export interface CritiqueIssue {
    severity: CritiqueSeverity;
    title: string;
    detail: string;
}

export interface CritiqueAction {
    title: string;
    detail: string;
    jump: CritiqueJump;
}

export interface CritiqueReport {
    profile: CritiqueProfileId;
    summary: string;
    /** 0–100, or null when no score could be established. */
    score: number | null;
    criteria: CritiqueCriterionScore[];
    issues: CritiqueIssue[];
    /** Never empty. */
    actions: CritiqueAction[];
    /** False when the reply was not usable JSON and the report was rebuilt from text. */
    structured: boolean;
}

export const CRITIQUE_PROFILES: readonly CritiqueProfile[] = [
    {
        id: 'general',
        labelKey: 'critique.profile.general',
        brief: 'Give an all-round design review.',
        criteria: ['Composition', 'Hierarchy', 'Readability', 'Color', 'Spacing'],
        fallbackAction: { title: 'Strengthen the focal point', detail: 'Make one element clearly dominant so the eye has a place to start.', jump: 'layout' },
    },
    {
        id: 'composition',
        labelKey: 'critique.profile.composition',
        brief: 'Judge the composition: balance, focal point, alignment, use of space and visual flow.',
        criteria: ['Balance', 'Focal point', 'Alignment', 'Use of space', 'Visual flow'],
        fallbackAction: { title: 'Align elements to a common edge', detail: 'Pick one edge or centre line and snap the main elements to it.', jump: 'layout' },
    },
    {
        id: 'typography',
        labelKey: 'critique.profile.typography',
        brief: 'Judge the typography: hierarchy, legibility, font pairing, sizing and line spacing.',
        criteria: ['Hierarchy', 'Legibility', 'Font pairing', 'Sizing', 'Line spacing'],
        fallbackAction: { title: 'Increase the size contrast between heading and body', detail: 'A clear step in size makes the reading order obvious.', jump: 'text' },
    },
    {
        id: 'brand',
        labelKey: 'critique.profile.brand',
        brief: 'Judge brand consistency: a restrained palette, consistent fonts, logo treatment and a coherent visual tone.',
        criteria: ['Palette consistency', 'Font consistency', 'Logo treatment', 'Visual tone'],
        fallbackAction: { title: 'Reduce the palette to the brand colors', detail: 'Replace one-off colors with the nearest brand color.', jump: 'color' },
    },
    {
        id: 'conversion',
        labelKey: 'critique.profile.conversion',
        brief: 'Judge conversion readiness: is the offer clear, is there one obvious call to action, is it readable at a glance and at thumbnail size.',
        criteria: ['Message clarity', 'Call to action', 'Glance readability', 'Thumbnail legibility'],
        fallbackAction: { title: 'Make the call to action unmistakable', detail: 'Give it the strongest contrast on the page and room around it.', jump: 'layout' },
    },
];

export const DEFAULT_CRITIQUE_PROFILE: CritiqueProfileId = 'general';

export function getCritiqueProfile(id: string | undefined | null): CritiqueProfile {
    return CRITIQUE_PROFILES.find((profile) => profile.id === id) ?? CRITIQUE_PROFILES[0];
}

const JUMPS: readonly CritiqueJump[] = ['text', 'color', 'layout', 'crop', 'none'];

export function buildStructuredCritiquePrompt(options: {
    profile: CritiqueProfile;
    target: 'selection' | 'canvas';
    targetLabel: string;
    focus?: string;
}): string {
    const { profile } = options;
    const focus = options.focus?.trim();
    return [
        'You are a concise senior design critic reviewing a creative layout.',
        `Analyze the attached ${options.target === 'selection' ? 'selected layer crop' : 'full canvas'}: ${options.targetLabel}.`,
        profile.brief,
        focus ? `Focus request: ${focus}` : '',
        'Reply with a single JSON object and nothing else, in exactly this shape:',
        '{',
        '  "summary": "two sentences at most",',
        '  "score": 0-100,',
        `  "criteria": [${profile.criteria.map((name) => `{"name": "${name}", "score": 0-100}`).join(', ')}],`,
        '  "issues": [{"severity": "high|medium|low", "title": "short", "detail": "one sentence"}],',
        `  "actions": [{"title": "imperative, short", "detail": "one sentence", "jump": "${JUMPS.join('|')}"}]`,
        '}',
        'Score every listed criterion. List at most five issues, most severe first, and at least one action.',
        '"jump" names where the fix is made: text for type, color for palette or contrast, layout for position, size or spacing, crop for framing, none otherwise.',
        'If the image is blank, transparent, missing or unreadable, say so in the summary, set score to 0 and do not invent visual details.',
    ].filter(Boolean).join('\n');
}

const asText = (value: unknown, max = 400): string => (
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
);

const asScore = (value: unknown): number | null => {
    const number = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (typeof number !== 'number' || !Number.isFinite(number)) return null;
    return Math.round(Math.min(100, Math.max(0, number)));
};

const asSeverity = (value: unknown): CritiqueSeverity => {
    const text = asText(value).toLowerCase();
    if (/high|critical|severe|major/.test(text)) return 'high';
    if (/low|minor|nit/.test(text)) return 'low';
    return 'medium';
};

const asJump = (value: unknown): CritiqueJump => {
    const text = asText(value).toLowerCase();
    return (JUMPS as readonly string[]).includes(text) ? text as CritiqueJump : 'none';
};

/** Pull the first JSON object out of a reply that may wrap it in prose or a code fence. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

const SEVERITY_ORDER: Record<CritiqueSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Turn a model reply into a report with the profile's fixed structure. */
export function parseCritiqueResponse(text: string, profileId: string | undefined | null): CritiqueReport {
    const profile = getCritiqueProfile(profileId);
    const data = extractJsonObject(text);

    if (!data) {
        return {
            profile: profile.id,
            summary: text.trim().slice(0, 4000),
            score: null,
            criteria: profile.criteria.map((name) => ({ name, score: null })),
            issues: [],
            actions: [profile.fallbackAction],
            structured: false,
        };
    }

    const reported = Array.isArray(data.criteria) ? data.criteria as unknown[] : [];
    const scoreFor = (name: string): number | null => {
        const match = reported.find((entry) => (
            entry && typeof entry === 'object'
            && asText((entry as Record<string, unknown>).name).toLowerCase() === name.toLowerCase()
        )) as Record<string, unknown> | undefined;
        return match ? asScore(match.score) : null;
    };
    const criteria = profile.criteria.map((name) => ({ name, score: scoreFor(name) }));

    const issues = (Array.isArray(data.issues) ? data.issues as unknown[] : [])
        .map((entry) => (entry && typeof entry === 'object' ? entry as Record<string, unknown> : null))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => ({
            severity: asSeverity(entry.severity),
            title: asText(entry.title, 120),
            detail: asText(entry.detail),
        }))
        .filter((issue) => issue.title || issue.detail)
        .map((issue) => ({ ...issue, title: issue.title || issue.detail.slice(0, 80) }))
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        .slice(0, 5);

    let actions = (Array.isArray(data.actions) ? data.actions as unknown[] : [])
        .map((entry) => (entry && typeof entry === 'object' ? entry as Record<string, unknown> : null))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => ({ title: asText(entry.title, 120), detail: asText(entry.detail), jump: asJump(entry.jump) }))
        .filter((action) => action.title)
        .slice(0, 5);
    if (actions.length === 0) {
        // The acceptance rule: a critique always leaves something to do.
        actions = issues.length > 0
            ? [{ title: `Fix: ${issues[0].title}`, detail: issues[0].detail, jump: profile.fallbackAction.jump }]
            : [profile.fallbackAction];
    }

    const scored = criteria.map((entry) => entry.score).filter((score): score is number => score !== null);
    const overall = asScore(data.score)
        ?? (scored.length > 0 ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : null);

    return {
        profile: profile.id,
        summary: asText(data.summary, 600),
        score: overall,
        criteria,
        issues,
        actions,
        structured: true,
    };
}

/** The report as plain text, for callers that still want prose. */
export function formatCritiqueReport(report: CritiqueReport): string {
    if (!report.structured) return report.summary;
    const lines = [report.summary];
    if (report.score !== null) lines.push(`Score: ${report.score}/100`);
    if (report.issues.length > 0) {
        lines.push('', 'Issues');
        report.issues.forEach((issue) => lines.push(`- [${issue.severity}] ${issue.title}${issue.detail ? ` — ${issue.detail}` : ''}`));
    }
    lines.push('', 'Next Edits');
    report.actions.forEach((action) => lines.push(`- ${action.title}${action.detail ? ` — ${action.detail}` : ''}`));
    return lines.join('\n').trim();
}

/**
 * The text to parse from an Ollama reply.
 *
 * Normally that is "response". A thinking model can leave it empty and put its
 * whole answer in "thinking"; that is used only when it actually contains the
 * JSON object asked for, so a model's private reasoning is never shown as if
 * it were the critique.
 */
export function pickCritiqueText(response: unknown, thinking: unknown): string {
    const answer = typeof response === 'string' ? response.trim() : '';
    if (answer) return answer;
    const thought = typeof thinking === 'string' ? thinking.trim() : '';
    return thought && extractJsonObject(thought) ? thought : '';
}
