import { ChevronDown } from 'lucide-react';

import { WINDOW_PANEL_ITEMS } from '@/components/Editor/editorViewConfig';
import type { PanelDockMode } from '@/components/Editor/editorView.types';
import type { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';

type PanelState = {
    mode: PanelDockMode;
    position: { x: number; y: number };
    width: number;
};

type EditorHeaderWindowMenuProps = {
    showWindowMenu: boolean;
    toggleEditorMenu: () => void;
    setShowWindowMenu: (next: boolean | ((prev: boolean) => boolean)) => void;
    isPropertiesPanelVisible: boolean;
    propertiesPanelMode: PanelRailMode;
    handleWindowPanelToggle: (mode: PanelRailMode) => void;
    setPanelState: (value: PanelState | ((prev: PanelState) => PanelState)) => void;
    panelState: PanelState;
    handleWindowDockMode: (mode: 'docked-left' | 'docked-right' | 'floating') => void;
};

export default function EditorHeaderWindowMenu({
    showWindowMenu,
    toggleEditorMenu,
    setShowWindowMenu,
    isPropertiesPanelVisible,
    propertiesPanelMode,
    handleWindowPanelToggle,
    setPanelState,
    panelState,
    handleWindowDockMode,
}: EditorHeaderWindowMenuProps) {
    return (
        <div className="relative order-8">
            <button
                onClick={toggleEditorMenu}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                aria-expanded={showWindowMenu}
            >
                <span>Window</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${showWindowMenu ? 'rotate-180' : ''}`} />
            </button>
            {showWindowMenu && (
                <div data-testid="menu-window" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                    {WINDOW_PANEL_ITEMS.map((item) => {
                        const checked = isPropertiesPanelVisible && propertiesPanelMode === item.mode;
                        return (
                            <button
                                key={item.mode}
                                role="menuitemcheckbox"
                                aria-checked={checked}
                                onClick={() => {
                                    handleWindowPanelToggle(item.mode);
                                    setShowWindowMenu(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${checked ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                            >
                                <span>{item.label}</span>
                                <span className={`text-xs ${checked ? 'text-primary' : 'text-transparent'}`}>✓</span>
                            </button>
                        );
                    })}
                    <div className="my-1 border-t border-border/50" />
                    <button
                        role="menuitemcheckbox"
                        aria-checked={isPropertiesPanelVisible}
                        onClick={() => {
                            if (isPropertiesPanelVisible) {
                                setPanelState((prev) => {
                                    if (prev.mode === 'docked-left') return { ...prev, mode: 'collapsed-left' };
                                    if (prev.mode === 'docked-right') return { ...prev, mode: 'collapsed-right' };
                                    if (prev.mode === 'floating') return { ...prev, mode: 'collapsed-right', position: { x: 0, y: 0 } };
                                    return prev;
                                });
                            } else {
                                setPanelState((prev) => {
                                    if (prev.mode === 'collapsed-left') return { ...prev, mode: 'docked-left' };
                                    if (prev.mode === 'collapsed-right') return { ...prev, mode: 'docked-right' };
                                    return { ...prev, mode: 'docked-right' };
                                });
                            }
                            setShowWindowMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${isPropertiesPanelVisible ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                    >
                        <span>Show Properties Panel</span>
                        <span className={`text-xs ${isPropertiesPanelVisible ? 'text-primary' : 'text-transparent'}`}>✓</span>
                    </button>
                    <div className="my-1 border-t border-border/50" />
                    <button
                        role="menuitemcheckbox"
                        aria-checked={panelState.mode === 'docked-left'}
                        onClick={() => {
                            handleWindowDockMode('docked-left');
                            setShowWindowMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${(panelState.mode === 'docked-left') ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                    >
                        <span>Dock Left</span>
                        <span className={`text-xs ${(panelState.mode === 'docked-left') ? 'text-primary' : 'text-transparent'}`}>✓</span>
                    </button>
                    <button
                        role="menuitemcheckbox"
                        aria-checked={panelState.mode === 'docked-right'}
                        onClick={() => {
                            handleWindowDockMode('docked-right');
                            setShowWindowMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${(panelState.mode === 'docked-right') ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                    >
                        <span>Dock Right</span>
                        <span className={`text-xs ${(panelState.mode === 'docked-right') ? 'text-primary' : 'text-transparent'}`}>✓</span>
                    </button>
                    <button
                        role="menuitemcheckbox"
                        aria-checked={panelState.mode === 'floating'}
                        onClick={() => {
                            handleWindowDockMode('floating');
                            setShowWindowMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${(panelState.mode === 'floating') ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                    >
                        <span>Float Panel</span>
                        <span className={`text-xs ${(panelState.mode === 'floating') ? 'text-primary' : 'text-transparent'}`}>✓</span>
                    </button>
                </div>
            )}
        </div>
    );
}
