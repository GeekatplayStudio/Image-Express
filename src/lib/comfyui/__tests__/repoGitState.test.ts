/**
 * @jest-environment node
 */

import { execFile as execFileCallback, execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
    fetchRepoUpdates,
    formatRepoVersion,
    readRepoGitState,
    redactRemoteUrl,
    type GitRunner,
} from '@/lib/comfyui/repoGitState';
import { scanComfyNodeRepos } from '@/lib/comfyui/nodeRepoScan';

const execFile = promisify(execFileCallback);
const realGit: GitRunner = async (args) => (await execFile('git', args, { windowsHide: true })).stdout;

const gitAvailable = (() => {
    try {
        execFileSync('git', ['--version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();
// The installer needs git too, so a machine without it cannot use the feature;
// skip rather than fail, as the SQLite-backed suites do.
const withGit = gitAvailable ? describe : describe.skip;

describe('redactRemoteUrl', () => {
    it('strips a token cloned into the remote URL', () => {
        expect(redactRemoteUrl('https://user:ghp_secret@github.com/a/b.git')).toBe('https://github.com/a/b.git');
        expect(redactRemoteUrl('https://ghp_secret@github.com/a/b.git')).toBe('https://github.com/a/b.git');
    });

    it('keeps ordinary and scp-style remotes', () => {
        expect(redactRemoteUrl('https://github.com/a/b.git')).toBe('https://github.com/a/b.git');
        expect(redactRemoteUrl('git@github.com:a/b.git')).toBe('git@github.com:a/b.git');
        expect(redactRemoteUrl('  ')).toBeNull();
    });
});

describe('formatRepoVersion', () => {
    it('joins what is known and omits what is not', () => {
        expect(formatRepoVersion({ commit: 'a1b2c3d', branch: 'main', committedAt: '2026-09-30T10:00:00+00:00', remoteUrl: null, behindBy: 0 }))
            .toBe('a1b2c3d · main · 2026-09-30');
        // Detached checkout (a pinned commit): no branch to show.
        expect(formatRepoVersion({ commit: 'a1b2c3d', branch: null, committedAt: null, remoteUrl: null, behindBy: null }))
            .toBe('a1b2c3d');
    });
});

describe('readRepoGitState with a scripted git', () => {
    const scripted = (answers: Record<string, string | Error>): GitRunner => async (args) => {
        const key = Object.keys(answers).find((entry) => args.join(' ').includes(entry));
        const answer = key ? answers[key] : new Error('unexpected git call');
        if (answer instanceof Error) throw answer;
        return answer;
    };

    it('reads commit, branch, date, remote and how far behind', async () => {
        const state = await readRepoGitState('/repo', scripted({
            'log -1': 'a1b2c3d\t2026-09-30T10:00:00+00:00\n',
            'rev-parse --abbrev-ref': 'main\n',
            'config --get': 'https://token@github.com/a/b.git\n',
            'rev-list --count': '4\n',
        }));
        expect(state).toEqual({
            commit: 'a1b2c3d',
            branch: 'main',
            committedAt: '2026-09-30T10:00:00+00:00',
            remoteUrl: 'https://github.com/a/b.git',
            behindBy: 4,
        });
    });

    it('reports unknown, not zero, when there is no upstream to compare', async () => {
        const state = await readRepoGitState('/repo', scripted({
            'log -1': 'a1b2c3d\t2026-09-30T10:00:00+00:00\n',
            'rev-parse --abbrev-ref': 'HEAD\n',
            'config --get': new Error('no remote'),
            'rev-list --count': new Error('no upstream configured'),
        }));
        // "0 behind" would claim it is current; it has simply not been compared.
        expect(state?.behindBy).toBeNull();
        expect(state?.branch).toBeNull();
        expect(state?.remoteUrl).toBeNull();
    });

    it('returns null for a repository with nothing committed', async () => {
        await expect(readRepoGitState('/repo', scripted({ 'log -1': new Error('no commits yet') }))).resolves.toBeNull();
    });

    it('still reports the installed version when the fetch fails', async () => {
        const calls: string[] = [];
        const run: GitRunner = async (args) => {
            calls.push(args.slice(2).join(' '));
            if (args.includes('fetch')) throw new Error('could not resolve host');
            if (args.includes('log')) return 'a1b2c3d\t2026-09-30T10:00:00+00:00';
            if (args.includes('--abbrev-ref')) return 'main';
            if (args.includes('rev-list')) return '0';
            return 'https://github.com/a/b.git';
        };
        const state = await fetchRepoUpdates('/repo', run);
        expect(calls[0]).toContain('fetch');
        expect(state?.commit).toBe('a1b2c3d');
    });
});

withGit('against real repositories', () => {
    let root: string;
    const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
    const identity = ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false'];

    const commit = async (dir: string, file: string, message: string) => {
        await fs.writeFile(path.join(dir, file), message);
        git(dir, 'add', '.');
        git(dir, ...identity, 'commit', '-q', '-m', message);
    };

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-comfy-repos-'));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    /** An upstream with one commit, cloned into `custom_nodes/my-nodes`. */
    const setup = async () => {
        const upstream = path.join(root, 'upstream');
        await fs.mkdir(upstream);
        git(upstream, 'init', '-q', '-b', 'main');
        await commit(upstream, 'node.py', 'first');
        const customNodes = path.join(root, 'custom_nodes');
        await fs.mkdir(customNodes);
        git(customNodes, 'clone', '-q', upstream, 'my-nodes');
        return { upstream, customNodes, clone: path.join(customNodes, 'my-nodes') };
    };

    it('finds an update only after it has been checked for', async () => {
        const { upstream, clone } = await setup();
        expect((await readRepoGitState(clone, realGit))?.behindBy).toBe(0);

        await commit(upstream, 'node.py', 'second');
        await commit(upstream, 'extra.py', 'third');

        // A local read does not go online, so it cannot know yet.
        expect((await readRepoGitState(clone, realGit))?.behindBy).toBe(0);
        const checked = await fetchRepoUpdates(clone, realGit);
        expect(checked?.behindBy).toBe(2);
        expect(checked?.branch).toBe('main');
        expect(checked?.commit).toMatch(/^[0-9a-f]{7,}$/);
    }, 30_000);

    it('scans a workspace: versions for git repos, none for plain folders', async () => {
        const { customNodes } = await setup();
        await fs.mkdir(path.join(customNodes, 'plain-folder'));
        await fs.writeFile(path.join(customNodes, 'plain-folder', 'requirements.txt'), 'torch');
        await fs.writeFile(path.join(customNodes, 'loose-file.py'), '');

        const repos = await scanComfyNodeRepos(customNodes, [], {
            countWorkflowHints: async () => 0,
            runGit: realGit,
        });

        expect(repos.map((repo) => repo.name)).toEqual(['my-nodes', 'plain-folder']);
        expect(repos[0]).toMatchObject({ gitManaged: true, repoKind: 'custom-nodes' });
        expect(repos[0].git?.branch).toBe('main');
        expect(repos[1]).toMatchObject({ gitManaged: false, requirementsFile: true });
        expect(repos[1].git).toBeUndefined();
    }, 30_000);

    it('does not go online during an ordinary scan', async () => {
        const { customNodes } = await setup();
        const calls: string[] = [];
        const spy: GitRunner = async (args) => {
            calls.push(args[2]);
            return realGit(args);
        };

        await scanComfyNodeRepos(customNodes, [], { countWorkflowHints: async () => 0, runGit: spy });
        expect(calls).not.toContain('fetch');

        calls.length = 0;
        await scanComfyNodeRepos(customNodes, [], { countWorkflowHints: async () => 0, runGit: spy, checkUpdates: true });
        expect(calls).toContain('fetch');
    }, 30_000);

    it('skips a missing folder instead of failing the scan', async () => {
        await expect(scanComfyNodeRepos(path.join(root, 'nope'), [path.join(root, 'also-nope')], {
            countWorkflowHints: async () => 0,
            runGit: realGit,
        })).resolves.toEqual([]);
    });
});
