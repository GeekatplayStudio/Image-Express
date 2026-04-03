'use client';

import { useState, type ComponentProps, type ReactNode, type RefObject } from 'react';

import CircularContextMenu from '@/components/CircularContextMenu';
import JobStatusFooter from '@/components/JobStatusFooter';
import Toolbar, { type ToolbarHandle } from '@/components/Toolbar';
import { cn } from '@/lib/utils';

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
    const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);

    return (
        <>
            <div className="relative flex flex-1 min-h-0 overflow-hidden">
                <aside
                    className={cn(
                        'relative z-20 flex min-h-0 flex-col items-center overflow-y-auto overflow-x-hidden border-r bg-card py-2 shadow-xl transition-[width] duration-200 ease-out',
                        isToolbarExpanded ? 'w-[236px]' : 'w-[60px]'
                    )}
                    data-testid="toolbar-shell"
                >
                    <Toolbar
                        ref={toolbarRef}
                        {...toolbarProps}
                        onRailExpandedChange={(expanded) => {
                            toolbarProps.onRailExpandedChange?.(expanded);
                            setIsToolbarExpanded(expanded);
                        }}
                    />
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
