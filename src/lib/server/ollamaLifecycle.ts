import { spawn } from 'node:child_process';
import { fetchOllamaWithFallback } from '@/lib/ollamaServer';
import { normalizeOllamaBaseUrl } from '@/lib/ollama';
import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';
import { getRuntimeProfile } from '@/lib/server/runtimeProfile';
import { resolveEmbedModel } from '@/lib/server/ollamaEmbeddings';

export type OllamaRuntimeStatus = {
    running: boolean;
    /** Models currently resident in memory, per /api/ps. */
    loadedModels: string[];
    /** What we did to get here. */
    action: 'none' | 'started-server' | 'loaded-model' | 'unavailable';
};

const PS_TIMEOUT_MS = 4_000;
const WARMUP_TIMEOUT_MS = 60_000;
const SERVER_START_WAIT_MS = 6_000;

// Only try to spawn `ollama serve` once per process — if it fails, repeating
// it on every search would just add latency.
let attemptedServerStart = false;

async function listLoadedModels(baseUrl: string): Promise<string[] | null> {
    const result = await fetchOllamaWithFallback(baseUrl, '/api/ps', {
        method: 'GET',
        timeoutMs: PS_TIMEOUT_MS,
    });
    if (!result.ok || !result.response) return null;
    try {
        const payload = await result.response.json() as { models?: Array<{ name?: string; model?: string }> };
        return (payload.models ?? [])
            .map((entry) => entry.name || entry.model || '')
            .filter(Boolean);
    } catch {
        return null;
    }
}

function modelMatches(loaded: string, wanted: string): boolean {
    // Ollama reports fully-qualified tags ("nomic-embed-text:latest").
    return loaded === wanted || loaded.startsWith(`${wanted}:`) || wanted.startsWith(`${loaded}:`);
}

/**
 * Try to start a local Ollama server. Only permitted on machines the app
 * itself runs on (desktop/dev profiles) — never on a shared self-hosted box.
 */
async function tryStartOllamaServer(): Promise<boolean> {
    const profile = getRuntimeProfile();
    if (profile === 'self-hosted' || attemptedServerStart) return false;
    attemptedServerStart = true;
    try {
        const child = spawn('ollama', ['serve'], {
            detached: true,
            stdio: 'ignore',
            shell: process.platform === 'win32',
        });
        child.on('error', () => { /* binary not installed — nothing to do */ });
        child.unref();
        await new Promise((resolve) => { setTimeout(resolve, SERVER_START_WAIT_MS); });
        return true;
    } catch {
        return false;
    }
}

/**
 * Make sure Ollama is up and the given embedding model is resident.
 *
 * - If the server is unreachable and we're on a local machine, attempt to
 *   start it (`ollama serve`) once and re-check.
 * - If another model is occupying memory, issuing a request for the wanted
 *   model makes Ollama swap it in; keep_alive keeps it resident afterwards.
 */
export async function ensureOllamaEmbedModelReady(options?: {
    baseUrl?: string;
    model?: string;
}): Promise<OllamaRuntimeStatus> {
    const baseUrl = normalizeOllamaBaseUrl(options?.baseUrl || DEFAULT_OLLAMA_BASE_URL);
    const model = resolveEmbedModel(options?.model);

    // Debounce readiness checks: while typing, every keystroke-batch searches.
    const cacheKey = `${baseUrl}::${model}`;
    const cached = readinessCache.get(cacheKey);
    if (cached && Date.now() - cached.at < READINESS_TTL_MS) return cached.status;
    const status = await ensureReadyUncached(baseUrl, model);
    if (status.running) readinessCache.set(cacheKey, { at: Date.now(), status });
    return status;
}

const READINESS_TTL_MS = 30_000;
const readinessCache = new Map<string, { at: number; status: OllamaRuntimeStatus }>();

async function ensureReadyUncached(baseUrl: string, model: string): Promise<OllamaRuntimeStatus> {

    let loaded = await listLoadedModels(baseUrl);
    let action: OllamaRuntimeStatus['action'] = 'none';

    if (loaded === null) {
        const started = await tryStartOllamaServer();
        if (started) {
            loaded = await listLoadedModels(baseUrl);
            if (loaded !== null) action = 'started-server';
        }
        if (loaded === null) {
            return { running: false, loadedModels: [], action: 'unavailable' };
        }
    }

    if (loaded.some((name) => modelMatches(name, model))) {
        return { running: true, loadedModels: loaded, action };
    }

    // Model not resident (cold, or another model holds the memory): a tiny
    // embed request forces Ollama to (re)load it, and keep_alive pins it.
    const warmup = await fetchOllamaWithFallback(baseUrl, '/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: 'warmup', keep_alive: '30m' }),
        timeoutMs: WARMUP_TIMEOUT_MS,
    });
    if (warmup.ok && warmup.response) {
        // Drain so the socket is released.
        await warmup.response.text().catch(() => undefined);
        return { running: true, loadedModels: [...loaded, model], action: 'loaded-model' };
    }
    return { running: true, loadedModels: loaded, action };
}
