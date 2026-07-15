import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

async function git(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: process.cwd(), timeout: 30_000 });
    return stdout.trim();
}

/**
 * GET /api/system/update
 * Reports whether a newer version exists on the git remote.
 * Response: { supported, branch, currentCommit, behind, updateAvailable, dirty }
 *
 * This endpoint never modifies anything. Applying an update is done from a
 * terminal via `npm run update` (see scripts/update.mjs) so the running
 * server is never yanked out from under the user mid-request.
 */
export async function GET() {
    try {
        await git(['rev-parse', '--is-inside-work-tree']);
    } catch {
        return NextResponse.json({
            supported: false,
            reason: 'Not a git checkout — updates must be installed manually.',
        });
    }

    try {
        const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
        const currentCommit = await git(['rev-parse', '--short', 'HEAD']);

        let fetchFailed = false;
        try {
            await git(['fetch', '--quiet']);
        } catch {
            fetchFailed = true;
        }

        let behind = 0;
        try {
            behind = Number.parseInt(await git(['rev-list', '--count', `HEAD..origin/${branch}`]), 10) || 0;
        } catch {
            // No upstream for this branch; treat as up to date.
        }

        const dirty = Boolean(await git(['status', '--porcelain']));

        return NextResponse.json({
            supported: true,
            branch,
            currentCommit,
            behind,
            updateAvailable: behind > 0,
            dirty,
            fetchFailed,
        });
    } catch (error) {
        console.error('Update check failed', error);
        return NextResponse.json(
            { supported: false, reason: 'Update check failed. See server logs.' },
            { status: 500 }
        );
    }
}
