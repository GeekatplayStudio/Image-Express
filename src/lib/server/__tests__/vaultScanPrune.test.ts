import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { selectPrunableAssetIds } from '@/lib/server/vaultScanPrune';
import { scanDirectoryRecursive, WatchRootUnavailableError } from '@/lib/server/vaultWatchStore';

const asset = (id: string, filePath: string) => ({
    id,
    origin: { connector: 'local', uri: `file://${filePath}`, watchRootId: 'root' },
}) as unknown as VaultAssetRecord;

describe('selectPrunableAssetIds', () => {
    const prior = [
        asset('kept', 'D:/Photos/a.png'),
        asset('gone', 'D:/Photos/b.png'),
        asset('locked', 'D:/Photos/Private/c.png'),
    ];

    it('drops what a complete scan no longer finds', () => {
        expect(selectPrunableAssetIds(prior, new Set(['kept']), { truncated: false, unreadableDirs: [] }))
            .toEqual(['gone', 'locked']);
    });

    it('drops nothing when the scan stopped at the file ceiling', () => {
        expect(selectPrunableAssetIds(prior, new Set(['kept']), { truncated: true, unreadableDirs: [] }))
            .toEqual([]);
    });

    it('keeps assets under a folder that could not be read', () => {
        expect(selectPrunableAssetIds(prior, new Set(['kept']), {
            truncated: false,
            unreadableDirs: ['D:\\Photos\\Private'],
        })).toEqual(['gone']);
    });

    it('does not confuse a sibling folder that shares a prefix', () => {
        const siblings = [asset('a', 'D:/Photos/Private2/x.png')];
        expect(selectPrunableAssetIds(siblings, new Set(), { truncated: false, unreadableDirs: ['D:/Photos/Private'] }))
            .toEqual(['a']);
    });
});

describe('scanDirectoryRecursive', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), 'ie-scan-'));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('fails for a root that cannot be reached instead of reporting it empty', async () => {
        await expect(scanDirectoryRecursive(path.join(dir, 'unplugged')))
            .rejects.toBeInstanceOf(WatchRootUnavailableError);
    });

    it('reports a complete scan of a readable root', async () => {
        await mkdir(path.join(dir, 'sub'));
        await writeFile(path.join(dir, 'a.png'), 'x');
        await writeFile(path.join(dir, 'sub', 'b.png'), 'x');
        const scan = await scanDirectoryRecursive(dir);
        expect(scan.files.map((file) => file.relativePath).sort()).toEqual(['a.png', 'sub/b.png']);
        expect(scan.truncated).toBe(false);
        expect(scan.unreadableDirs).toEqual([]);
    });

    it('marks a scan cut off by the file ceiling as truncated', async () => {
        await writeFile(path.join(dir, 'a.png'), 'x');
        await writeFile(path.join(dir, 'b.png'), 'x');
        const scan = await scanDirectoryRecursive(dir, { maxFiles: 1 });
        expect(scan.files).toHaveLength(1);
        expect(scan.truncated).toBe(true);
    });
});
