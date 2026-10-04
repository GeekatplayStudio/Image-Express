import {
    CRITIQUE_PROFILES,
    buildStructuredCritiquePrompt,
    extractJsonObject,
    formatCritiqueReport,
    getCritiqueProfile,
    parseCritiqueResponse,
    pickCritiqueText,
} from '@/lib/critique/critiqueReport';

const GOOD_REPLY = JSON.stringify({
    summary: 'A clean poster with a weak headline.',
    score: 68,
    criteria: [
        { name: 'Hierarchy', score: 55 },
        { name: 'Legibility', score: 80 },
        { name: 'Font pairing', score: 70 },
        { name: 'Sizing', score: 60 },
        { name: 'Line spacing', score: 75 },
    ],
    issues: [
        { severity: 'low', title: 'Tight leading', detail: 'Body lines nearly touch.' },
        { severity: 'high', title: 'Headline too small', detail: 'It does not read first.' },
    ],
    actions: [{ title: 'Enlarge the headline', detail: 'Roughly double it.', jump: 'text' }],
});

describe('profiles', () => {
    it('covers the four named profiles plus a general one', () => {
        expect(CRITIQUE_PROFILES.map((profile) => profile.id))
            .toEqual(['general', 'composition', 'typography', 'brand', 'conversion']);
    });

    it('gives every profile criteria and a concrete fallback action', () => {
        for (const profile of CRITIQUE_PROFILES) {
            expect(profile.criteria.length).toBeGreaterThanOrEqual(4);
            expect(profile.fallbackAction.title).toBeTruthy();
            expect(profile.fallbackAction.jump).not.toBe('none');
        }
    });

    it('falls back to the general profile for an unknown id', () => {
        expect(getCritiqueProfile('nonsense').id).toBe('general');
        expect(getCritiqueProfile(undefined).id).toBe('general');
    });
});

describe('buildStructuredCritiquePrompt', () => {
    it('names the profile criteria so the model scores exactly those', () => {
        const prompt = buildStructuredCritiquePrompt({
            profile: getCritiqueProfile('typography'),
            target: 'canvas',
            targetLabel: 'Full canvas',
        });
        for (const criterion of getCritiqueProfile('typography').criteria) {
            expect(prompt).toContain(`"name": "${criterion}"`);
        }
        expect(prompt).toContain('single JSON object');
    });

    it('includes the user focus only when there is one', () => {
        const base = { profile: getCritiqueProfile('general'), target: 'selection' as const, targetLabel: 'Logo' };
        expect(buildStructuredCritiquePrompt({ ...base, focus: 'Is the logo readable?' })).toContain('Focus request: Is the logo readable?');
        expect(buildStructuredCritiquePrompt({ ...base, focus: '   ' })).not.toContain('Focus request');
    });
});

describe('extractJsonObject', () => {
    it('finds JSON inside a code fence or surrounding prose', () => {
        expect(extractJsonObject('Here you go:\n```json\n{"score": 5}\n```\nHope that helps.')).toEqual({ score: 5 });
    });

    it('returns null for prose, arrays and broken JSON', () => {
        expect(extractJsonObject('Summary\nLooks fine.')).toBeNull();
        expect(extractJsonObject('[1, 2, 3]')).toBeNull();
        expect(extractJsonObject('{"score": ')).toBeNull();
    });
});

