import {
    buildSuperAgentPlanLlmPrompt,
    DEFAULT_SUPER_AGENT,
    generateSuperAgentPlan,
    parseLlmPlanResponse,
    parsePromptDesignHints,
} from '../agent/superAgentEngine';
import { DEFAULT_BRAND_PROFILE } from '../brand/brandProfile';

describe('superAgentEngine', () => {
    it('generates multi-step plan from prompt and agent definition', () => {
        const plan = generateSuperAgentPlan(
            'Create a summer shoe sale banner',
            DEFAULT_SUPER_AGENT,
            DEFAULT_BRAND_PROFILE
        );

        expect(plan.agentId).toBe(DEFAULT_SUPER_AGENT.id);
        expect(plan.steps.length).toBeGreaterThanOrEqual(5);

        const actions = plan.steps.map((s) => s.action);
        expect(actions).toContain('SET_CANVAS_SIZE');
        expect(actions).toContain('SET_BACKGROUND_COLOR');
        expect(actions).toContain('ADD_TEXT');
        expect(actions).toContain('RUN_BRAND_AUDIT');
    });

    it('honors dimensions and color palette parsed from the prompt', () => {
        const plan = generateSuperAgentPlan(
            'Design a 1920x1080 product launch banner with brown palette',
            DEFAULT_SUPER_AGENT,
            DEFAULT_BRAND_PROFILE
        );

        const sizeStep = plan.steps.find((s) => s.action === 'SET_CANVAS_SIZE');
        expect(sizeStep?.params).toEqual(expect.objectContaining({ width: 1920, height: 1080 }));

        const bgStep = plan.steps.find((s) => s.action === 'SET_BACKGROUND_COLOR');
        expect(bgStep?.params.color).toBe('#2b1d12');
    });

    it('plans an AI-generated background when the prompt implies imagery', () => {
        const hints = parsePromptDesignHints('A promo card with a photo of a mountain landscape');
        expect(hints.wantsAiBackground).toBe(true);

        const plan = generateSuperAgentPlan(
            'A promo card with a photo of a mountain landscape',
            DEFAULT_SUPER_AGENT,
            DEFAULT_BRAND_PROFILE
        );
        expect(plan.steps.map((s) => s.action)).toContain('GENERATE_AI_BACKGROUND');
    });

    it('builds an LLM planning prompt containing brand rules and allowed actions', () => {
        const prompt = buildSuperAgentPlanLlmPrompt('Make a sale banner', DEFAULT_SUPER_AGENT, DEFAULT_BRAND_PROFILE);
        expect(prompt).toContain(DEFAULT_BRAND_PROFILE.palette.primary);
        expect(prompt).toContain('SET_CANVAS_SIZE');
        expect(prompt).toContain('RUN_BRAND_AUDIT');
        expect(prompt).toContain('Make a sale banner');
    });

    it('parses a valid LLM step-plan response and appends a missing audit step', () => {
        const llmResponse = `Here is the plan:
[
  {"action":"SET_CANVAS_SIZE","description":"Size","params":{"width":1200,"height":628}},
  {"action":"ADD_TEXT","description":"Title","params":{"text":"Sale!","fontSize":64}}
]`;
        const plan = parseLlmPlanResponse(llmResponse, 'Make a sale banner', DEFAULT_SUPER_AGENT);
        expect(plan).not.toBeNull();
        expect(plan?.steps[0].action).toBe('SET_CANVAS_SIZE');
        expect(plan?.steps[0].params.width).toBe(1200);
        expect(plan?.steps[plan.steps.length - 1].action).toBe('RUN_BRAND_AUDIT');
    });

    it('rejects LLM responses without a usable step list', () => {
        expect(parseLlmPlanResponse('sorry, no plan', 'x', DEFAULT_SUPER_AGENT)).toBeNull();
        expect(parseLlmPlanResponse('[{"action":"NOT_A_THING"}]', 'x', DEFAULT_SUPER_AGENT)).toBeNull();
    });
});
