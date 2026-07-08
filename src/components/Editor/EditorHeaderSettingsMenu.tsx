import { ChevronDown } from 'lucide-react';

type EditorHeaderSettingsMenuProps = {
    showSettingsMenu: boolean;
    toggleEditorMenu: () => void;
    setShowSettingsMenu: (next: boolean | ((prev: boolean) => boolean)) => void;
    onOpenSettings: () => void;
    isAdminUser: boolean;
    onOpenAdminArea?: () => void;
};

export default function EditorHeaderSettingsMenu({
    showSettingsMenu,
    toggleEditorMenu,
    setShowSettingsMenu,
    onOpenSettings,
    isAdminUser,
    onOpenAdminArea,
}: EditorHeaderSettingsMenuProps) {
    return (
        <div className="relative order-9">
            <button
                onClick={toggleEditorMenu}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                aria-expanded={showSettingsMenu}
            >
                <span>Settings</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${showSettingsMenu ? 'rotate-180' : ''}`} />
            </button>
            {showSettingsMenu && (
                <div data-testid="menu-settings" className="absolute left-0 top-full mt-2 w-52 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                    <button
                        onClick={() => {
                            setShowSettingsMenu(false);
                            onOpenSettings();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                    >
                        Preferences...
                    </button>
                    {isAdminUser && (
                        <button
                            onClick={() => {
                                setShowSettingsMenu(false);
                                onOpenAdminArea?.();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Admin Area
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
