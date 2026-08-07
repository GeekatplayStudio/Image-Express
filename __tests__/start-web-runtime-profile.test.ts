/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `scripts/start-web.mjs` is a launcher, not an importable module — importing it
 * would start a server. These tests assert the contract it must uphold by
 * reading its source, which is enough to catch the regression that mattered:
 *
 * `next start` sets NODE_ENV=production, so without an explicit
 * IMAGE_EXPRESS_RUNTIME the app resolved to `self-hosted`. That profile
 * authorises no vault folders, so every /api/assets/vault/file request answered
 * 403 for anyone running `npm run start` on their own machine — the vault
 * indexed fine but rendered nothing.
 *
 * The paired runtime-side assertions live in
 * `src/lib/server/__tests__/runtimeProfile.test.ts`.
 */
const source = readFileSync(
    path.join(process.cwd(), 'scripts', 'start-web.mjs'),
    'utf8',
);

describe('start-web launcher runtime profile', () => {
    it('declares a local runtime profile for the server it spawns', () => {
        expect(source).toMatch(/IMAGE_EXPRESS_RUNTIME[^\n]*developer-local/);
    });

    it('passes the explicit env through to the spawned child', () => {
        // Without `env:` on the spawn options the declaration would be inert —
        // the child would inherit the parent env unchanged.
        expect(source).toMatch(/env:\s*childEnv/);
    });

    it('lets an operator-set profile win over the default', () => {
        expect(source).toMatch(
            /process\.env\.IMAGE_EXPRESS_RUNTIME\?\.trim\(\)\s*\|\|\s*'developer-local'/,
        );
    });

    it('keeps the local server on loopback, which is what makes a local profile safe', () => {
        const bindFlags = source.match(/'-H',\s*'127\.0\.0\.1'/g) ?? [];
        // One for `next start`, one for `next dev`.
        expect(bindFlags.length).toBeGreaterThanOrEqual(2);
        expect(source).not.toMatch(/'-H',\s*'0\.0\.0\.0'/);
    });
});
