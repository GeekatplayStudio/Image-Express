import { NextResponse } from 'next/server';
import { blockCrossSiteRequest } from '@/lib/server/trustedCaller';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { authorizeLocalRuntimeCapability } from '@/lib/server/runtimeProfile';
import { getProjectRoot } from '@/lib/server/appPaths';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

async function git(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: getProjectRoot(), timeout: 30_000 });
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
export async function GET(request: Request) {
    const unauthorized = authorizeLocalRuntimeCapability(request, 'app:update');
    if (unauthorized) return unauthorized;
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

/**
 * POST /api/system/update
 * Applies the update in place: runs scripts/update.mjs (git pull --ff-only +
 * dependency install when the lockfile changed). Refuses on a dirty tree —
 * same safety rules as running `npm run update` manually. The caller should
 * prompt the user to restart the app afterwards.
 */
export async function POST(request: Request) {
    // The loopback check below does not stop this: a malicious page runs in
    // the user's own browser, which is on loopback too.
    const crossSite = blockCrossSiteRequest(request);
    if (crossSite) return crossSite;
    const unauthorized = authorizeLocalRuntimeCapability(request, 'app:update');
    if (unauthorized) return unauthorized;
    try {
        await git(['rev-parse', '--is-inside-work-tree']);
    } catch {
        return NextResponse.json(
            { success: false, error: 'Not a git checkout — update manually from GitHub.' },
            { status: 400 }
        );
    }

    try {
        const dirty = Boolean(await git(['status', '--porcelain']));
        if (dirty) {
            return NextResponse.json(
                { success: false, error: 'Local changes detected — update skipped so nothing is overwritten.' },
                { status: 409 }
            );
        }

        const scriptPath = './scripts/update.mjs';
        const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
            cwd: getProjectRoot(),
            timeout: 10 * 60_000,
        });
        const commit = await git(['rev-parse', '--short', 'HEAD']);
        return NextResponse.json({
            success: true,
            commit,
            log: `${stdout}\n${stderr}`.trim().slice(-4000),
            restartRequired: true,
        });
    } catch (error) {
        console.error('Update apply failed', error);
        const detail = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ success: false, error: `Update failed: ${detail}` }, { status: 500 });
    }
}
