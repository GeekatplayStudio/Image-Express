/** @jest-environment node */

import { GET } from '@/app/api/runtime/comfy/route';

describe('GET /api/runtime/comfy', () => {
    const originalCloudUrl = process.env.COMFY_CLOUD_URL;
    const originalCloudApiKey = process.env.COMFY_CLOUD_API_KEY;

    afterEach(() => {
        process.env.COMFY_CLOUD_URL = originalCloudUrl;
        process.env.COMFY_CLOUD_API_KEY = originalCloudApiKey;
    });

    it('returns runtime Comfy defaults from the environment', async () => {
        process.env.COMFY_CLOUD_URL = 'https://cloud.comfy.org';
        process.env.COMFY_CLOUD_API_KEY = 'server-key';

        const response = await GET();
        const data = await response.json();

        expect(data).toEqual({
            cloudUrl: 'https://cloud.comfy.org',
            cloudApiKey: 'server-key',
        });
    });
});