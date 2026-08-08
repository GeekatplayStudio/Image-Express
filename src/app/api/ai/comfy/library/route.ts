import { NextRequest, NextResponse } from 'next/server';
import { OutboundUrlError, assertFetchableUrl } from '@/lib/server/outboundUrlPolicy';
import { enforceJsonBody } from '@/lib/server/apiContract';
import {
    buildComfyDiagnosticsSnapshot,
    buildComfyLibrarySnapshot,
    installComfyRequirements,
    installComfyRepository,
    updateComfyInstall,
    updateManagedRepository,
} from '@/lib/comfyui/libraryServer';
import type { ComfyConnectionMode } from '@/lib/comfyui/connection';
import type { ComfyDiagnosticsSnapshot, ComfyLibraryRepoKind } from '@/lib/comfyui/libraryTypes';
import type { ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';

interface ComfyLibraryRequestBody {
    action?: 'scan' | 'inspect-config' | 'install-repo' | 'update-repo' | 'update-install' | 'install-requirements';
    connectionMode?: ComfyConnectionMode;
    comfyServerUrl?: string;
    comfyTunnelUrl?: string;
    comfyCloudUrl?: string;
    comfyCloudApiKey?: string;
    installPath?: string;
    customNodesPath?: string;
    workflowLibraryPath?: string;
    repoUrl?: string;
    repoKind?: ComfyLibraryRepoKind;
    repoPath?: string;
    models?: ComfyWorkflowInstallableModel[];
    updateInstall?: boolean;
}

const buildConnection = (body: ComfyLibraryRequestBody) => ({
    mode: body.connectionMode || 'local',
    localUrl: body.comfyServerUrl,
    tunnelUrl: body.comfyTunnelUrl,
    cloudUrl: body.comfyCloudUrl,
    cloudApiKey: body.comfyCloudApiKey,
});

const buildPathInput = (body: ComfyLibraryRequestBody) => ({
    installPath: body.installPath,
    customNodesPath: body.customNodesPath,
    workflowLibraryPath: body.workflowLibraryPath,
});

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        // `.catch(() => ({}))` never throws, so nothing capped the body.
        const badBody = enforceJsonBody(request, 1024 * 1024);
        if (badBody) return badBody;
        const body = (await request.json().catch(() => ({}))) as ComfyLibraryRequestBody;
        const action = body.action || 'scan';

        if (action === 'install-repo') {
            if (!body.repoUrl || !body.repoKind) {
                return NextResponse.json(
                    { success: false, message: 'repoUrl and repoKind are required.' },
                    { status: 400 }
                );
            }

            try {
                // The server clones from this address; a scheme check alone
                // would let it be aimed at the metadata endpoint or the LAN.
                assertFetchableUrl(body.repoUrl);
            } catch (error) {
                if (error instanceof OutboundUrlError) {
                    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
                }
                throw error;
            }

            const installResult = await installComfyRepository({
                repoUrl: body.repoUrl,
                repoKind: body.repoKind,
                installPath: body.installPath,
                customNodesPath: body.customNodesPath,
                workflowLibraryPath: body.workflowLibraryPath,
            });

            const snapshot = await buildComfyLibrarySnapshot(buildConnection(body), buildPathInput(body));
            return NextResponse.json({
                success: true,
                message: `Installed ${body.repoKind === 'custom-nodes' ? 'custom node' : 'workflow'} repo at ${installResult.installedPath}. Restart ComfyUI to load any new nodes.`,
                snapshot,
            });
        }

        if (action === 'update-repo') {
            if (!body.repoPath) {
                return NextResponse.json(
                    { success: false, message: 'repoPath is required.' },
                    { status: 400 }
                );
            }

            await updateManagedRepository({
                repoPath: body.repoPath,
                installPath: body.installPath,
                customNodesPath: body.customNodesPath,
                workflowLibraryPath: body.workflowLibraryPath,
            });

            const snapshot = await buildComfyLibrarySnapshot(buildConnection(body), buildPathInput(body));
            return NextResponse.json({
                success: true,
                message: `Updated repository at ${body.repoPath}. Restart ComfyUI if this repo ships custom nodes.`,
                snapshot,
            });
        }

        if (action === 'update-install') {
            if (!body.installPath || !body.installPath.trim()) {
                return NextResponse.json(
                    { success: false, message: 'installPath is required.' },
                    { status: 400 }
                );
            }

            await updateComfyInstall(body.installPath);
            const snapshot = await buildComfyLibrarySnapshot(buildConnection(body), buildPathInput(body));
            return NextResponse.json({
                success: true,
                message: `Updated ComfyUI install at ${body.installPath}. Restart the server to use freshly pulled code and nodes.`,
                snapshot,
            });
        }

        if (action === 'install-requirements') {
            const result = await installComfyRequirements({
                installPath: body.installPath,
                models: Array.isArray(body.models) ? body.models : [],
                updateInstall: Boolean(body.updateInstall),
            });

            const snapshot = await buildComfyLibrarySnapshot(buildConnection(body), buildPathInput(body));
            const messageParts: string[] = [];
            if (result.updatedInstall) {
                messageParts.push('Updated the ComfyUI install');
            }
            if (result.installedModelPaths.length > 0) {
                messageParts.push(`downloaded ${result.installedModelPaths.length} model${result.installedModelPaths.length === 1 ? '' : 's'}`);
            }
            if (result.skippedModelPaths.length > 0) {
                messageParts.push(`skipped ${result.skippedModelPaths.length} model${result.skippedModelPaths.length === 1 ? '' : 's'} already present`);
            }

            return NextResponse.json({
                success: true,
                message: messageParts.length > 0
                    ? `${messageParts.join(' and ')}.`
                    : 'ComfyUI requirements are already installed.',
                snapshot,
            });
        }

        if (action === 'inspect-config') {
            const diagnostics: ComfyDiagnosticsSnapshot = await buildComfyDiagnosticsSnapshot(
                buildConnection(body),
                buildPathInput(body)
            );

            return NextResponse.json({
                success: true,
                diagnostics,
            });
        }

        const snapshot = await buildComfyLibrarySnapshot(buildConnection(body), buildPathInput(body));
        return NextResponse.json({
            success: true,
            snapshot,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to inspect the ComfyUI workflow library.',
        }, { status: 500 });
    }
}
