/**
 * Which version of a ComfyUI node or workflow repository is installed, and
 * whether a newer one is available.
 *
 * The manager used to say only "this folder is a git repo". Updating was a
 * blind `git pull`: nothing showed what was installed, or whether pulling
 * would change anything. This reads the installed commit and, after an
 * explicit check, how far it is behind its upstream.
 *
 * Reading state never touches the network — `behindBy` reflects the last fetch
 * — so scanning a folder of repositories stays fast and works offline.
 * `fetchRepoUpdates` is the one function that goes online.
 */

export interface ComfyRepoGitState {
    /** Abbreviated commit id of what is checked out. */
    commit: string;
    /** Branch name, or null on a detached checkout (a pinned commit). */
    branch: string | null;
    /** ISO date of the installed commit. */
    committedAt: string | null;
    /** Where it was cloned from, with any embedded credentials removed. */
    remoteUrl: string | null;
    /**
     * Commits the upstream has that this checkout does not, as of the last
     * fetch. Null when there is no upstream to compare against.
     */
    behindBy: number | null;
}

/** Runs `git <args>` and resolves with stdout. Injected so this is testable without git. */
export type GitRunner = (args: string[]) => Promise<string>;

const firstLine = (value: string) => value.split(/\r?\n/)[0]?.trim() ?? '';

/** Never show a token that was cloned into the remote URL. */
export function redactRemoteUrl(remote: string): string | null {
    const value = remote.trim();
    if (!value) return null;
    try {
        const url = new URL(value);
        url.username = '';
        url.password = '';
        return url.toString();
    } catch {
        // scp-style `git@host:owner/repo.git` — no secret, keep as is.
        return value;
    }
}

const tryGit = async (run: GitRunner, args: string[]): Promise<string | null> => {
    try {
        return await run(args);
    } catch {
        return null;
    }
};

/** Installed version of one repository. Null when it has no commits to read. */
export async function readRepoGitState(repoPath: string, run: GitRunner): Promise<ComfyRepoGitState | null> {
    const head = await tryGit(run, ['-C', repoPath, 'log', '-1', '--format=%h%x09%cI']);
    if (head === null) return null;
    const [commit, committedAt] = firstLine(head).split('\t');
    if (!commit) return null;

    const [branchOut, remoteOut, behindOut] = await Promise.all([
        tryGit(run, ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD']),
        tryGit(run, ['-C', repoPath, 'config', '--get', 'remote.origin.url']),
        // Fails when there is no upstream (detached or local-only): unknown.
        tryGit(run, ['-C', repoPath, 'rev-list', '--count', 'HEAD..@{upstream}']),
    ]);

    const branch = branchOut === null ? null : firstLine(branchOut);
    const behind = behindOut === null ? NaN : Number.parseInt(firstLine(behindOut), 10);

    return {
        commit,
        // git prints the literal "HEAD" for a detached checkout.
        branch: branch && branch !== 'HEAD' ? branch : null,
        committedAt: committedAt || null,
        remoteUrl: remoteOut === null ? null : redactRemoteUrl(firstLine(remoteOut)),
        behindBy: Number.isFinite(behind) && behind >= 0 ? behind : null,
    };
}

/**
 * Ask the remote what is new, then report the state. A fetch that fails —
 * offline, remote gone — leaves the last known state in place rather than
 * turning a version check into an error.
 */
export async function fetchRepoUpdates(repoPath: string, run: GitRunner): Promise<ComfyRepoGitState | null> {
    await tryGit(run, ['-C', repoPath, 'fetch', '--quiet', '--no-tags']);
    return readRepoGitState(repoPath, run);
}

/** `a1b2c3d · main · 2026-09-30` — what is installed, for one line of UI. */
export function formatRepoVersion(state: ComfyRepoGitState): string {
    const date = state.committedAt ? state.committedAt.slice(0, 10) : null;
    return [state.commit, state.branch, date].filter(Boolean).join(' · ');
}
