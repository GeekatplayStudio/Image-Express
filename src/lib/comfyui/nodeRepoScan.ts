import path from 'node:path';
import { access, readdir } from 'node:fs/promises';
import type { ComfyLibraryNodeRepo, ComfyLibraryRepoKind } from '@/lib/comfyui/libraryTypes';
import { fetchRepoUpdates, readRepoGitState, type GitRunner } from '@/lib/comfyui/repoGitState';

/**
 * Lists the node and workflow repositories installed in a ComfyUI workspace,
 * with the version each one is on. Split from libraryServer, which is over the
 * size limit; its collaborators are passed in so this can be tested against a
 * temp directory without git or a ComfyUI install.
 */
export interface ScanNodeReposOptions {
    /** Also ask each repository's remote what is new. Off for an ordinary scan. */
    checkUpdates?: boolean;
    countWorkflowHints: (repoPath: string) => Promise<number>;
    runGit: GitRunner;
}

const fileExists = async (targetPath: string): Promise<boolean> => {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
};

export const scanComfyNodeRepos = async (
    customNodesPath: string,
    workflowLibraryPaths: string[],
    options: ScanNodeReposOptions,
): Promise<ComfyLibraryNodeRepo[]> => {
    const results: ComfyLibraryNodeRepo[] = [];
    const scanTargets: Array<{ basePath: string; repoKind: ComfyLibraryRepoKind }> = [
        { basePath: customNodesPath, repoKind: 'custom-nodes' },
        ...workflowLibraryPaths.map((workflowLibraryPath) => ({
            basePath: workflowLibraryPath,
            repoKind: 'workflow-library' as const,
        })),
    ];
    const seenRepoPaths = new Set<string>();

    for (const target of scanTargets) {
        if (!target.basePath || !(await fileExists(target.basePath))) {
            continue;
        }

        const entries = await readdir(target.basePath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            const repoPath = path.join(target.basePath, entry.name);
            if (seenRepoPaths.has(repoPath)) {
                continue;
            }
            seenRepoPaths.add(repoPath);
            const gitManaged = await fileExists(path.join(repoPath, '.git'));
            const requirementsFile = await fileExists(path.join(repoPath, 'requirements.txt'));
            const workflowHintCount = await options.countWorkflowHints(repoPath);
            // Reading the version is local and cheap; asking the remote is
            // opt-in, so an ordinary scan works offline and stays fast.
            const git = gitManaged
                ? await (options.checkUpdates ? fetchRepoUpdates : readRepoGitState)(repoPath, options.runGit)
                : null;

            results.push({
                name: entry.name,
                path: repoPath,
                repoKind: target.repoKind,
                gitManaged,
                workflowHintCount,
                requirementsFile,
                ...(git ? { git } : {}),
            });
        }
    }

    return results.sort((left, right) => left.name.localeCompare(right.name));
};
