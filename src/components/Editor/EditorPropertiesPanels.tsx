'use client';

import type { ComponentProps, MouseEventHandler } from 'react';
import type * as fabric from 'fabric';
import { ChevronLeft, ChevronRight, GripHorizontal, Maximize, Minimize } from 'lucide-react';

import PropertiesPanel from '@/components/PropertiesPanel';
import type { PanelDockMode } from '@/components/Editor/editorView.types';

type PropertiesPanelProps = ComponentProps<typeof PropertiesPanel>;
type PanelMode = NonNullable<PropertiesPanelProps['panelMode']>;
type PanelState = {
    mode: PanelDockMode;
    position: { x: number; y: number };
    width: number;
};
type PanelPlacement = 'before-main' | 'after-main';

type PanelChromeControls = {
    panelState: PanelState;
    propertiesPanelMode: PanelMode;
    setPropertiesPanelMode: (mode: PanelMode) => void;
    handlePanelDragStart: MouseEventHandler<HTMLDivElement>;
    startPanelResize: MouseEventHandler<HTMLDivElement>;
    toggleCollapse: () => void;
    toggleFloat: () => void;
};

type PanelContentControls = {
    handleDuplicate: NonNullable<PropertiesPanelProps['onDuplicate']>;
    handleAssetSelect: NonNullable<PropertiesPanelProps['onAssetSelect']>;
    historyState: PropertiesPanelProps['historyState'];
    handleUndo: NonNullable<PropertiesPanelProps['onUndo']>;
    handleRedo: NonNullable<PropertiesPanelProps['onRedo']>;
    zoom: number;
    enablePanelRailHoverLabels: boolean;
    onOpenThreeDFromSelection: (imageUrl: string) => void;
};

type PanelBrushControls = {
    brushOptions: NonNullable<PropertiesPanelProps['brushOptions']>;
    onBrushPresetChange: NonNullable<PropertiesPanelProps['onBrushPresetChange']>;
    onBrushSizeChange: NonNullable<PropertiesPanelProps['onBrushSizeChange']>;
    onBrushHardnessChange: NonNullable<PropertiesPanelProps['onBrushHardnessChange']>;
    onBrushOpacityChange: NonNullable<PropertiesPanelProps['onBrushOpacityChange']>;
    onBrushFlowChange: NonNullable<PropertiesPanelProps['onBrushFlowChange']>;
    onBrushSmoothingChange: NonNullable<PropertiesPanelProps['onBrushSmoothingChange']>;
    onBrushBlendModeChange: NonNullable<PropertiesPanelProps['onBrushBlendModeChange']>;
};

interface EditorPropertiesPanelsProps {
    placement: PanelPlacement;
    canvas: fabric.Canvas | null;
    activeTool: string;
    setActiveTool: (tool: string) => void;
    chromeControls: PanelChromeControls;
    contentControls: PanelContentControls;
    brushControls: PanelBrushControls;
}

