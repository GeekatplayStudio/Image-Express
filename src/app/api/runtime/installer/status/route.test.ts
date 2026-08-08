/** @jest-environment node */

import { GET } from '@/app/api/runtime/installer/status/route';

describe('GET /api/runtime/installer/status', () => {
    // The handler probes the ollama CLI, so it launches a real process. That is
    // slow enough under parallel workers on Windows to blow jest's generic 5s
    // default intermittently, while passing every time with --runInBand.
    const RUNTIME_PROBE_TIMEOUT_MS = 20_000;

    it('returns installer runtime payload with summary', async () => {
        const response = await GET(new Request('http://localhost:3000/api/runtime/installer/status'));
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(typeof data.configFile).toBe('string');
        expect(typeof data.comfyDirectory?.path).toBe('string');
        expect(typeof data.comfyDirectory?.exists).toBe('boolean');
        expect(typeof data.comfyDirectory?.gitRepo).toBe('boolean');
        expect(typeof data.paths?.customNodesPath).toBe('string');
        expect(typeof data.paths?.modelsPath).toBe('string');
        expect(Array.isArray(data.paths?.workflowLibraryPaths)).toBe(true);
        expect(Array.isArray(data.paths?.statuses)).toBe(true);
        expect(Array.isArray(data.customBundles)).toBe(true);
        expect(Array.isArray(data.comfyModels)).toBe(true);
        expect(typeof data.localWorkspace?.path).toBe('string');
        expect(typeof data.localWorkspace?.exists).toBe('boolean');
        expect(typeof data.ollama?.cliAvailable).toBe('boolean');
        expect(Array.isArray(data.ollama?.configuredModels)).toBe(true);
        expect(typeof data.summary?.ready).toBe('boolean');
        expect(Array.isArray(data.summary?.missing)).toBe(true);
    }, RUNTIME_PROBE_TIMEOUT_MS);
});
