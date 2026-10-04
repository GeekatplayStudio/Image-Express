/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { WatchRoot } from '@/features/asset-vault/contracts/watchRoot';
import { runVaultScanJob } from '@/lib/server/jobQueue/handlers/vaultScan';
import type { QueueHandlerContext, QueueJobUpdate } from '@/lib/server/jobQueue/types';
import { invalidateCatalogCaches, readVaultAssetsByWatchRoot } from '@/lib/server/vault-store';
import { closeCatalogDb } from '@/lib/server/vaultCatalogDb';
import { runWatchRootScan, WatchRootScanError } from '@/lib/server/vaultScanRunner';
import { readWatchRootStore, scanDirectoryRecursive, upsertWatchRoot } from '@/lib/server/vaultWatchStore';

const ORIGINAL_DATA_DIR = process.env.IMAGE_EXPRESS_DATA_DIR;
let dataDir: string;
let folder: string;

const rootFor = (rootUri: string): WatchRoot => ({
    id: 'root1',
    label: 'Shots',
    rootUri,
    connector: 'local',
    enabled: true,
    recursive: true,
    includeGlobs: [],
    excludeGlobs: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
});

const storedRoot = async () => (await readWatchRootStore()).roots.find((root) => root.id === 'root1');
const names = async () => (await readVaultAssetsByWatchRoot('root1')).map((asset) => asset.name).sort();

const jobContext = (stop = () => false) => {
    const updates: QueueJobUpdate[] = [];
    const ctx = {
        job: { id: 'job1', kind: 'vault-scan', payload: { rootId: 'root1' } },
        update: async (update: QueueJobUpdate) => { updates.push(update); },
        stopRequested: stop,
    } as unknown as QueueHandlerContext;
    return { ctx, updates };
};

beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-scanrun-'));
    process.env.IMAGE_EXPRESS_DATA_DIR = dataDir;
    closeCatalogDb();
    invalidateCatalogCaches();
    folder = path.join(dataDir, 'shots');
    await fs.mkdir(path.join(folder, 'day1'), { recursive: true });
    await fs.mkdir(path.join(folder, 'day2'), { recursive: true });
    await fs.writeFile(path.join(folder, 'a.png'), 'x');
    await fs.writeFile(path.join(folder, 'day1', 'b.png'), 'x');
    await fs.writeFile(path.join(folder, 'day2', 'c.png'), 'x');
    await upsertWatchRoot(rootFor(folder));
});

afterEach(async () => {
    closeCatalogDb();
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.IMAGE_EXPRESS_DATA_DIR;
    else process.env.IMAGE_EXPRESS_DATA_DIR = ORIGINAL_DATA_DIR;
    await fs.rm(dataDir, { recursive: true, force: true });
});

describe('runWatchRootScan', () => {
    it('indexes the folder and records a finished scan on the root', async () => {
        const outcome = await runWatchRootScan('root1');
        expect(outcome).toMatchObject({ fileCount: 3, truncated: false, stopped: false, unreadableFolders: 0 });
        expect(outcome.stats.added).toBe(3);
        expect(await names()).toEqual(['a.png', 'b.png', 'c.png']);
        expect(await storedRoot()).toMatchObject({ lastScanStatus: 'ready', estimatedFileCount: 3 });
    });

    it('fails without touching the catalog when the folder has gone', async () => {
        await runWatchRootScan('root1');
        await fs.rm(folder, { recursive: true, force: true });

        await expect(runWatchRootScan('root1')).rejects.toMatchObject({ code: 'watch_root_scan_failed' });

        expect(await names()).toEqual(['a.png', 'b.png', 'c.png']);
        const root = await storedRoot();
        expect(root?.lastScanStatus).toBe('error');
        expect(root?.lastError).toContain('not reachable');
    });

    it('reports an unknown root as such', async () => {
        await expect(runWatchRootScan('nope')).rejects.toBeInstanceOf(WatchRootScanError);
        await expect(runWatchRootScan('nope')).rejects.toMatchObject({ code: 'watch_root_not_found', status: 404 });
    });
});

describe('scanDirectoryRecursive hooks', () => {
    it('reports progress as it enters folders', async () => {
        const seen: number[] = [];
        await scanDirectoryRecursive(folder, { onProgress: ({ directories }) => seen.push(directories) });
        expect(seen).toEqual([1, 2, 3]);
    });

    it('stops when asked, and says the walk was incomplete', async () => {
        let folders = 0;
        const scan = await scanDirectoryRecursive(folder, {
            onProgress: () => { folders += 1; },
            shouldStop: () => folders >= 1,
        });
        expect(scan.stopped).toBe(true);
        // Incomplete means "unseen", never "gone".
        expect(scan.truncated).toBe(true);
        expect(scan.files.length).toBeLessThan(3);
    });
});

describe('runVaultScanJob', () => {
    it('scans, and ends with a summary of what changed', async () => {
        const { ctx, updates } = jobContext();
        await runVaultScanJob(ctx);
        expect(await names()).toEqual(['a.png', 'b.png', 'c.png']);
        expect(updates.at(-1)).toMatchObject({ stage: 'store', progress: 1, message: '3 files: 3 new.' });
    });

    it('keeps what a stopped scan found and removes nothing', async () => {
        await runWatchRootScan('root1');
        const { ctx, updates } = jobContext(() => true);
        await runVaultScanJob(ctx);

        expect(await names()).toEqual(['a.png', 'b.png', 'c.png']);
        expect(updates.at(-1)?.message).toContain('Stopped');
        expect(updates.at(-1)?.message).toContain('Nothing was removed');
        // A stopped scan did not see the whole folder, so the count is not replaced by a partial one.
        expect((await storedRoot())?.estimatedFileCount).toBe(3);
    });

    it('refuses a job with no root', async () => {
        const { ctx } = jobContext();
        ctx.job.payload = {};
        await expect(runVaultScanJob(ctx)).rejects.toThrow('no watch root');
    });
});
