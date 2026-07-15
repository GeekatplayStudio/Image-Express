'use client';

import type { WorkspacePreferences } from '../../hooks/useWorkspacePreferences';

interface LoginActivityPanelProps {
    workspace: Pick<WorkspacePreferences, 'isLogVisible' | 'logContent' | 'isLogLoading' | 'logError' | 'handleToggleLog'>;
}

/** Collapsible login activity log viewer. */
export default function LoginActivityPanel({ workspace }: LoginActivityPanelProps) {
    const { isLogVisible, logContent, isLogLoading, logError, handleToggleLog } = workspace;

    return (
        <div className="space-y-3 xl:col-span-2">
            <button
                onClick={() => void handleToggleLog()}
                className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
                {isLogVisible ? 'Hide Login Activity Log' : 'View Login Activity Log'}
            </button>

            {isLogVisible && (
                <div className="bg-secondary/20 border border-border/60 rounded-lg p-3 max-h-48 overflow-y-auto">
                    {isLogLoading ? (
                        <p className="text-xs text-muted-foreground">Loading log...</p>
                    ) : logError ? (
                        <p className="text-xs text-destructive">{logError}</p>
                    ) : (
                        <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{logContent}</pre>
                    )}
                </div>
            )}
        </div>
    );
}
