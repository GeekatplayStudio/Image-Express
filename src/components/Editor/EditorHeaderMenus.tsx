import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { OpenableDesign } from '@/components/Editor/OpenDesignModal';

import type { GridType } from '@/components/GridOverlay';
import type { EditorMenuId } from '@/components/Editor/useEditorMenus';
import type { PanelDockMode } from '@/components/Editor/editorView.types';
import type { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';
import EditorHeaderSelectMenu from '@/components/Editor/EditorHeaderSelectMenu';
import EditorHeaderWindowMenu from '@/components/Editor/EditorHeaderWindowMenu';
import EditorHeaderSettingsMenu from '@/components/Editor/EditorHeaderSettingsMenu';
import EditorHeaderHelpMenu from '@/components/Editor/EditorHeaderHelpMenu';
type BooleanStateSetter = (next: boolean | ((prev: boolean) => boolean)) => void;
type GridStateSetter = (next: GridType | ((prev: GridType) => GridType)) => void;
type LayerOrderAction = 'move-up' | 'move-down' | 'to-front' | 'to-back';
type LayerOrderState = { canMoveUp: boolean; canMoveDown: boolean; canBringToFront: boolean; canSendToBack: boolean };
type PanelState = { mode: PanelDockMode; position: { x: number; y: number }; width: number };

type EditorHeaderMenusProps = {
    showFileMenu: boolean;
    showEditMenu: boolean;
    showImageMenu: boolean;
    showLayerMenu: boolean;
    showSelectMenu: boolean;
    showFilterMenu: boolean;
    showViewMenu: boolean;
    showWindowMenu: boolean;
    showSettingsMenu: boolean;
    showHelpMenu: boolean;
    toggleEditorMenu: (menu: EditorMenuId) => void;
    openEditorMenu: (menu: EditorMenuId) => void;
    setShowFileMenu: BooleanStateSetter;
    setShowEditMenu: BooleanStateSetter;
    setShowImageMenu: BooleanStateSetter;
    setShowLayerMenu: BooleanStateSetter;
    setShowSelectMenu: BooleanStateSetter;
    setShowFilterMenu: BooleanStateSetter;
    setShowViewMenu: BooleanStateSetter;
    setShowWindowMenu: BooleanStateSetter;
    setShowSettingsMenu: BooleanStateSetter;
    setShowHelpMenu: BooleanStateSetter;
    handleSave: () => Promise<void>;
    onOpenDesignPicker: () => void;
    onOpenRecentDesign: (design: OpenableDesign) => void;
    autosaveEnabled: boolean;
    onToggleAutosave: (enabled: boolean) => void;
    handleFitToScreen: () => void;
    handleResetZoomFromMenu: () => void;
    openPanelModeFromMenu: (mode: PanelRailMode) => void;
    triggerToolbarTool: (toolName: string) => void;
    handleDuplicate: () => Promise<void>;
    handleLayerDeleteFromMenu: () => void;
    handleLayerToggleLockFromMenu: () => void;
    menuLayerTarget: { locked?: boolean } | null;
    activeLayerOrderState: LayerOrderState;
    handleLayerOrderAction: (action: LayerOrderAction) => void;
    handleSelectAllFromMenu: () => void;
    handleDeselectFromMenu: () => void;
    handleMaskFromSelection: () => void;
    handleSelectionModify: (direction: 'expand' | 'contract') => void;
    handleUndo: () => void;
    handleRedo: () => void;
    historyState: { undo: number; redo: number };
    handleZoom: (stepDelta: number) => void;
    gridType: GridType;
    setGridType: GridStateSetter;
    isPropertiesPanelVisible: boolean;
    propertiesPanelMode: PanelRailMode;
    handleWindowPanelToggle: (mode: PanelRailMode) => void;
    setPanelState: Dispatch<SetStateAction<PanelState>>;
    panelState: PanelState;
    handleWindowDockMode: (mode: 'docked-left' | 'docked-right' | 'floating') => void;
    onOpenSettings: () => void;
    isAdminUser: boolean;
    onOpenAdminArea?: () => void;
    onOpenDocumentation?: () => void;
    handleShowShortcutsFromMenu: () => void;
    handleShowAboutFromMenu: () => Promise<void>;
};

export default function EditorHeaderMenus({
    showFileMenu, showEditMenu, showImageMenu, showLayerMenu, showSelectMenu, showFilterMenu, showViewMenu, showWindowMenu,
    showSettingsMenu, showHelpMenu, toggleEditorMenu, openEditorMenu, setShowFileMenu, setShowEditMenu, setShowImageMenu,
    setShowLayerMenu, setShowSelectMenu, setShowFilterMenu, setShowViewMenu, setShowWindowMenu, setShowSettingsMenu,
    setShowHelpMenu, handleSave, onOpenDesignPicker, onOpenRecentDesign, autosaveEnabled, onToggleAutosave, handleFitToScreen, handleResetZoomFromMenu, openPanelModeFromMenu, triggerToolbarTool,
    handleDuplicate, handleLayerDeleteFromMenu, handleLayerToggleLockFromMenu, menuLayerTarget, activeLayerOrderState,
    handleLayerOrderAction, handleSelectAllFromMenu, handleDeselectFromMenu, handleMaskFromSelection, handleSelectionModify, handleUndo, handleRedo,
    historyState, handleZoom, gridType, setGridType, isPropertiesPanelVisible, propertiesPanelMode, handleWindowPanelToggle,
    setPanelState, panelState, handleWindowDockMode, onOpenSettings, isAdminUser, onOpenAdminArea, onOpenDocumentation,
    handleShowShortcutsFromMenu, handleShowAboutFromMenu,
}: EditorHeaderMenusProps) {
    const { t } = useI18n();
    const [recentDesigns, setRecentDesigns] = useState<OpenableDesign[]>([]);
    const [showRecentSubmenu, setShowRecentSubmenu] = useState(false);

    // Fetch once per menu open — cheap, and always fresh for "recent".
    useEffect(() => {
        if (!showFileMenu) {
            // Close the submenu when the File menu itself closes.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShowRecentSubmenu(false);
            return;
        }
        let cancelled = false;
        fetch('/api/designs/list')
            .then(async (res) => {
                if (!res.ok) return { designs: [] };
                const contentType = res.headers.get('content-type') || '';
                if (!contentType.toLowerCase().includes('application/json')) return { designs: [] };
                return res.json() as Promise<{ designs?: OpenableDesign[] }>;
            })
            .then((json) => {
                if (cancelled) return;
                const sorted = [...(json.designs ?? [])].sort((a, b) => (
                    new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
                ));
                setRecentDesigns(sorted.slice(0, 5));
            })
            .catch(() => {
                if (!cancelled) setRecentDesigns([]);
            });
        return () => { cancelled = true; };
    }, [showFileMenu]);

    return (
        <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border">
            <div className="relative order-1">
                <button
                    onClick={() => toggleEditorMenu('file')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-expanded={showFileMenu}
                >
                    <span>{t('menu.file')}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showFileMenu ? 'rotate-180' : ''}`} />
                </button>
                {showFileMenu && (
                    <div data-testid="menu-file" className="absolute left-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                        <button
                            onClick={() => {
                                setShowFileMenu(false);
                                onOpenDesignPicker();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                            data-testid="menu-file-open"
                        >
                            {t('editor.openDesign')}
                        </button>
                        <div
                            className="relative"
                            onMouseEnter={() => setShowRecentSubmenu(true)}
                            onMouseLeave={() => setShowRecentSubmenu(false)}
                        >
                            <button
                                onClick={() => setShowRecentSubmenu((prev) => !prev)}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center justify-between"
                                disabled={recentDesigns.length === 0}
                                data-testid="menu-file-recent"
                            >
                                <span className={recentDesigns.length === 0 ? 'text-muted-foreground/50' : undefined}>
                                    {t('editor.recentFiles')}
                                </span>
                                {recentDesigns.length > 0 && <ChevronRight size={14} />}
                            </button>
                            {showRecentSubmenu && recentDesigns.length > 0 && (
                                <div
                                    data-testid="menu-file-recent-list"
                                    className="absolute left-full top-0 ml-1 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-left-2 z-50"
                                >
                                    {recentDesigns.map((design) => (
                                        <button
                                            key={design.id}
                                            onClick={() => {
                                                setShowFileMenu(false);
                                                setShowRecentSubmenu(false);
                                                onOpenRecentDesign(design);
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 truncate"
                                            title={design.name}
                                        >
                                            {design.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="my-1 border-t border-border/50" />
                        <button
                            onClick={() => {
                                setShowFileMenu(false);
                                void handleSave();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('common.save')}
                        </button>
                        <button
                            onClick={() => {
                                onToggleAutosave(!autosaveEnabled);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center justify-between"
                            aria-pressed={autosaveEnabled}
                            data-testid="menu-file-autosave"
                        >
                            <span>{t('editor.autosave')}</span>
                            {autosaveEnabled && <Check size={14} className="text-primary" />}
                        </button>
                        <button
                            onClick={() => {
                                openEditorMenu('export');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('editor.exportAs')}
                        </button>
                    </div>
                )}
            </div>
            <div className="relative order-3">
                <button
                    onClick={() => toggleEditorMenu('image')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-expanded={showImageMenu}
                >
                    <span>{t('menu.image')}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showImageMenu ? 'rotate-180' : ''}`} />
                </button>
                {showImageMenu && (
                    <div data-testid="menu-image" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                        <button
                            onClick={() => {
                                setShowImageMenu(false);
                                triggerToolbarTool('crop');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.cropTool')}
                        </button>
                        <button
                            onClick={() => {
                                setShowImageMenu(false);
                                openPanelModeFromMenu('adjustments');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.adjustmentsPanel')}
                        </button>
                        <button
                            onClick={() => {
                                setShowImageMenu(false);
                                openPanelModeFromMenu('color');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.colorPanel')}
                        </button>
                        <div className="my-1 border-t border-border/50" />
                        <button
                            onClick={() => {
                                setShowImageMenu(false);
                                handleFitToScreen();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.fitToScreen')}
                        </button>
                        <button
                            onClick={() => {
                                setShowImageMenu(false);
                                handleResetZoomFromMenu();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.resetZoom')}
                        </button>
                    </div>
                )}
            </div>
            <div className="relative order-4">
                <button
                    onClick={() => toggleEditorMenu('layer')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-expanded={showLayerMenu}
                >
                    <span>{t('menu.layer')}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showLayerMenu ? 'rotate-180' : ''}`} />
                </button>
                {showLayerMenu && (
                    <div data-testid="menu-layer" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                void handleDuplicate();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.duplicateLayer')}
                        </button>
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerDeleteFromMenu();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.deleteLayer')}
                        </button>
                        <div className="my-1 border-t border-border/50" />
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerToggleLockFromMenu();
                            }}
                            disabled={!menuLayerTarget}
                            className={`w-full text-left px-4 py-2.5 text-sm ${menuLayerTarget ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                        >
                            {menuLayerTarget?.locked ? t('menu.unlockLayer') : t('menu.lockLayer')}
                        </button>
                        <div className="my-1 border-t border-border/50" />
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerOrderAction('move-up');
                            }}
                            disabled={!activeLayerOrderState.canMoveUp}
                            className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canMoveUp ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                        >
                            {t('menu.bringForward')}
                        </button>
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerOrderAction('move-down');
                            }}
                            disabled={!activeLayerOrderState.canMoveDown}
                            className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canMoveDown ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                        >
                            {t('menu.sendBackward')}
                        </button>
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerOrderAction('to-front');
                            }}
                            disabled={!activeLayerOrderState.canBringToFront}
                            className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canBringToFront ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                        >
                            {t('menu.bringToFront')}
                        </button>
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerOrderAction('to-back');
                            }}
                            disabled={!activeLayerOrderState.canSendToBack}
                            className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canSendToBack ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                        >
                            {t('menu.sendToBack')}
                        </button>
                    </div>
                )}
            </div>
            <EditorHeaderSelectMenu
                showSelectMenu={showSelectMenu}
                toggleEditorMenu={() => toggleEditorMenu('select')}
                setShowSelectMenu={setShowSelectMenu}
                handleSelectAllFromMenu={handleSelectAllFromMenu}
                handleDeselectFromMenu={handleDeselectFromMenu}
                handleMaskFromSelection={handleMaskFromSelection}
                handleSelectionModify={handleSelectionModify}
                triggerToolbarTool={triggerToolbarTool}
            />
            <div className="relative order-6">
                <button
                    onClick={() => toggleEditorMenu('filter')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-expanded={showFilterMenu}
                >
                    <span>{t('menu.filter')}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showFilterMenu ? 'rotate-180' : ''}`} />
                </button>
                {showFilterMenu && (
                    <div data-testid="menu-filter" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('blur');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('toolbar.blurTool')}
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('sharpen');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('toolbar.sharpenTool')}
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('dodge');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('toolbar.dodgeTool')}
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('burn');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('toolbar.burnTool')}
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('sponge');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('toolbar.spongeTool')}
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('healing');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('toolbar.healingBrush')}
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('spot-healing');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.spotHealingTool')}
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('remove');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('toolbar.removeTool')}
                        </button>
                        <div className="my-1 border-t border-border/50" />
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                openPanelModeFromMenu('adjustments');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.openAdjustmentsPanel')}
                        </button>
                    </div>
                )}
            </div>
            <div className="relative order-2">
                <button
                    onClick={() => toggleEditorMenu('edit')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-expanded={showEditMenu}
                >
                    <span>{t('menu.edit')}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showEditMenu ? 'rotate-180' : ''}`} />
                </button>
                {showEditMenu && (
                    <div data-testid="menu-edit" className="absolute left-0 top-full mt-2 w-52 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                        <button
                            onClick={() => {
                                setShowEditMenu(false);
                                handleUndo();
                            }}
                            disabled={historyState.undo < 2}
                            className={`w-full text-left px-4 py-2.5 text-sm ${historyState.undo < 2 ? 'text-muted-foreground/40 cursor-not-allowed' : 'hover:bg-secondary/50'}`}
                        >
                            {t('common.undo')}
                        </button>
                        <button
                            onClick={() => {
                                setShowEditMenu(false);
                                handleRedo();
                            }}
                            disabled={historyState.redo < 1}
                            className={`w-full text-left px-4 py-2.5 text-sm ${historyState.redo < 1 ? 'text-muted-foreground/40 cursor-not-allowed' : 'hover:bg-secondary/50'}`}
                        >
                            {t('common.redo')}
                        </button>
                        <button
                            onClick={() => {
                                setShowEditMenu(false);
                                void handleDuplicate();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('common.duplicate')}
                        </button>
                    </div>
                )}
            </div>
            <div className="relative order-7">
                <button
                    onClick={() => toggleEditorMenu('view')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-expanded={showViewMenu}
                >
                    <span>{t('menu.view')}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showViewMenu ? 'rotate-180' : ''}`} />
                </button>
                {showViewMenu && (
                    <div data-testid="menu-view" className="absolute left-0 top-full mt-2 w-52 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                        <button
                            onClick={() => {
                                setShowViewMenu(false);
                                handleFitToScreen();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.fitToScreen')}
                        </button>
                        <button
                            onClick={() => {
                                setShowViewMenu(false);
                                handleZoom(0.1);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.zoomIn')}
                        </button>
                        <button
                            onClick={() => {
                                setShowViewMenu(false);
                                handleZoom(-0.1);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {t('menu.zoomOut')}
                        </button>
                        <div className="my-1 border-t border-border/50" />
                        <button
                            onClick={() => {
                                setShowViewMenu(false);
                                setGridType((prev) => (prev === 'none' ? 'rule-of-thirds' : 'none'));
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {gridType === 'none' ? t('menu.showGrid') : t('menu.hideGrid')}
                        </button>
                    </div>
                )}
            </div>
            <EditorHeaderWindowMenu
                showWindowMenu={showWindowMenu}
                toggleEditorMenu={() => toggleEditorMenu('window')}
                setShowWindowMenu={setShowWindowMenu}
                isPropertiesPanelVisible={isPropertiesPanelVisible}
                propertiesPanelMode={propertiesPanelMode}
                handleWindowPanelToggle={handleWindowPanelToggle}
                setPanelState={setPanelState}
                panelState={panelState}
                handleWindowDockMode={handleWindowDockMode}
            />
            <EditorHeaderSettingsMenu
                showSettingsMenu={showSettingsMenu}
                toggleEditorMenu={() => toggleEditorMenu('settings')}
                setShowSettingsMenu={setShowSettingsMenu}
                onOpenSettings={onOpenSettings}
                isAdminUser={isAdminUser}
                onOpenAdminArea={onOpenAdminArea}
            />
            <EditorHeaderHelpMenu
                showHelpMenu={showHelpMenu}
                toggleEditorMenu={() => toggleEditorMenu('help')}
                setShowHelpMenu={setShowHelpMenu}
                onOpenDocumentation={onOpenDocumentation}
                handleShowShortcutsFromMenu={handleShowShortcutsFromMenu}
                handleShowAboutFromMenu={handleShowAboutFromMenu}
            />
        </div>
    );
}
