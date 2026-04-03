/** @jest-environment node */

import { GET } from '@/app/api/runtime/installer/status/route';

describe('GET /api/runtime/installer/status', () => {
    it('returns installer runtime payload with summary', async () => {
        const response = await GET();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(typeof data.configFile).toBe('string');
        expect(typeof data.comfyDirectory?.path).toBe('string');
        expect(typeof data.comfyDirectory?.exists).toBe('boolean');
        expect(typeof data.comfyDirectory?.gitRepo).toBe('boolean');
        expect(Array.isArray(data.customBundles)).toBe(true);
        expect(Array.isArray(data.comfyModels)).toBe(true);
        expect(typeof data.ollama?.cliAvailable).toBe('boolean');
        expect(Array.isArray(data.ollama?.configuredModels)).toBe(true);
        expect(typeof data.summary?.ready).toBe('boolean');
        expect(Array.isArray(data.summary?.missing)).toBe(true);
    });
});
