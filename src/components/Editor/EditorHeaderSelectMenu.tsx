import { ChevronDown } from 'lucide-react';

type EditorHeaderSelectMenuProps = {
    showSelectMenu: boolean;
    toggleEditorMenu: () => void;
    setShowSelectMenu: (next: boolean | ((prev: boolean) => boolean)) => void;
    handleSelectAllFromMenu: () => void;
    handleDeselectFromMenu: () => void;
    handleSelectionModify: (direction: 'expand' | 'contract') => void;
    triggerToolbarTool: (toolName: string) => void;
};

export default function EditorHeaderSelectMenu({
    showSelectMenu,
    toggleEditorMenu,
    setShowSelectMenu,
    handleSelectAllFromMenu,
    handleDeselectFromMenu,
    handleSelectionModify,
    triggerToolbarTool,
}: EditorHeaderSelectMenuProps) {
    return (
        <div className="relative order-5">
            <button
                onClick={toggleEditorMenu}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                aria-expanded={showSelectMenu}
            >
                <span>Select</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${showSelectMenu ? 'rotate-180' : ''}`} />
            </button>
            {showSelectMenu && (
                <div data-testid="menu-select" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            handleSelectAllFromMenu();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Select All
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            handleDeselectFromMenu();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Deselect
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            handleSelectionModify('expand');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Expand Selection
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            handleSelectionModify('contract');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Contract Selection
                    </button>
                    <div className="my-1 border-t border-border/50" />
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('select');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Move Tool
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('marquee');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Marquee Tool
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('lasso');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Lasso Tool
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('wand');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Magic Wand Tool
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('quick-select');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Quick Selection Tool
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('selection-brush');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Selection Brush Tool
                    </button>
                </div>
            )}
        </div>
    );
}
