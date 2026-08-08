/**
 * @jest-environment node
 */

// No pause between batches in tests: the 4000-item budget test would
// otherwise sleep for 50 real seconds. Must be set before the import.
process.env.IMAGE_EXPRESS_THUMB_PAUSE_MS = '0';

import { runVaultThumbsJob } from '@/lib/server/jobQueue/handlers/vaultThumbs';
import type { QueueHandlerContext, QueueJobRecord } from '@/lib/server/jobQueue/types';

/**
 * What matters about the precache service is its *shape*, not the decoding:
 * a continuous run must chain the next pass with a cursor (so 200k assets are
 * not re-scanned from zero each time), a passive run must stay bounded, and a
 * stop must both end this pass and break the chain.
 */

const enqueue = jest.fn();
jest.mock('@/lib/server/jobQueue', () => ({ getQueue: () => ({ enqueue }) }));

let catalogAssets: Array<Record<string, unknown>> = [];
jest.mock('@/lib/server/vault-store', () => ({
    readVaultCatalog: async () => ({ assets: catalogAssets }),
}));

jest.mock('@/lib/server/vaultFilesystemPolicy', () => ({
    fileUriToPath: (uri: string) => uri.replace('file:///', ''),
}));

const generated: string[] = [];
let cachedPaths = new Set<string>();
jest.mock('@/lib/server/vaultThumbnails', () => ({
    isThumbnailerAvailable: () => true,
    hasCachedThumbnail: async (absolute: string) => cachedPaths.has(absolute),
    getVaultThumbnail: async (absolute: string) => {
        generated.push(absolute);
        return { body: Buffer.alloc(1), contentType: 'image/webp', cached: false };
    },
}));

const makeAssets = (count: number) => Array.from({ length: count }, (_, i) => ({
    id: `a${i}`,
    type: 'images',
    origin: { connector: 'local', uri: `file:///d:/pics/${i}.jpg` },
}));

const makeCtx = (payload: Record<string, unknown>, stopAfterUpdates = Infinity) => {
    let updates = 0;
    const job = {
        id: 'job_1',
        kind: 'vault-thumbs',
        lane: 'local-cpu',
        label: 'Preparing vault thumbnails',
        priority: -20,
        payload,
    } as unknown as QueueJobRecord;
    const ctx: QueueHandlerContext = {
        job,
        update: async () => { updates += 1; },
        stopRequested: () => updates >= stopAfterUpdates,
    };
    return ctx;
};

beforeEach(() => {
    jest.clearAllMocks();
    generated.length = 0;
    cachedPaths = new Set();
});

describe('runVaultThumbsJob', () => {
    it('a passive pass never chains a successor', async () => {
        // Opening the vault must not commit the machine to walking the whole
        // catalog; only the explicit "Index now" service does that.
        catalogAssets = makeAssets(10);
        await runVaultThumbsJob(makeCtx({}));
        expect(generated).toHaveLength(10);
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('a finished continuous run does not chain an empty successor', async () => {
        catalogAssets = makeAssets(5);
        await runVaultThumbsJob(makeCtx({ continuous: true }));
        expect(generated).toHaveLength(5);
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('starts from the cursor instead of re-scanning from zero', async () => {
        catalogAssets = makeAssets(6);
        await runVaultThumbsJob(makeCtx({ continuous: true, cursor: 4 }));
        expect(generated).toEqual(['d:/pics/4.jpg', 'd:/pics/5.jpg']);
    });

    it('restarts a cursor the catalog has shrunk past', async () => {
        // A stale cursor must not silently skip the whole catalog and report
        // the service finished.
        catalogAssets = makeAssets(3);
        await runVaultThumbsJob(makeCtx({ continuous: true, cursor: 50 }));
        expect(generated).toHaveLength(3);
    });

    it('skips work that is already cached', async () => {
        catalogAssets = makeAssets(4);
        cachedPaths = new Set(['d:/pics/0.jpg', 'd:/pics/2.jpg']);
        await runVaultThumbsJob(makeCtx({}));
        expect(generated).toEqual(['d:/pics/1.jpg', 'd:/pics/3.jpg']);
    });

    it('a stopped pass ends early and does not chain the next one', async () => {
        // Stop must break the chain: ending one pass while the successor is
        // already queued would make the Stop button look ignored.
        catalogAssets = makeAssets(50);
        await runVaultThumbsJob(makeCtx({ continuous: true }, 2));
        expect(generated.length).toBeLessThan(50);
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('a continuous pass that hits its budget chains the next pass at its cursor', async () => {
        // 4000 is the per-pass budget; the successor must resume where this
        // pass stopped, not at zero.
        catalogAssets = makeAssets(4005);
        await runVaultThumbsJob(makeCtx({ continuous: true }));
        expect(enqueue).toHaveBeenCalledTimes(1);
        const chained = enqueue.mock.calls[0][0];
        expect(chained.kind).toBe('vault-thumbs');
        expect(chained.payload.continuous).toBe(true);
        expect(chained.payload.cursor).toBe(4000);
        expect(chained.priority).toBe(-20);
    }, 30_000);
});
