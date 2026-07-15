import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';

type EditorHeaderHelpMenuProps = {
    showHelpMenu: boolean;
    toggleEditorMenu: () => void;
    setShowHelpMenu: (next: boolean | ((prev: boolean) => boolean)) => void;
    onOpenDocumentation?: () => void;
    handleShowShortcutsFromMenu: () => void;
    handleShowAboutFromMenu: () => Promise<void>;
};

export default function EditorHeaderHelpMenu({
    showHelpMenu,
    toggleEditorMenu,
    setShowHelpMenu,
    onOpenDocumentation,
    handleShowShortcutsFromMenu,
    handleShowAboutFromMenu,
}: EditorHeaderHelpMenuProps) {
    const { t } = useI18n();
    return (
        <div className="relative order-10">
            <button
                onClick={toggleEditorMenu}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                aria-expanded={showHelpMenu}
            >
                <span>{t('menu.help')}</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${showHelpMenu ? 'rotate-180' : ''}`} />
            </button>
            {showHelpMenu && (
                <div data-testid="menu-help" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                    <button
                        onClick={() => {
                            setShowHelpMenu(false);
                            onOpenDocumentation?.();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Documentation
                    </button>
                    <button
                        onClick={() => {
                            setShowHelpMenu(false);
                            handleShowShortcutsFromMenu();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Keyboard Shortcuts
                    </button>
                    <div className="my-1 border-t border-border/50" />
                    <button
                        onClick={() => {
                            setShowHelpMenu(false);
                            void handleShowAboutFromMenu();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        About Image Express
                    </button>
                </div>
            )}
        </div>
    );
}
