import type { ReactNode } from 'react';
import { Home as HomeIcon, ChevronRight } from 'lucide-react';

import BrandIcon from '@/components/BrandIcon';

type EditorHeaderPrimaryProps = {
    designName: string;
    isRenamingDesignTitle: boolean;
    designTitleDraft: string;
    onDesignTitleDraftChange: (value: string) => void;
    onCommitDesignTitle: () => void | Promise<void>;
    onCancelDesignTitleEdit: () => void;
    onStartDesignTitleEdit: () => void;
    onBack: () => void;
    showTopNavMenus: boolean;
    onToggleTopNavMenus: () => void;
    children?: ReactNode;
};

export default function EditorHeaderPrimary({
    designName,
    isRenamingDesignTitle,
    designTitleDraft,
    onDesignTitleDraftChange,
    onCommitDesignTitle,
    onCancelDesignTitleEdit,
    onStartDesignTitleEdit,
    onBack,
    showTopNavMenus,
    onToggleTopNavMenus,
    children,
}: EditorHeaderPrimaryProps) {
    return (
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
                <BrandIcon />
                {isRenamingDesignTitle ? (
                    <input
                        autoFocus
                        value={designTitleDraft}
                        onChange={(event) => onDesignTitleDraftChange(event.target.value)}
                        onBlur={() => { void onCommitDesignTitle(); }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void onCommitDesignTitle();
                            } else if (event.key === 'Escape') {
                                event.preventDefault();
                                onCancelDesignTitleEdit();
                            }
                        }}
                        className="hidden md:block h-8 min-w-[180px] max-w-[360px] rounded-md border border-primary/40 bg-background/90 px-3 text-sm font-semibold outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Untitled Design"
                    />
                ) : (
                    <button
                        onClick={onStartDesignTitleEdit}
                        className="hidden md:block font-bold text-lg ui-brand-gradient-text max-w-[360px] truncate text-left hover:opacity-90 transition-opacity"
                        title="Click to rename document"
                    >
                        {designName}
                    </button>
                )}
            </div>
            <nav className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    title="Back to Hub"
                >
                    <HomeIcon size={16} />
                    <span>Hub</span>
                </button>
                <button
                    onClick={onToggleTopNavMenus}
                    className="h-8 w-8 rounded-full border border-border/60 bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground transition-colors inline-flex items-center justify-center"
                    title={showTopNavMenus ? 'Collapse menus' : 'Expand menus'}
                    aria-label="Toggle top menu bar"
                >
                    <ChevronRight
                        size={14}
                        className={`transition-transform duration-200 ${showTopNavMenus ? 'rotate-180' : ''}`}
                    />
                </button>
            </nav>
            {children}
        </div>
    );
}
