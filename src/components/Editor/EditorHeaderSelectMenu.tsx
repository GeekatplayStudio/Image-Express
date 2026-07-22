import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';

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
    const { t } = useI18n();
    return (
        <div className="relative order-5">
            <button
                onClick={toggleEditorMenu}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                aria-expanded={showSelectMenu}
            >
                <span>{t('menu.select')}</span>
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
                        {t('selMenu.selectAll')}
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            handleDeselectFromMenu();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        {t('selMenu.deselect')}
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            handleSelectionModify('expand');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        {t('selMenu.expandSelection')}
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            handleSelectionModify('contract');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        {t('selMenu.contractSelection')}
                    </button>
                    <div className="my-1 border-t border-border/50" />
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('select');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        {t('selMenu.moveTool')}
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('marquee');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        {t('selMenu.marqueeTool')}
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('lasso');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        {t('selMenu.lassoTool')}
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('wand');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        {t('selMenu.magicWandTool')}
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('quick-select');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        {t('selMenu.quickSelectionTool')}
                    </button>
                    <button
                        onClick={() => {
                            setShowSelectMenu(false);
                            triggerToolbarTool('selection-brush');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        {t('selMenu.selectionBrushTool')}
                    </button>
                </div>
            )}
        </div>
    );
}
