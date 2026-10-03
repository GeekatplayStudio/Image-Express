import { NextResponse } from 'next/server';
import { getRuntimeProfile } from '@/lib/server/runtimeProfile';

/**
 * In-memory request rate limiting.
 *
 * Deliberately process-local: the app is a single process on one machine (see
 * ROADMAP §5, "Horizontal scaling"), so a shared store would be infrastructure
 * with nothing to share. Counters reset on restart, which is acceptable — the
 * windows are minutes long and a restart is not something an attacker controls.
 *
 * Each rule is a sliding window: at most `limit` hits per `windowMs`, per key.
 * A sliding log rather than fixed buckets, because a fixed bucket lets a caller
 * spend two full budgets back to back across the boundary.
 */

export interface RateLimitRule {
    /** Namespaces the counters; two rules never share a budget. */
    name: string;
    limit: number;
    windowMs: number;
}

export interface RateLimitDecision {
    allowed: boolean;
    /** Whole seconds until the oldest counted hit leaves the window. 0 when allowed. */
    retryAfterSeconds: number;
}

/**
 * Upper bound on tracked keys. Keys can be caller-chosen (a login identifier),
 * so without a cap the limiter itself would be a memory-exhaustion vector.
 */
const MAX_TRACKED_KEYS = 10_000;

const GLOBAL_KEY = '__imageExpressRateLimitHits__';
type RateLimitGlobal = typeof globalThis & { [GLOBAL_KEY]?: Map<string, number[]> };

// Pinned to `globalThis` for the same reason as the job scheduler: dev-mode HMR
// and per-route bundles would otherwise each get their own counters.
function hitStore(): Map<string, number[]> {
    const scope = globalThis as RateLimitGlobal;
    if (!scope[GLOBAL_KEY]) scope[GLOBAL_KEY] = new Map();
    return scope[GLOBAL_KEY];
}

const storeKey = (rule: RateLimitRule, key: string) => `${rule.name}\u0000${key}`;

function liveHits(rule: RateLimitRule, key: string, now: number): number[] {
    const store = hitStore();
    const id = storeKey(rule, key);
    const hits = store.get(id);
    if (!hits) return [];
    const cutoff = now - rule.windowMs;
    const live = hits.filter((time) => time > cutoff);
    if (live.length === 0) store.delete(id);
    else if (live.length !== hits.length) store.set(id, live);
    return live;
}

function decide(rule: RateLimitRule, live: number[], now: number): RateLimitDecision {
    if (live.length < rule.limit) return { allowed: true, retryAfterSeconds: 0 };
    // The slot that frees up first is the oldest hit still inside the budget.
    const oldestCounted = live[live.length - rule.limit];
    const waitMs = oldestCounted + rule.windowMs - now;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
}

/** Whether `key` has budget left, without spending any. */
export function checkRateLimit(rule: RateLimitRule, key: string, now = Date.now()): RateLimitDecision {
    return decide(rule, liveHits(rule, key, now), now);
}

/** Spend one unit of `key`'s budget unconditionally. */
export function recordRateLimitHit(rule: RateLimitRule, key: string, now = Date.now()): void {
    const store = hitStore();
    const id = storeKey(rule, key);
    const live = liveHits(rule, key, now);
    // Never keep more than `limit` timestamps: beyond that they change nothing
    // about the decision except to push the retry time out, which the newest
    // `limit` entries already capture.
    const next = [...live, now].slice(-rule.limit);
    // Re-insert so the map's insertion order doubles as least-recently-hit order.
    store.delete(id);
    store.set(id, next);
    if (store.size > MAX_TRACKED_KEYS) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
    }
}

/** Check and, if allowed, spend. A refused call does not extend the lockout. */
export function consumeRateLimit(rule: RateLimitRule, key: string, now = Date.now()): RateLimitDecision {
    const decision = checkRateLimit(rule, key, now);
    if (decision.allowed) recordRateLimitHit(rule, key, now);
    return decision;
}

export function clearRateLimit(rule: RateLimitRule, key: string): void {
    hitStore().delete(storeKey(rule, key));
}

/** Test hook: drop every counter. */
export function resetAllRateLimits(): void {
    hitStore().clear();
}

/**
 * Who a request is counted against.
 *
 * On the local profiles every caller is the one machine, so there is a single
 * shared budget. On `self-hosted` it is the forwarded client address, which a
 * caller can forge unless a reverse proxy overwrites the header — so anything
 * that must hold against a determined attacker (password guessing) is *also*
 * keyed on something the caller cannot vary: the account being attacked.
 */
export function rateLimitClientKey(request: Request): string {
    if (getRuntimeProfile() !== 'self-hosted') return 'local';
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    return forwarded ? forwarded.slice(0, 64) : 'unknown';
}

/** The 429 the legacy `{ success, message }` routes answer with. */
export function rateLimitedResponse(decision: RateLimitDecision): NextResponse {
    return NextResponse.json(
        { success: false, message: 'Too many attempts. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } },
    );
}

/**
 * Count this request against `rule` for its client. Returns a response to send,
 * or null to continue — the same shape as `enforceJsonBody`, for the same
 * reason: these routes have their own catch, and a thrown error would surface
 * as their generic 500.
 */
export function limitRequest(request: Request, rule: RateLimitRule): NextResponse | null {
    const decision = consumeRateLimit(rule, rateLimitClientKey(request));
    return decision.allowed ? null : rateLimitedResponse(decision);
}

const MINUTE = 60_000;

/**
 * Wrong-credential attempts against one account. Keyed on the account, so it
 * holds no matter how many addresses the guesses come from. Counted on failure
 * only and cleared on success, so the owner signing in normally never meets it.
 */
export const AUTH_ACCOUNT_FAILURE_LIMIT: RateLimitRule = { name: 'auth-account-failure', limit: 10, windowMs: 15 * MINUTE };

/** Every auth request from one client, successful or not. */
export const AUTH_CLIENT_LIMIT: RateLimitRule = { name: 'auth-client', limit: 30, windowMs: 5 * MINUTE };

/**
 * Account creation and reset-mail requests: each one writes a user record or
 * sends a notification, so the useful ceiling is far below the sign-in one.
 */
export const AUTH_SIDE_EFFECT_LIMIT: RateLimitRule = { name: 'auth-side-effect', limit: 10, windowMs: 15 * MINUTE };

/**
 * Server-side fetch of a caller-supplied URL. Generous: saving a batch of
 * generated images calls this once per image.
 */
export const URL_FETCH_LIMIT: RateLimitRule = { name: 'url-fetch', limit: 120, windowMs: MINUTE };

/** Pack, repository and model installs from a URL — each is a large download. */
export const URL_INSTALL_LIMIT: RateLimitRule = { name: 'url-install', limit: 10, windowMs: MINUTE };
