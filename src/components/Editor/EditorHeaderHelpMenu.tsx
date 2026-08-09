import { useState } from 'react';
import TechnologyModal from '@/components/about/TechnologyModal';
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
    const [supportStatus, setSupportStatus] = useState('');
    // Owned here rather than threaded down from EditorView: the Help menu is
    // the only thing that opens it, and the modal positions itself.
    const [showTechnology, setShowTechnology] = useState(false);
    const desktop = typeof window !== 'undefined' ? window.desktop : undefined;
    const runDesktopSupportAction = async (
        action: (() => Promise<{ success: boolean; message?: string }>) | undefined,
        successMessage: string,
    ) => {
        setShowHelpMenu(false);
        if (!action) {
            setSupportStatus('This support action is available in the desktop application.');
            return;
        }
        const result = await action();
        setSupportStatus(result.success ? successMessage : (result.message || 'Support action failed.'));
    };

    return (
        <div className="relative order-10">
            <button
                onClick={toggleEditorMenu}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                aria-expanded={showHelpMenu}
                aria-haspopup="menu"
            >
                <span>{t('menu.help')}</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${showHelpMenu ? 'rotate-180' : ''}`} />
            </button>
            {showHelpMenu && (
                <div role="menu" data-testid="menu-help" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                    <button
                        role="menuitem"
                        onClick={() => {
                            setShowHelpMenu(false);
                            onOpenDocumentation?.();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Documentation
                    </button>
                    <button
                        role="menuitem"
                        onClick={() => {
                            setShowHelpMenu(false);
                            handleShowShortcutsFromMenu();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Keyboard Shortcuts
                    </button>
                    {desktop?.isDesktop && (
                        <>
                            <div className="my-1 border-t border-border/50" />
                            <button
                                role="menuitem"
                                onClick={() => void runDesktopSupportAction(
                                    desktop.openLogsFolder,
                                    'Logs folder opened.',
                                )}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                            >
                                Open Logs Folder
                            </button>
                            <button
                                role="menuitem"
                                onClick={() => void runDesktopSupportAction(
                                    desktop.openUserDataFolder,
                                    'User data folder opened.',
                                )}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                            >
                                Open User Data Folder
                            </button>
                            <button
                                role="menuitem"
                                onClick={() => void runDesktopSupportAction(
                                    desktop.copyDiagnostics,
                                    'Privacy-safe diagnostics copied.',
                                )}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                            >
                                Copy Diagnostics
                            </button>
                        </>
                    )}
                    <div className="my-1 border-t border-border/50" />
                    <button
                        role="menuitem"
                        onClick={() => {
                            setShowHelpMenu(false);
                            setShowTechnology(true);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Technology
                    </button>
                    <button
                        role="menuitem"
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
            <TechnologyModal isOpen={showTechnology} onClose={() => setShowTechnology(false)} />
            <span className="sr-only" role="status" aria-live="polite">{supportStatus}</span>
        </div>
    );
}