export default function EditorPropertiesPanels({
    placement,
    canvas,
    activeTool,
    setActiveTool,
    chromeControls,
    contentControls,
    brushControls,
}: EditorPropertiesPanelsProps) {
    const {
        panelState,
        propertiesPanelMode,
        setPropertiesPanelMode,
        handlePanelDragStart,
        startPanelResize,
        toggleCollapse,
        toggleFloat,
    } = chromeControls;
    const {
        handleDuplicate,
        handleAssetSelect,
        historyState,
        handleUndo,
        handleRedo,
        zoom,
        enablePanelRailHoverLabels,
        onOpenThreeDFromSelection,
    } = contentControls;
    const {
        brushOptions,
        onBrushPresetChange,
        onBrushSizeChange,
        onBrushHardnessChange,
        onBrushOpacityChange,
        onBrushFlowChange,
        onBrushSmoothingChange,
        onBrushBlendModeChange,
    } = brushControls;

    const handleLayerDblClick = (exitLayersToolOnFocus: boolean) => (obj?: fabric.Object) => {
        if (!obj || !canvas) {
            return;
        }

        canvas.setActiveObject(obj);
        canvas.requestRenderAll();

        if (exitLayersToolOnFocus && activeTool === 'layers') {
            setActiveTool('select');
        }
    };

    const renderPropertiesPanel = (exitLayersToolOnFocus: boolean) => (
        <PropertiesPanel
            canvas={canvas}
            activeTool={activeTool}
            panelMode={propertiesPanelMode}
            onPanelModeChange={setPropertiesPanelMode}
            onLayerDblClick={handleLayerDblClick(exitLayersToolOnFocus)}
            onMake3D={onOpenThreeDFromSelection}
            onDuplicate={handleDuplicate}
            onAssetSelect={handleAssetSelect}
            historyState={historyState}
            onUndo={handleUndo}
            onRedo={handleRedo}
            zoom={zoom}
            brushOptions={brushOptions}
            onBrushPresetChange={onBrushPresetChange}
            onBrushSizeChange={onBrushSizeChange}
            onBrushHardnessChange={onBrushHardnessChange}
            onBrushOpacityChange={onBrushOpacityChange}
            onBrushFlowChange={onBrushFlowChange}
            onBrushSmoothingChange={onBrushSmoothingChange}
            onBrushBlendModeChange={onBrushBlendModeChange}
            onActivatePaintTool={() => setActiveTool('paint')}
            enablePanelRailHoverLabels={enablePanelRailHoverLabels}
        />
    );

    return (
        <>
            {placement === 'before-main' && panelState.mode === 'docked-left' && (
                <aside style={{ width: panelState.width }} className="bg-card border-r flex flex-col z-10 shadow-xl overflow-hidden shrink-0 relative">
                    <div className="h-8 bg-muted border-b flex items-center justify-between px-2 cursor-move select-none" onMouseDown={handlePanelDragStart}>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground"><GripHorizontal size={14} /> Properties</div>
                        <div className="flex gap-1">
                            <button onClick={toggleFloat} className="p-0.5 hover:bg-background rounded"><Maximize size={12} /></button>
                            <button onClick={toggleCollapse} className="p-0.5 hover:bg-background rounded"><ChevronLeft size={12} /></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        {renderPropertiesPanel(false)}
                    </div>
                    <div
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/50 transition-colors z-50 translation-all delay-75"
                        onMouseDown={startPanelResize}
                    />
                </aside>
            )}

            {placement === 'before-main' && panelState.mode === 'collapsed-left' && (
                <div onClick={toggleCollapse} className="w-4 bg-muted border-r hover:bg-primary/10 cursor-pointer flex items-center justify-center transition-colors">
                    <ChevronRight size={14} className="text-muted-foreground" />
                </div>
            )}

            {placement === 'after-main' && panelState.mode === 'docked-right' && (
                <aside style={{ width: panelState.width }} className="bg-card border-l flex flex-col z-10 shadow-xl overflow-hidden shrink-0 relative">
                    <div className="h-8 bg-muted border-b flex items-center justify-between px-2 cursor-move select-none" onMouseDown={handlePanelDragStart}>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground"><GripHorizontal size={14} /> Properties</div>
                        <div className="flex gap-1">
                            <button onClick={toggleFloat} className="p-0.5 hover:bg-background rounded"><Maximize size={12} /></button>
                            <button onClick={toggleCollapse} className="p-0.5 hover:bg-background rounded"><ChevronRight size={12} /></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        {renderPropertiesPanel(true)}
                    </div>
                    <div
                        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/50 transition-colors z-50"
                        onMouseDown={startPanelResize}
                    />
                </aside>
            )}

            {placement === 'after-main' && panelState.mode === 'collapsed-right' && (
                <div onClick={toggleCollapse} className="w-4 bg-muted border-l hover:bg-primary/10 cursor-pointer flex items-center justify-center transition-colors">
                    <ChevronLeft size={14} className="text-muted-foreground" />
                </div>
            )}

            {placement === 'after-main' && panelState.mode === 'floating' && (
                <div
                    style={{
                        position: 'fixed',
                        left: panelState.position.x,
                        top: panelState.position.y,
                        width: panelState.width,
                        height: '70vh',
                    }}
                    className="z-50 shadow-2xl border rounded-xl overflow-hidden bg-card flex flex-col animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="h-8 bg-secondary border-b flex items-center justify-between px-2 cursor-move select-none" onMouseDown={handlePanelDragStart}>
                        <div className="flex items-center gap-2 text-xs font-semibold"><GripHorizontal size={14} /> Properties (Floating)</div>
                        <div className="flex gap-1">
                            <button onClick={toggleFloat} className="p-0.5 hover:bg-background rounded" title="Dock Right"><Minimize size={12} /></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        {renderPropertiesPanel(true)}
                    </div>
                </div>
            )}
        </>
    );
}
