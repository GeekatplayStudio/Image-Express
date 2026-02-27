'use client';

import type { ComponentProps, ReactNode, RefObject } from 'react';

import CircularContextMenu from '@/components/CircularContextMenu';
import JobStatusFooter from '@/components/JobStatusFooter';
import Toolbar, { type ToolbarHandle } from '@/components/Toolbar';

type ToolbarProps = ComponentProps<typeof Toolbar>;
type ContextMenuProps = ComponentProps<typeof CircularContextMenu>;
type JobFooterProps = ComponentProps<typeof JobStatusFooter>;

interface EditorWorkspaceShellProps {
    toolbarRef: RefObject<ToolbarHandle | null>;
    toolbarProps: ToolbarProps;
    beforeWorkspace?: ReactNode;
    workspace: ReactNode;
    afterWorkspace?: ReactNode;
    jobFooterProps: JobFooterProps;
    contextMenuProps: ContextMenuProps;
}

export default function EditorWorkspaceShell({
    toolbarRef,
    toolbarProps,
    beforeWorkspace,
    workspace,
    afterWorkspace,
    jobFooterProps,
    contextMenuProps,
}: EditorWorkspaceShellProps) {
    return (
        <>
            <div className="flex flex-1 overflow-hidden relative">
                <aside className="w-[60px] bg-card border-r flex flex-col items-center py-2 z-20 shadow-xl relative overflow-visible">
                    <Toolbar ref={toolbarRef} {...toolbarProps} />
                </aside>
                {beforeWorkspace}
                {workspace}
                {afterWorkspace}
                <JobStatusFooter {...jobFooterProps} />
            </div>
            <CircularContextMenu {...contextMenuProps} />
        </>
    );
}
