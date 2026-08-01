'use client';

import { type ComponentProps, type ReactNode, type RefObject } from 'react';

import CircularContextMenu from '@/components/CircularContextMenu';
import VaultCircularMenu, { type VaultCircularAction } from '@/components/VaultCircularMenu';
import JobStatusFooter from '@/components/JobStatusFooter';
import Toolbar, { type ToolbarHandle } from '@/components/Toolbar';

type ToolbarProps = ComponentProps<typeof Toolbar>;
type ContextMenuProps = ComponentProps<typeof CircularContextMenu>;
type VaultMenuProps = ComponentProps<typeof VaultCircularMenu>;
type JobFooterProps = ComponentProps<typeof JobStatusFooter>;

interface EditorWorkspaceShellProps {
    toolbarRef: RefObject<ToolbarHandle | null>;
    toolbarProps: ToolbarProps;
    beforeWorkspace?: ReactNode;
    workspace: ReactNode;
    afterWorkspace?: ReactNode;
    jobFooterProps: JobFooterProps;
    contextMenuProps: ContextMenuProps;
    vaultCircularMenuProps?: VaultMenuProps;
}

export default function EditorWorkspaceShell({
    toolbarRef,
    toolbarProps,
    beforeWorkspace,
    workspace,
    afterWorkspace,
    jobFooterProps,
    contextMenuProps,
    vaultCircularMenuProps,
}: EditorWorkspaceShellProps) {
    return (
        <>
            <div className="relative flex flex-1 min-h-0 overflow-hidden">
                <aside
                    className="relative z-20 flex w-[60px] min-h-0 shrink-0 flex-col items-center overflow-visible border-r bg-card py-2 shadow-xl"
                    data-testid="toolbar-shell"
                >
                    <Toolbar
                        ref={toolbarRef}
                        {...toolbarProps}
                    />
                </aside>
                {beforeWorkspace}
                {workspace}
                {afterWorkspace}
                <JobStatusFooter {...jobFooterProps} />
            </div>
            <CircularContextMenu {...contextMenuProps} />
            {vaultCircularMenuProps?.isOpen && (
                <VaultCircularMenu {...vaultCircularMenuProps} />
            )}
        </>
    );
}
