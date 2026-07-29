import {
    DEFAULT_SUPER_AGENT,
    generateSuperAgentPlan,
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
});