describe('parseCritiqueResponse', () => {
    it('produces the profile structure from a well-formed reply', () => {
        const report = parseCritiqueResponse(GOOD_REPLY, 'typography');
        expect(report.structured).toBe(true);
        expect(report.score).toBe(68);
        expect(report.criteria.map((entry) => entry.name)).toEqual(getCritiqueProfile('typography').criteria);
        expect(report.criteria[0]).toEqual({ name: 'Hierarchy', score: 55 });
        expect(report.actions).toEqual([{ title: 'Enlarge the headline', detail: 'Roughly double it.', jump: 'text' }]);
    });

    it('orders issues most severe first', () => {
        expect(parseCritiqueResponse(GOOD_REPLY, 'typography').issues.map((issue) => issue.severity)).toEqual(['high', 'low']);
    });

    it('yields the same structure for the same profile whatever the model returned', () => {
        // The acceptance rule. Three very different replies, one shape.
        const shape = (text: string) => {
            const report = parseCritiqueResponse(text, 'composition');
            return { names: report.criteria.map((entry) => entry.name), keys: Object.keys(report).sort(), hasAction: report.actions.length > 0 };
        };
        const expected = shape(GOOD_REPLY);
        expect(shape('{"summary": "ok"}')).toEqual(expected);
        expect(shape('Just some prose with no JSON at all.')).toEqual(expected);
        expect(expected.names).toEqual(getCritiqueProfile('composition').criteria);
    });

    it('ignores criteria the profile did not ask for and leaves unscored ones null', () => {
        const report = parseCritiqueResponse(JSON.stringify({
            criteria: [{ name: 'hierarchy', score: 40 }, { name: 'Vibes', score: 99 }],
        }), 'typography');
        expect(report.criteria.find((entry) => entry.name === 'Hierarchy')?.score).toBe(40);
        expect(report.criteria.some((entry) => entry.name === 'Vibes')).toBe(false);
        expect(report.criteria.find((entry) => entry.name === 'Sizing')?.score).toBeNull();
    });

    it('clamps scores and accepts numeric strings', () => {
        const report = parseCritiqueResponse(JSON.stringify({
            score: 140,
            criteria: [{ name: 'Hierarchy', score: -20 }, { name: 'Legibility', score: '72.6' }, { name: 'Sizing', score: 'great' }],
        }), 'typography');
        expect(report.score).toBe(100);
        expect(report.criteria.find((entry) => entry.name === 'Hierarchy')?.score).toBe(0);
        expect(report.criteria.find((entry) => entry.name === 'Legibility')?.score).toBe(73);
        expect(report.criteria.find((entry) => entry.name === 'Sizing')?.score).toBeNull();
    });

    it('derives the overall score from the criteria when the model omits it', () => {
        const report = parseCritiqueResponse(JSON.stringify({
            criteria: [{ name: 'Hierarchy', score: 60 }, { name: 'Legibility', score: 80 }],
        }), 'typography');
        expect(report.score).toBe(70);
    });

    it('always leaves at least one action', () => {
        const fromIssue = parseCritiqueResponse(JSON.stringify({
            issues: [{ severity: 'high', title: 'Low contrast', detail: 'Text fades into the photo.' }],
            actions: [],
        }), 'brand');
        expect(fromIssue.actions).toHaveLength(1);
        expect(fromIssue.actions[0].title).toContain('Low contrast');
        expect(fromIssue.actions[0].jump).toBe('color');

        const fromProfile = parseCritiqueResponse('{"summary": "Looks good."}', 'conversion');
        expect(fromProfile.actions).toEqual([getCritiqueProfile('conversion').fallbackAction]);
    });

    it('normalises loose severities and unknown jump targets', () => {
        const report = parseCritiqueResponse(JSON.stringify({
            issues: [{ severity: 'CRITICAL', title: 'a' }, { severity: 'nitpick', title: 'b' }, { severity: 'whatever', title: 'c' }],
            actions: [{ title: 'Do it', jump: 'teleport' }],
        }), 'general');
        expect(report.issues.map((issue) => issue.severity)).toEqual(['high', 'medium', 'low']);
        expect(report.actions[0].jump).toBe('none');
    });

    it('drops empty entries and caps the lists', () => {
        const report = parseCritiqueResponse(JSON.stringify({
            issues: [...Array.from({ length: 9 }, (_, index) => ({ severity: 'low', title: `issue ${index}` })), { title: '', detail: '' }, 'junk'],
            actions: [{ title: '' }, null],
        }), 'general');
        expect(report.issues).toHaveLength(5);
        expect(report.actions).toHaveLength(1);
    });

    it('keeps a plain-text reply as the summary and says it is unstructured', () => {
        const report = parseCritiqueResponse('Summary\nThe layout is busy.', 'general');
        expect(report.structured).toBe(false);
        expect(report.summary).toContain('The layout is busy.');
        expect(report.score).toBeNull();
    });
});

describe('formatCritiqueReport', () => {
    it('renders a structured report as readable text', () => {
        const text = formatCritiqueReport(parseCritiqueResponse(GOOD_REPLY, 'typography'));
        expect(text).toContain('Score: 68/100');
        expect(text).toContain('[high] Headline too small');
        expect(text).toContain('Enlarge the headline');
    });

    it('returns the raw text for an unstructured one', () => {
        expect(formatCritiqueReport(parseCritiqueResponse('Plain words.', 'general'))).toBe('Plain words.');
    });
});

describe('pickCritiqueText', () => {
    it('uses the response when there is one', () => {
        expect(pickCritiqueText('  {"score": 5}  ', 'private reasoning')).toBe('{"score": 5}');
    });

    it('falls back to thinking only when it holds the JSON that was asked for', () => {
        // Measured with qwen3-vl in JSON mode: empty response, answer in thinking.
        expect(pickCritiqueText('', '{"summary": "ok", "score": 70}')).toBe('{"summary": "ok", "score": 70}');
        // Ordinary reasoning must never be shown as the critique.
        expect(pickCritiqueText('', 'Got it, let me look at the image first...')).toBe('');
    });

    it('returns nothing for missing or non-string fields', () => {
        expect(pickCritiqueText(undefined, undefined)).toBe('');
        expect(pickCritiqueText(null, 42)).toBe('');
    });
});
