import type { Dispatch, SetStateAction } from 'react';
import { ChevronDown } from 'lucide-react';

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
    setShowHelpMenu, handleSave, handleFitToScreen, handleResetZoomFromMenu, openPanelModeFromMenu, triggerToolbarTool,
    handleDuplicate, handleLayerDeleteFromMenu, handleLayerToggleLockFromMenu, menuLayerTarget, activeLayerOrderState,
    handleLayerOrderAction, handleSelectAllFromMenu, handleDeselectFromMenu, handleSelectionModify, handleUndo, handleRedo,
    historyState, handleZoom, gridType, setGridType, isPropertiesPanelVisible, propertiesPanelMode, handleWindowPanelToggle,
    setPanelState, panelState, handleWindowDockMode, onOpenSettings, isAdminUser, onOpenAdminArea, onOpenDocumentation,
    handleShowShortcutsFromMenu, handleShowAboutFromMenu,
}: EditorHeaderMenusProps) {
    return (
        <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border">
            <div className="relative order-1">
                <button
                    onClick={() => toggleEditorMenu('file')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-expanded={showFileMenu}
                >
                    <span>File</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showFileMenu ? 'rotate-180' : ''}`} />
                </button>
                {showFileMenu && (
                    <div data-testid="menu-file" className="absolute left-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                        <button
                            onClick={() => {
                                setShowFileMenu(false);
                                void handleSave();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Save
                        </button>
                        <button
                            onClick={() => {
                                openEditorMenu('export');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Export As...
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
                    <span>Image</span>
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
                            Crop Tool
                        </button>
                        <button
                            onClick={() => {
                                setShowImageMenu(false);
                                openPanelModeFromMenu('adjustments');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Adjustments Panel
                        </button>
                        <button
                            onClick={() => {
                                setShowImageMenu(false);
                                openPanelModeFromMenu('color');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Color Panel
                        </button>
                        <div className="my-1 border-t border-border/50" />
                        <button
                            onClick={() => {
                                setShowImageMenu(false);
                                handleFitToScreen();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Fit to Screen
                        </button>
                        <button
                            onClick={() => {
                                setShowImageMenu(false);
                                handleResetZoomFromMenu();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Reset Zoom (100%)
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
                    <span>Layer</span>
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
                            Duplicate Layer
                        </button>
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerDeleteFromMenu();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Delete Layer
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
                            {menuLayerTarget?.locked ? 'Unlock Layer' : 'Lock Layer'}
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
                            Bring Forward
                        </button>
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerOrderAction('move-down');
                            }}
                            disabled={!activeLayerOrderState.canMoveDown}
                            className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canMoveDown ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                        >
                            Send Backward
                        </button>
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerOrderAction('to-front');
                            }}
                            disabled={!activeLayerOrderState.canBringToFront}
                            className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canBringToFront ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                        >
                            Bring to Front
                        </button>
                        <button
                            onClick={() => {
                                setShowLayerMenu(false);
                                handleLayerOrderAction('to-back');
                            }}
                            disabled={!activeLayerOrderState.canSendToBack}
                            className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canSendToBack ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                        >
                            Send to Back
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
                handleSelectionModify={handleSelectionModify}
                triggerToolbarTool={triggerToolbarTool}
            />
            <div className="relative order-6">
                <button
                    onClick={() => toggleEditorMenu('filter')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-expanded={showFilterMenu}
                >
                    <span>Filter</span>
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
                            Blur Tool
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('sharpen');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Sharpen Tool
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('dodge');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Dodge Tool
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('burn');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Burn Tool
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('sponge');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Sponge Tool
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('healing');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Healing Brush
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('spot-healing');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Spot Healing Tool
                        </button>
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                triggerToolbarTool('remove');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Remove Tool
                        </button>
                        <div className="my-1 border-t border-border/50" />
                        <button
                            onClick={() => {
                                setShowFilterMenu(false);
                                openPanelModeFromMenu('adjustments');
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Open Adjustments Panel
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
                    <span>Edit</span>
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
                            Undo
                        </button>
                        <button
                            onClick={() => {
                                setShowEditMenu(false);
                                handleRedo();
                            }}
                            disabled={historyState.redo < 1}
                            className={`w-full text-left px-4 py-2.5 text-sm ${historyState.redo < 1 ? 'text-muted-foreground/40 cursor-not-allowed' : 'hover:bg-secondary/50'}`}
                        >
                            Redo
                        </button>
                        <button
                            onClick={() => {
                                setShowEditMenu(false);
                                void handleDuplicate();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Duplicate
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
                    <span>View</span>
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
                            Fit to Screen
                        </button>
                        <button
                            onClick={() => {
                                setShowViewMenu(false);
                                handleZoom(0.1);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Zoom In
                        </button>
                        <button
                            onClick={() => {
                                setShowViewMenu(false);
                                handleZoom(-0.1);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            Zoom Out
                        </button>
                        <div className="my-1 border-t border-border/50" />
                        <button
                            onClick={() => {
                                setShowViewMenu(false);
                                setGridType((prev) => (prev === 'none' ? 'rule-of-thirds' : 'none'));
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                        >
                            {gridType === 'none' ? 'Show Grid' : 'Hide Grid'}
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
