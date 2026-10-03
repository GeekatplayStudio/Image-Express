/**
 * @jest-environment node
 */

import {
    checkRateLimit,
    clearRateLimit,
    consumeRateLimit,
    limitRequest,
    rateLimitClientKey,
    recordRateLimitHit,
    resetAllRateLimits,
    type RateLimitRule,
} from '@/lib/server/rateLimit';

const RULE: RateLimitRule = { name: 'test', limit: 3, windowMs: 10_000 };

const requestFrom = (forwardedFor?: string) =>
    new Request('http://localhost/api/x', {
        method: 'POST',
        headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    });

describe('rateLimit', () => {
    const originalRuntime = process.env.IMAGE_EXPRESS_RUNTIME;

    beforeEach(() => {
        resetAllRateLimits();
    });

    afterEach(() => {
        if (originalRuntime === undefined) delete process.env.IMAGE_EXPRESS_RUNTIME;
        else process.env.IMAGE_EXPRESS_RUNTIME = originalRuntime;
    });

    it('allows up to the limit and refuses the next call', () => {
        for (let i = 0; i < 3; i += 1) {
            expect(consumeRateLimit(RULE, 'a', 1_000 + i).allowed).toBe(true);
        }
        const refused = consumeRateLimit(RULE, 'a', 1_500);
        expect(refused.allowed).toBe(false);
        // The first hit (t=1000) leaves the window at t=11000.
        expect(refused.retryAfterSeconds).toBe(10);
    });

    it('frees budget as hits slide out of the window, one at a time', () => {
        consumeRateLimit(RULE, 'a', 0);
        consumeRateLimit(RULE, 'a', 4_000);
        consumeRateLimit(RULE, 'a', 8_000);
        expect(consumeRateLimit(RULE, 'a', 9_000).allowed).toBe(false);
        // Only the t=0 hit has expired: exactly one slot, not a fresh budget —
        // the property a fixed bucket would get wrong.
        expect(consumeRateLimit(RULE, 'a', 10_001).allowed).toBe(true);
        expect(consumeRateLimit(RULE, 'a', 10_002).allowed).toBe(false);
    });

    it('does not extend the lockout when refused calls keep arriving', () => {
        for (let i = 0; i < 3; i += 1) consumeRateLimit(RULE, 'a', 0);
        for (let t = 1_000; t <= 9_000; t += 1_000) {
            expect(consumeRateLimit(RULE, 'a', t).allowed).toBe(false);
        }
        expect(consumeRateLimit(RULE, 'a', 10_001).allowed).toBe(true);
    });

    it('keeps keys and rules independent', () => {
        for (let i = 0; i < 3; i += 1) consumeRateLimit(RULE, 'a', 0);
        expect(consumeRateLimit(RULE, 'b', 0).allowed).toBe(true);
        expect(consumeRateLimit({ ...RULE, name: 'other' }, 'a', 0).allowed).toBe(true);
    });

    it('checkRateLimit never spends budget', () => {
        for (let i = 0; i < 10; i += 1) {
            expect(checkRateLimit(RULE, 'a', 0).allowed).toBe(true);
        }
    });

    it('recordRateLimitHit spends without asking, and clearRateLimit forgives', () => {
        for (let i = 0; i < 5; i += 1) recordRateLimitHit(RULE, 'a', 0);
        expect(checkRateLimit(RULE, 'a', 1).allowed).toBe(false);
        clearRateLimit(RULE, 'a');
        expect(checkRateLimit(RULE, 'a', 1).allowed).toBe(true);
    });

    it('bounds the number of tracked keys, evicting the least recently hit', () => {
        const one: RateLimitRule = { name: 'bound', limit: 1, windowMs: 60_000 };
        recordRateLimitHit(one, 'first', 0);
        for (let i = 0; i < 10_000; i += 1) recordRateLimitHit(one, `k${i}`, 0);
        // 10,001 keys were hit; the oldest was dropped to hold the cap.
        expect(checkRateLimit(one, 'first', 1).allowed).toBe(true);
        expect(checkRateLimit(one, 'k9999', 1).allowed).toBe(false);
    });

    it('shares one budget on local profiles, whatever the forwarded header says', () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'desktop-local';
        expect(rateLimitClientKey(requestFrom('1.2.3.4'))).toBe('local');
        expect(rateLimitClientKey(requestFrom())).toBe('local');
    });

    it('keys on the first forwarded address when self-hosted', () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'self-hosted';
        expect(rateLimitClientKey(requestFrom('1.2.3.4, 10.0.0.1'))).toBe('1.2.3.4');
        expect(rateLimitClientKey(requestFrom())).toBe('unknown');
    });

    it('limitRequest answers 429 with Retry-After once the budget is spent', async () => {
        process.env.IMAGE_EXPRESS_RUNTIME = 'developer-local';
        const rule: RateLimitRule = { name: 'route', limit: 2, windowMs: 60_000 };
        expect(limitRequest(requestFrom(), rule)).toBeNull();
        expect(limitRequest(requestFrom(), rule)).toBeNull();
        const refused = limitRequest(requestFrom(), rule);
        expect(refused?.status).toBe(429);
        expect(Number(refused?.headers.get('retry-after'))).toBeGreaterThan(0);
        await expect(refused?.json()).resolves.toMatchObject({ success: false });
    });
});
