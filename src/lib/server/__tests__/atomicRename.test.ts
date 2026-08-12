/** @jest-environment node */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { renameWithRetry } from '@/lib/server/atomicRename';

const errnoError = (code: string) => Object.assign(new Error(code), { code });

describe('renameWithRetry', () => {
    let dir: string;
    let temp: string;
    let target: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-rename-'));
        temp = path.join(dir, 'jobs.json.tmp');
        target = path.join(dir, 'jobs.json');
        await fs.writeFile(temp, '{"fresh":true}', 'utf-8');
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('renames in the ordinary case', async () => {
        await renameWithRetry(temp, target);
        expect(await fs.readFile(target, 'utf-8')).toBe('{"fresh":true}');
    });

    it('survives a scanner briefly holding the target open', async () => {
        const rename = jest.spyOn(fs, 'rename')
            .mockRejectedValueOnce(errnoError('EPERM'))
            .mockRejectedValueOnce(errnoError('EBUSY'))
            .mockResolvedValueOnce(undefined);

        await expect(renameWithRetry(temp, target)).resolves.toBeUndefined();
        expect(rename).toHaveBeenCalledTimes(3);
    });

    it('rethrows a non-transient error without retrying', async () => {
        const rename = jest.spyOn(fs, 'rename').mockRejectedValue(errnoError('ENOENT'));

        await expect(renameWithRetry(temp, target)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(rename).toHaveBeenCalledTimes(1);
    });

    it('gives up after the backoff and leaves no temp file behind', async () => {
        jest.spyOn(fs, 'rename').mockRejectedValue(errnoError('EPERM'));

        await expect(renameWithRetry(temp, target)).rejects.toMatchObject({ code: 'EPERM' });
        await expect(fs.stat(temp)).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
