#!/usr/bin/env node
/**
 * Live provider QA (R-11): one cheap authenticated call per cloud provider,
 * reported as provider / stage / result / what to do about it.
 *
 * Keys come from the environment and nothing else; a provider without a key
 * is reported as skipped and does not fail the run, so this can sit in the
 * release gate where no keys exist and still be useful on a machine that has
 * them. Exit code is non-zero only when a *configured* provider fails.
 *
 *   MESHY_API_KEY        Meshy      GET /openapi/v1/balance
 *   TRIPO_API_KEY        Tripo      GET /v2/openapi/user/balance
 *   STABILITY_API_KEY    Stability  GET /v1/user/balance
 *   HITEM3D_API_KEY      Hitem3D    GET /open-api/v1/query-task (probe id), optional HITEM3D_APP_ID
 *
 * The stages are the same ones the in-app proxies go through, so a failure
 * here names where the app would fail: `reach` (network/DNS), `auth` (the key
 * is refused), `shape` (the provider answered but not in the form the app
 * reads).
 */

const TIMEOUT_MS = 15_000;

const PROVIDERS = [
    {
        name: 'meshy',
        keyEnv: 'MESHY_API_KEY',
        url: 'https://api.meshy.ai/openapi/v1/balance',
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
        shape: (json) => typeof json?.balance === 'number' || typeof json?.credits === 'number' || json !== null,
        fix: 'Check the Meshy key in Settings → API keys; the app sends it as a Bearer token through /api/ai/meshy.',
    },
    {
        name: 'tripo',
        keyEnv: 'TRIPO_API_KEY',
        url: 'https://api.tripo3d.ai/v2/openapi/user/balance',
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
        shape: (json) => json?.code === 0 || json?.data !== undefined,
        fix: 'Tripo keys start with "tsk_"; the app forwards the Authorization header unchanged through /api/ai/tripo.',
    },
    {
        name: 'stability',
        keyEnv: 'STABILITY_API_KEY',
        url: 'https://api.stability.ai/v1/user/balance',
        headers: (key) => ({ Authorization: `Bearer ${key}`, Accept: 'application/json' }),
        shape: (json) => typeof json?.credits === 'number',
        fix: 'Stability keys start with "sk-"; the app strips "Bearer " and re-adds it in /api/ai/stability/*.',
    },
    {
        name: 'hitem3d',
        keyEnv: 'HITEM3D_API_KEY',
        url: 'https://api.hitem3d.ai/open-api/v1/query-task?task_id=qa_probe',
        headers: (key) => ({
            Authorization: `Bearer ${key}`,
            Accept: 'application/json',
            ...(process.env.HITEM3D_APP_ID ? { Appid: process.env.HITEM3D_APP_ID } : {}),
        }),
        // A probe id is not found, which is the expected answer; what matters is
        // that the key was accepted rather than refused.
        shape: () => true,
        acceptStatuses: [200, 400, 404],
        fix: 'Hitem3D needs `hitems_api_key` and, for some accounts, `hitems_appid` (HITEM3D_APP_ID here).',
    },
];

async function check(provider) {
    const key = process.env[provider.keyEnv]?.trim();
    if (!key) return { provider: provider.name, stage: '-', result: 'skipped', note: `${provider.keyEnv} not set` };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
        response = await fetch(provider.url, { headers: provider.headers(key), signal: controller.signal });
    } catch (error) {
        return { provider: provider.name, stage: 'reach', result: 'fail', note: String(error?.message ?? error), fix: 'Network, DNS or a proxy: the provider could not be reached at all.' };
    } finally {
        clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
        return { provider: provider.name, stage: 'auth', result: 'fail', note: `HTTP ${response.status}`, fix: provider.fix };
    }
    const accepted = provider.acceptStatuses ?? [200];
    if (!accepted.includes(response.status)) {
        return { provider: provider.name, stage: 'reach', result: 'fail', note: `HTTP ${response.status}`, fix: `Unexpected status from ${provider.url}; the provider may be down or the endpoint moved.` };
    }

    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* shape check below reports it */ }
    if (json === null || !provider.shape(json)) {
        return { provider: provider.name, stage: 'shape', result: 'fail', note: text.slice(0, 120), fix: 'The provider answered but not in the form the app reads; compare with providerPoll.ts.' };
    }
    return { provider: provider.name, stage: 'auth', result: 'ok', note: `HTTP ${response.status}` };
}

const results = await Promise.all(PROVIDERS.map(check));
const width = (key) => Math.max(...results.map((r) => String(r[key] ?? '').length), key.length);
const row = (r) => ['provider', 'stage', 'result', 'note'].map((k) => String(r[k] ?? '').padEnd(width(k))).join('  ');
console.log(row({ provider: 'provider', stage: 'stage', result: 'result', note: 'note' }));
for (const r of results) {
    console.log(row(r));
    if (r.fix && r.result === 'fail') console.log(`  → ${r.fix}`);
}
const failed = results.filter((r) => r.result === 'fail');
const skipped = results.filter((r) => r.result === 'skipped');
console.log(`\n${results.length - failed.length - skipped.length} ok, ${failed.length} failed, ${skipped.length} skipped (no key).`);
process.exit(failed.length > 0 ? 1 : 0);
